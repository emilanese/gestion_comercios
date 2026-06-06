package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"gestion_comercios/models"
)

// ─── OpenTurnHandler — POST /turns/open ──────────────────────────────────────
// Abre un turno de caja para el dispositivo autenticado.
// Requiere JWT (X-Comercio-ID, X-Sucursal-ID, X-Device-ID inyectados por middleware).
func (h *Handler) OpenTurnHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")

	comercioID := r.Header.Get("X-Comercio-ID")
	sucursalID := r.Header.Get("X-Sucursal-ID")
	deviceID   := r.Header.Get("X-Device-ID")

	var req models.TurnRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(models.TurnResponse{Success: false, Error: "JSON inválido"})
		return
	}

	if err := models.ValidateTurnOpen(req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(models.TurnResponse{Success: false, Error: err.Error()})
		return
	}

	// Verificar que no haya un turno ABIERTO para este dispositivo
	var existingID string
	err := h.DB.QueryRow(
		`SELECT id FROM turnos WHERE dispositivo_id = $1 AND estado = 'ABIERTO' LIMIT 1`,
		deviceID,
	).Scan(&existingID)
	if err == nil {
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(models.TurnResponse{
			Success: false,
			Error:   "Ya existe un turno abierto para este dispositivo",
			TurnoID: existingID,
		})
		return
	}
	if err != sql.ErrNoRows {
		log.Printf("[TurnOpen] Error consultando turno existente: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(models.TurnResponse{Success: false, Error: "Error interno"})
		return
	}

	// Determinar número de terminal del dispositivo
	var numeroTerminal int
	_ = h.DB.QueryRow(
		`SELECT numero_terminal FROM dispositivos_autorizados WHERE id = $1`,
		deviceID,
	).Scan(&numeroTerminal)
	if numeroTerminal == 0 {
		numeroTerminal = 1
	}

	// Insertar turno en DB
	now := time.Now().UnixMilli()
	var turnoID string
	err = h.DB.QueryRow(`
		INSERT INTO turnos
			(comercio_id, sucursal_id, dispositivo_id, numero_terminal,
			 operador_nombre, monto_inicial, saldo_esperado, estado, opened_at)
		VALUES ($1, $2, $3, $4, $5, $6, $6, 'ABIERTO', $7)
		RETURNING id
	`, comercioID, sucursalID, deviceID, numeroTerminal,
		req.OperadorNombre, req.MontoInicial, now,
	).Scan(&turnoID)
	if err != nil {
		log.Printf("[TurnOpen] Error insertando turno: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(models.TurnResponse{Success: false, Error: "Error guardando el turno"})
		return
	}

	// Notificar por WebSocket a la sucursal
	h.Hub.BroadcastToSucursal(sucursalID, map[string]interface{}{
		"type":       "TURN_OPENED",
		"turno_id":   turnoID,
		"device_id":  deviceID,
		"operador":   req.OperadorNombre,
		"timestamp":  now,
	})

	log.Printf("[TurnOpen] ✅ Turno %s abierto — dispositivo %s — operador %s", turnoID, deviceID, req.OperadorNombre)
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(models.TurnResponse{
		Success: true,
		TurnoID: turnoID,
		TurnConfig: &models.TurnConfig{
			TurnoID:        turnoID,
			DeviceID:       deviceID,
			ComercioID:     comercioID,
			SucursalID:     sucursalID,
			NumeroTerminal: numeroTerminal,
			OperadorNombre: req.OperadorNombre,
			MontoInicial:   req.MontoInicial,
			OpenedAt:       time.Now(),
			EstadoTurno:    "ABIERTO",
			SaldoEsperado:  req.MontoInicial,
			CierreBloqueado: false,
		},
		Message: "Turno abierto exitosamente",
	})
}

// ─── CloseTurnHandler — POST /turns/close ────────────────────────────────────
func (h *Handler) CloseTurnHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")

	sucursalID := r.Header.Get("X-Sucursal-ID")

	var req models.TurnClosureRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(models.TurnClosureResponse{Success: false, Error: "JSON inválido"})
		return
	}
	if req.TurnoID == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(models.TurnClosureResponse{Success: false, Error: "turnoID es requerido"})
		return
	}

	// Obtener saldo esperado del turno y verificar que esté ABIERTO
	var saldoEsperado float64
	var estadoActual string
	err := h.DB.QueryRow(
		`SELECT saldo_esperado, estado FROM turnos WHERE id = $1`,
		req.TurnoID,
	).Scan(&saldoEsperado, &estadoActual)
	if err == sql.ErrNoRows {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(models.TurnClosureResponse{Success: false, Error: "Turno no encontrado"})
		return
	}
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(models.TurnClosureResponse{Success: false, Error: "Error interno"})
		return
	}
	if estadoActual != "ABIERTO" {
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(models.TurnClosureResponse{Success: false, Error: "El turno no está abierto"})
		return
	}

	// Verificar tickets PENDIENTE
	var pendingCount int
	_ = h.DB.QueryRow(
		`SELECT COUNT(*) FROM tickets WHERE turno_id = $1 AND estado = 'PENDIENTE'`,
		req.TurnoID,
	).Scan(&pendingCount)
	if pendingCount > 0 {
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(models.TurnClosureResponse{
			Success: false,
			Error:   "Hay tickets pendientes de confirmar",
		})
		return
	}

	// Cerrar turno en DB
	now := time.Now().UnixMilli()
	_, err = h.DB.Exec(
		`UPDATE turnos SET estado = 'CERRADO', closed_at = $1 WHERE id = $2`,
		now, req.TurnoID,
	)
	if err != nil {
		log.Printf("[TurnClose] Error cerrando turno: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(models.TurnClosureResponse{Success: false, Error: "Error cerrando turno"})
		return
	}

	diferencia := req.SaldoRealEfectivo - saldoEsperado

	// Notificar por WebSocket
	h.Hub.BroadcastToSucursal(sucursalID, map[string]interface{}{
		"type":      "TURN_CLOSED",
		"turno_id":  req.TurnoID,
		"timestamp": now,
	})

	log.Printf("[TurnClose] ✅ Turno %s cerrado — diferencia: %.2f", req.TurnoID, diferencia)
	json.NewEncoder(w).Encode(models.TurnClosureResponse{
		Success:           true,
		Message:           "Turno cerrado exitosamente",
		SaldoEsperado:     saldoEsperado,
		SaldoRealEfectivo: req.SaldoRealEfectivo,
		Diferencia:        diferencia,
		DesglosePago:      req.DesglosePago,
	})
}

