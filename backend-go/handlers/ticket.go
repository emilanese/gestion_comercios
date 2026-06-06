package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"time"
)

// ─── Tipos ────────────────────────────────────────────────────────────────────

type TicketItemRequest struct {
	ProductoID     string  `json:"productoID"`
	NombreProducto string  `json:"nombreProducto"`
	EAN            string  `json:"ean"`
	Cantidad       int     `json:"cantidad"`
	PrecioUnitario float64 `json:"precioUnitario"`
	PrecioFinal    float64 `json:"precioFinal"`
	Descuento      float64 `json:"descuento"`
	PromocionID    string  `json:"promocionID,omitempty"`
}

type TicketPagoRequest struct {
	TipoPago  string  `json:"tipoPago"`   // EFECTIVO | DEBITO | CREDITO | QR | TRANSFERENCIA
	Monto     float64 `json:"monto"`
}

type ConfirmTicketRequest struct {
	TurnoID        string              `json:"turnoID"`
	Total          float64             `json:"total"`
	TotalDescuento float64             `json:"totalDescuento"`
	Items          []TicketItemRequest `json:"items"`
	Pagos          []TicketPagoRequest `json:"pagos"`
}

// ─── ConfirmTicketHandler — POST /tickets/confirm ─────────────────────────────
// Crea y confirma un ticket de venta asociado a un turno activo.
// Actualiza stock de productos y notifica por WebSocket.
func (h *Handler) ConfirmTicketHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")

	comercioID := r.Header.Get("X-Comercio-ID")
	sucursalID := r.Header.Get("X-Sucursal-ID")

	var req ConfirmTicketRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "JSON inválido"})
		return
	}

	// Validaciones básicas
	if req.TurnoID == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "turnoID es requerido"})
		return
	}
	if len(req.Items) == 0 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "El ticket debe tener al menos 1 ítem"})
		return
	}
	if req.Total <= 0 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "El total debe ser mayor a 0"})
		return
	}

	// Verificar que el turno existe y está ABIERTO
	var turnoEstado string
	err := h.DB.QueryRow(`SELECT estado FROM turnos WHERE id = $1`, req.TurnoID).Scan(&turnoEstado)
	if err == sql.ErrNoRows {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "Turno no encontrado"})
		return
	}
	if turnoEstado != "ABIERTO" {
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "El turno no está abierto"})
		return
	}

	now := time.Now().UnixMilli()

	// ── Iniciar transacción ───────────────────────────────────────────────────
	tx, err := h.DB.Begin()
	if err != nil {
		log.Printf("[ConfirmTicket] Error iniciando tx: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "Error interno"})
		return
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	// 1. Insertar ticket
	var ticketID string
	err = tx.QueryRow(`
		INSERT INTO tickets (turno_id, sucursal_id, comercio_id, total, total_descuento, estado, created_at, confirmed_at)
		VALUES ($1, $2, $3, $4, $5, 'CONFIRMADO', $6, $6)
		RETURNING id
	`, req.TurnoID, sucursalID, comercioID, req.Total, req.TotalDescuento, now).Scan(&ticketID)
	if err != nil {
		log.Printf("[ConfirmTicket] Error insertando ticket: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "Error guardando ticket"})
		return
	}

	// 2. Insertar ítems y descontar stock
	for _, item := range req.Items {
		_, err = tx.Exec(`
			INSERT INTO ticket_items
				(ticket_id, producto_id, nombre_producto, ean, cantidad, precio_unitario, precio_final, descuento, promocion_id)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULLIF($9, ''))
		`, ticketID,
			nullIfEmpty(item.ProductoID), item.NombreProducto, item.EAN,
			item.Cantidad, item.PrecioUnitario, item.PrecioFinal, item.Descuento,
			item.PromocionID,
		)
		if err != nil {
			log.Printf("[ConfirmTicket] Error insertando ítem: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "Error guardando ítems"})
			return
		}

		// Descontar stock si hay productoID y sucursalID
		if item.ProductoID != "" {
			_, _ = tx.Exec(`
				UPDATE inventario_sucursal
				SET stock_actual = GREATEST(stock_actual - $1, 0),
				    version = version + 1,
				    updated_at = $2
				WHERE producto_id = $3 AND sucursal_id = $4
			`, item.Cantidad, now, item.ProductoID, sucursalID)
		}
	}

	// 3. Insertar pagos
	for _, pago := range req.Pagos {
		_, err = tx.Exec(`
			INSERT INTO ticket_pagos (ticket_id, tipo_pago, monto)
			VALUES ($1, $2, $3)
		`, ticketID, pago.TipoPago, pago.Monto)
		if err != nil {
			log.Printf("[ConfirmTicket] Error insertando pago: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "Error guardando pagos"})
			return
		}
	}

	// 4. Actualizar saldo esperado y ticket_count del turno
	_, err = tx.Exec(`
		UPDATE turnos
		SET saldo_esperado = saldo_esperado + $1,
		    ticket_count   = ticket_count + 1
		WHERE id = $2
	`, req.Total, req.TurnoID)
	if err != nil {
		log.Printf("[ConfirmTicket] Error actualizando turno: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "Error actualizando turno"})
		return
	}

	// Commit
	if err = tx.Commit(); err != nil {
		log.Printf("[ConfirmTicket] Error en commit: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "Error confirmando ticket"})
		return
	}

	// Notificar por WebSocket
	h.Hub.BroadcastToSucursal(sucursalID, map[string]interface{}{
		"type":       "TICKET_CONFIRMED",
		"ticket_id":  ticketID,
		"turno_id":   req.TurnoID,
		"total":      req.Total,
		"timestamp":  now,
	})

	log.Printf("[ConfirmTicket] ✅ Ticket %s confirmado — turno %s — total $%.2f", ticketID, req.TurnoID, req.Total)
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":   true,
		"ticket_id": ticketID,
		"total":     req.Total,
		"message":   "Ticket confirmado",
	})
}

// ─── GetTicketsHandler — GET /tickets?turno_id=<id> ──────────────────────────
// Devuelve los tickets de un turno con su estado y total.
func (h *Handler) GetTicketsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")

	turnoID := r.URL.Query().Get("turno_id")
	if turnoID == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "turno_id es requerido"})
		return
	}

	rows, err := h.DB.Query(`
		SELECT id, numero, total, total_descuento, estado, created_at, confirmed_at
		FROM tickets
		WHERE turno_id = $1
		ORDER BY created_at DESC
	`, turnoID)
	if err != nil {
		log.Printf("[GetTickets] Error: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "Error interno"})
		return
	}
	defer rows.Close()

	type TicketSummary struct {
		ID             string  `json:"id"`
		Numero         int     `json:"numero"`
		Total          float64 `json:"total"`
		TotalDescuento float64 `json:"totalDescuento"`
		Estado         string  `json:"estado"`
		CreatedAt      int64   `json:"createdAt"`
		ConfirmedAt    *int64  `json:"confirmedAt,omitempty"`
	}

	var tickets []TicketSummary
	for rows.Next() {
		var t TicketSummary
		if err := rows.Scan(&t.ID, &t.Numero, &t.Total, &t.TotalDescuento, &t.Estado, &t.CreatedAt, &t.ConfirmedAt); err != nil {
			continue
		}
		tickets = append(tickets, t)
	}
	if tickets == nil {
		tickets = []TicketSummary{}
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"tickets": tickets,
		"count":   len(tickets),
	})
}

// ─── helpers ──────────────────────────────────────────────────────────────────

func nullIfEmpty(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}
