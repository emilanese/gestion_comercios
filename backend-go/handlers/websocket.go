package handlers

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// ─── Tipos de mensajes WS ─────────────────────────────────────────────────────

const (
	MsgTypeStockUpdate      = "STOCK_UPDATE"
	MsgTypePrecioUpdate     = "PRECIO_UPDATE"
	MsgTypePromoActivada    = "PROMO_ACTIVADA"
	MsgTypePromoDesactivada = "PROMO_DESACTIVADA"
	MsgTypeTicketConfirmado = "TICKET_CONFIRMADO"
	MsgTypeTurnoAbierto     = "TURNO_ABIERTO"
	MsgTypeTurnoCerrado     = "TURNO_CERRADO"
	MsgTypePongSync         = "PONG_SYNC"
	// OCC
	MsgTypeSyncMutation    = "SYNC_MUTATION"
	MsgTypeVersionConflict = "VERSION_CONFLICT"
	// Resiliencia POS offline
	MsgTypePosHandshake   = "POS_HANDSHAKE"
	MsgTypeTicketsPending = "TICKETS_PENDING"
	MsgTypeDeltaSync      = "DELTA_SYNC"
	// Autorizaciones remotas (CAJERO → ENCARGADO/ADMIN)
	MsgTypeAuthRequest = "AUTH_REQUEST" // CAJERO solicita acción crítica
	MsgTypeAuthAck     = "AUTH_ACK"     // Autorizador aprueba
	MsgTypeAuthReject  = "AUTH_REJECT"  // Autorizador rechaza (o nadie disponible)
)

// ─── BroadcastMessage ─────────────────────────────────────────────────────────

// BroadcastMessage es el envelope de un mensaje a enviar a una sucursal.
type BroadcastMessage struct {
	SucursalID string
	Payload    interface{}
	ExceptClient *WSClient  // si != nil, no se envía a este cliente
	TargetRol  string       // si != "", solo envía a clientes con ese rol
	TargetDeviceID string   // si != "", solo envía a ese device
}

// ─── WSClient ─────────────────────────────────────────────────────────────────

// WSClient representa una conexión WebSocket autenticada.
type WSClient struct {
	Hub        *WSHub
	Conn       *websocket.Conn
	Send       chan interface{}
	SucursalID string
	DeviceID   string
	Rol        string
}