// ─── GetActiveTurnHandler — GET /turns/active?device_id=<id> ─────────────────
func (h *Handler) GetActiveTurnHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")

	deviceID := r.URL.Query().Get("device_id")
	if deviceID == "" {
		deviceID = r.Header.Get("X-Device-ID")
	}
	if deviceID == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "device_id es requerido"})
		return
	}

	var tc models.TurnConfig
	var openedAtMs int64
	err := h.DB.QueryRow(`
		SELECT id, dispositivo_id, comercio_id, sucursal_id,
		       numero_terminal, operador_nombre, monto_inicial,
		       saldo_esperado, estado, opened_at, cierre_bloqueado, ticket_count
		FROM turnos
		WHERE dispositivo_id = $1 AND estado = 'ABIERTO'
		LIMIT 1
	`, deviceID).Scan(
		&tc.TurnoID, &tc.DeviceID, &tc.ComercioID, &tc.SucursalID,
		&tc.NumeroTerminal, &tc.OperadorNombre, &tc.MontoInicial,
		&tc.SaldoEsperado, &tc.EstadoTurno, &openedAtMs,
		&tc.CierreBloqueado, &tc.TicketCount,
	)
	if err == sql.ErrNoRows {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "No hay turno abierto"})
		return
	}
	if err != nil {
		log.Printf("[GetActiveTurn] Error: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "Error interno"})
		return
	}

	tc.OpenedAt = time.UnixMilli(openedAtMs)

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":     true,
		"turn_config": tc,
	})
}