// ReadPump lee mensajes del cliente y los despacha al Hub.
func (c *WSClient) ReadPump() {
	defer func() {
		c.Hub.Unregister <- c
		c.Conn.Close()
	}()

	ctx := context.Background()

	c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		var msg map[string]interface{}
		if err := c.Conn.ReadJSON(&msg); err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[WS] Error inesperado device=%s: %v", c.DeviceID, err)
			}
			break
		}

		msgType, _ := msg["type"].(string)

		switch msgType {

		// ── Heartbeat ────────────────────────────────────────────────────
		case "PING_SYNC":
			c.Send <- map[string]interface{}{
				"type":      MsgTypePongSync,
				"timestamp": time.Now().UnixMilli(),
			}

		// ── OCC: Mutación del Backoffice con control de versiones ─────────
		// El Gestor Cloud actúa como validador de secuencia usando Redis CAS.
		// Si base_version coincide con el estado Redis → se acepta y broadcast.
		// Si no → VERSION_CONFLICT devuelto directamente al sender.
		case MsgTypeSyncMutation:
			baseVersion, _ := msg["base_version"].(float64)
			newVersion, _  := msg["new_version"].(float64)
			mutationID, _  := msg["mutation_id"].(string)

			ok, err := c.Hub.VersionStore.AtomicAdvance(
				ctx, c.SucursalID, int64(baseVersion), int64(newVersion),
			)
			if err != nil {
				log.Printf("[WS] Redis CAS error sucursal=%s: %v", c.SucursalID, err)
			}

			if ok {
				// Broadcast a todos excepto el sender (que ya aplicó el cambio localmente)
				broadcastPayload := map[string]interface{}{
					"type":        msg["payload_type"],
					"new_version": int64(newVersion),
					"data":        msg["data"],
					"from_device": c.DeviceID,
				}
				c.Hub.BroadcastToSucursalExcept(c.SucursalID, broadcastPayload, c)
				log.Printf("[OCC] ✅ Mutación aceptada sucursal=%s v%d→v%d device=%s",
					c.SucursalID, int64(baseVersion), int64(newVersion), c.DeviceID)
			} else {
				// VERSION_CONFLICT: devolver al sender con la versión real actual
				currentVersion, _ := c.Hub.VersionStore.GetVersion(ctx, c.SucursalID)
				c.Send <- map[string]interface{}{
					"type":            MsgTypeVersionConflict,
					"mutation_id":     mutationID,
					"current_version": currentVersion,
				}
				log.Printf("[OCC] ⚡ VERSION_CONFLICT sucursal=%s esperaba=%d actual=%d device=%s",
					c.SucursalID, int64(baseVersion), currentVersion, c.DeviceID)
			}

		// ── Resiliencia POS: Handshake de reconexión ──────────────────────
		// El POS informa su última versión conocida al Backoffice (GESTOR).
		// Go no retiene este mensaje: si el Backoffice no está conectado → destruido.
		case MsgTypePosHandshake:
			msg["from_device"] = c.DeviceID
			sent := c.Hub.BroadcastToRol(c.SucursalID, msg, "GESTOR")
			if sent == 0 {
				log.Printf("[WS] POS_HANDSHAKE destruido — Backoffice offline (sucursal=%s)", c.SucursalID)
			}

		// ── Resiliencia POS: Tickets offline ──────────────────────────────
		// El POS despacha su cola de tickets PENDIENTES al Backoffice.
		// Go enruta; el Backoffice hace UPSERT por UUID inmutable.
		case MsgTypeTicketsPending:
			msg["from_device"] = c.DeviceID
			sent := c.Hub.BroadcastToRol(c.SucursalID, msg, "GESTOR")
			if sent == 0 {
				// Backoffice offline: el POS debe reintentar en la próxima conexión
				c.Send <- map[string]interface{}{
					"type":  "TICKETS_PENDING_RETRY",
					"reason": "Backoffice no disponible — reintentá más tarde",
				}
			}

		// ── Resiliencia POS: Delta de catálogo (Backoffice → POS) ─────────
		// El Backoffice envía el paquete de deltas a un POS específico.
		// Go rutea solo a ese device.
		case MsgTypeDeltaSync:
			targetDeviceID, _ := msg["target_device_id"].(string)
			if targetDeviceID == "" {
				log.Printf("[WS] DELTA_SYNC sin target_device_id — ignorado")
				break
			}
			delivered := c.Hub.SendToDevice(c.SucursalID, targetDeviceID, msg)
			if !delivered {
				log.Printf("[WS] DELTA_SYNC destruido — device %s offline (sucursal=%s)",
					targetDeviceID, c.SucursalID)
			}

		// ── Ticket confirmado por Backoffice → POS ────────────────────────
		case MsgTypeTicketConfirmado:
			targetDeviceID, _ := msg["target_device_id"].(string)
			if targetDeviceID != "" {
				c.Hub.SendToDevice(c.SucursalID, targetDeviceID, msg)
			}

		// ── Autorizaciones remotas ────────────────────────────────────────
		// El CAJERO solicita acción crítica → se rutea a ENCARGADO/ADMIN online.
		// Si nadie disponible → AUTH_REJECT inmediato (sin buffer).
		case MsgTypeAuthRequest:
			requestID, _ := msg["request_id"].(string)
			actionType, _ := msg["action_type"].(string)
			msg["from_device"] = c.DeviceID

			sentAdmin := c.Hub.BroadcastToRol(c.SucursalID, msg, RolAdmin)
			sentEncargado := c.Hub.BroadcastToRol(c.SucursalID, msg, RolEncargado)

			if sentAdmin == 0 && sentEncargado == 0 {
				// Nadie puede autorizar → rechazar inmediatamente
				c.Send <- map[string]interface{}{
					"type":          MsgTypeAuthReject,
					"request_id":    requestID,
					"reason":        "No hay autorizadores disponibles en este momento",
					"action_type":   actionType,
				}
				log.Printf("[Auth] ❌ AUTH_REQUEST sin autorizadores — request=%s device=%s", requestID, c.DeviceID)
			} else {
				log.Printf("[Auth] 🔔 AUTH_REQUEST enviado a %d autorizador(es) — request=%s action=%s",
					sentAdmin+sentEncargado, requestID, actionType)
			}

		// El autorizador (ENCARGADO/ADMIN) responde AUTH_ACK o AUTH_REJECT.
		// Go lo rutea directamente al POS solicitante.
		case MsgTypeAuthAck, MsgTypeAuthReject:
			targetDeviceID, _ := msg["target_device_id"].(string)
			requestID, _  := msg["request_id"].(string)
			msg["autorizador_device"] = c.DeviceID
			msg["autorizador_rol"]    = c.Rol

			if targetDeviceID != "" {
				delivered := c.Hub.SendToDevice(c.SucursalID, targetDeviceID, msg)
				if delivered {
					log.Printf("[Auth] ✅ %s entregado — request=%s autorizador=%s → pos=%s",
						msgType, requestID, c.DeviceID, targetDeviceID)
				} else {
					log.Printf("[Auth] ⚠️  %s no entregado — POS %s offline", msgType, targetDeviceID)
				}
			}

		case "TICKET_PENDIENTE":
			log.Printf("[WS] Device %s reporta ticket pendiente (legacy)", c.DeviceID)

		default:
			log.Printf("[WS] Mensaje tipo '%s' de device=%s — no manejado", msgType, c.DeviceID)
		}
	}
}

// WritePump escribe mensajes al cliente y envía pings periódicos.
func (c *WSClient) WritePump() {
	ticker := time.NewTicker(54 * time.Second)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.Conn.WriteJSON(message); err != nil {
				return
			}
		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// ─── WSHub ────────────────────────────────────────────────────────────────────

// WSHub gestiona las conexiones WebSocket organizadas por sucursal.
type WSHub struct {
	rooms        map[string]map[*WSClient]bool
	mu           sync.RWMutex
	Register     chan *WSClient
	Unregister   chan *WSClient
	Broadcast    chan BroadcastMessage
	VersionStore *VersionStore
}

// NewWSHub crea un Hub con su VersionStore.
func NewWSHub(vs *VersionStore) *WSHub {
	return &WSHub{
		rooms:        make(map[string]map[*WSClient]bool),
		Register:     make(chan *WSClient, 64),
		Unregister:   make(chan *WSClient, 64),
		Broadcast:    make(chan BroadcastMessage, 512),
		VersionStore: vs,
	}
}

// Run es el goroutine principal del Hub.
func (h *WSHub) Run() {
	for {
		select {
		case client := <-h.Register:
			h.mu.Lock()
			if h.rooms[client.SucursalID] == nil {
				h.rooms[client.SucursalID] = make(map[*WSClient]bool)
			}
			h.rooms[client.SucursalID][client] = true
			count := len(h.rooms[client.SucursalID])
			h.mu.Unlock()
			// Inicializar versión en Redis al conectar el primer device de la sucursal
			if h.VersionStore != nil {
				h.VersionStore.InitVersion(context.Background(), client.SucursalID)
			}
			log.Printf("[Hub] ✅ Device %s conectado → sucursal %s (%d dispositivos) rol=%s",
				client.DeviceID, client.SucursalID, count, client.Rol)

		case client := <-h.Unregister:
			h.mu.Lock()
			if room, ok := h.rooms[client.SucursalID]; ok {
				if _, ok := room[client]; ok {
					delete(room, client)
					close(client.Send)
					if len(room) == 0 {
						delete(h.rooms, client.SucursalID)
					}
				}
			}
			h.mu.Unlock()
			log.Printf("[Hub] Device %s desconectado de sucursal %s", client.DeviceID, client.SucursalID)

		case msg := <-h.Broadcast:
			h.mu.RLock()
			room := h.rooms[msg.SucursalID]
			h.mu.RUnlock()
			for client := range room {
				if msg.ExceptClient != nil && client == msg.ExceptClient {
					continue
				}
				if msg.TargetRol != "" && client.Rol != msg.TargetRol {
					continue
				}
				if msg.TargetDeviceID != "" && client.DeviceID != msg.TargetDeviceID {
					continue
				}
				select {
				case client.Send <- msg.Payload:
				default:
					go func(c *WSClient) { h.Unregister <- c }(client)
				}
			}
		}
	}
}

// ─── Métodos de enrutamiento ──────────────────────────────────────────────────

// BroadcastToSucursal envía a todos los dispositivos de una sucursal.
func (h *WSHub) BroadcastToSucursal(sucursalID string, payload interface{}) {
	h.Broadcast <- BroadcastMessage{SucursalID: sucursalID, Payload: payload}
}

// BroadcastToSucursalExcept envía a todos EXCEPTO al cliente indicado.
// Evita que el sender reciba su propio mensaje.
func (h *WSHub) BroadcastToSucursalExcept(sucursalID string, payload interface{}, except *WSClient) {
	h.Broadcast <- BroadcastMessage{SucursalID: sucursalID, Payload: payload, ExceptClient: except}
}

// BroadcastToRol envía solo a los clientes con un rol específico.
// Retorna la cantidad de dispositivos que recibieron el mensaje (0 = nadie conectado → destruir).
func (h *WSHub) BroadcastToRol(sucursalID string, payload interface{}, rol string) int {
	h.mu.RLock()
	room := h.rooms[sucursalID]
	h.mu.RUnlock()
	count := 0
	for client := range room {
		if client.Rol == rol {
			count++
		}
	}
	if count > 0 {
		h.Broadcast <- BroadcastMessage{SucursalID: sucursalID, Payload: payload, TargetRol: rol}
	}
	return count
}

// SendToDevice envía un mensaje a un dispositivo específico por ID.
// Retorna true si el device estaba conectado y recibió el mensaje.
// Retorna false si no estaba online → mensaje destruido (sin buffer en la nube).
func (h *WSHub) SendToDevice(sucursalID string, deviceID string, payload interface{}) bool {
	h.mu.RLock()
	room := h.rooms[sucursalID]
	h.mu.RUnlock()
	for client := range room {
		if client.DeviceID == deviceID {
			select {
			case client.Send <- payload:
				return true
			default:
				go func(c *WSClient) { h.Unregister <- c }(client)
				return false
			}
		}
	}
	return false
}

// ConnectedDevices retorna la cantidad de dispositivos conectados en una sucursal.
func (h *WSHub) ConnectedDevices(sucursalID string) int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.rooms[sucursalID])
}
