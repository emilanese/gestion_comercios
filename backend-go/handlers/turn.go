package handlers

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"time"

	"gestion_comercios/models"
)

// OpenTurnHandler maneja POST /turns/open para abrir un turno
func OpenTurnHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	// Leer request
	body, err := io.ReadAll(r.Body)
	if err != nil {
		log.Printf("[TurnOpen] Error leyendo request: %v", err)
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(models.TurnResponse{
			Success: false,
			Error:   "Error leyendo request",
		})
		return
	}
	defer r.Body.Close()

	// Parse JSON
	var req models.TurnRequest
	if err := json.Unmarshal(body, &req); err != nil {
		log.Printf("[TurnOpen] Error parseando JSON: %v", err)
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(models.TurnResponse{
			Success: false,
			Error:   "JSON inválido",
		})
		return
	}

	// Validar request
	if err := models.ValidateTurnOpen(req); err != nil {
		log.Printf("[TurnOpen] Validación fallida: %v", err)
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(models.TurnResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	// TODO: En futuro, validar sessionToken contra DB
	// Por ahora, aceptamos la solicitud

	// Generar turno ID (formato: YYYYMMDD_T{numeroTerminal}{secuencia})
	// En futuro, incrementar secuencia por terminal por día desde DB
	turnoID := time.Now().Format("20060102") + "_T01_001"

	// Crear TurnConfig
	turnConfig := &models.TurnConfig{
		TurnoID:        turnoID,
		DeviceID:       req.DeviceID,
		ComercioID:     "COM_001", // TODO: Obtener de sessionToken
		SucursalID:     "SUC_001", // TODO: Obtener de sessionToken
		NumeroTerminal: 1,         // TODO: Obtener de sessionToken
		OperadorNombre: req.OperadorNombre,
		MontoInicial:   req.MontoInicial,
		OpenedAt:       time.Now(),
		EstadoTurno:    "ABIERTO",
		SaldoEsperado:  req.MontoInicial,
		CierreBloqueado: false,
	}

	// TODO: Guardar a cache/DB
	// TODO: Publicar a WebSocket "turno_abierto" a canal_sucursal_SUC_001

	log.Printf("[TurnOpen] Turno abierto: %s para dispositivo %s por %s", turnoID, req.DeviceID, req.OperadorNombre)

	// Respuesta exitosa
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(models.TurnResponse{
		Success:    true,
		TurnoID:    turnoID,
		TurnConfig: turnConfig,
		Message:    "Turno abierto exitosamente",
	})
}

// CloseTurnHandler maneja POST /turns/close para cerrar un turno
func CloseTurnHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	// Leer request
	body, err := io.ReadAll(r.Body)
	if err != nil {
		log.Printf("[TurnClose] Error leyendo request: %v", err)
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(models.TurnClosureResponse{
			Success: false,
			Error:   "Error leyendo request",
		})
		return
	}
	defer r.Body.Close()

	// Parse JSON
	var req models.TurnClosureRequest
	if err := json.Unmarshal(body, &req); err != nil {
		log.Printf("[TurnClose] Error parseando JSON: %v", err)
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(models.TurnClosureResponse{
			Success: false,
			Error:   "JSON inválido",
		})
		return
	}

	// Validaciones
	if req.TurnoID == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(models.TurnClosureResponse{
			Success: false,
			Error:   "turno_id es requerido",
		})
		return
	}

	// TODO: Validar que no haya tickets PENDIENTE
	// TODO: Recuperar saldo esperado del turno
	// TODO: Guardar cierre a DB
	// TODO: Publicar a WebSocket "turno_cerrado"

	saldoEsperado := 1000.0 // TODO: desde DB
	diferencia := req.SaldoRealEfectivo - saldoEsperado

	log.Printf("[TurnClose] Turno cerrado: %s (diferencia: %.2f)", req.TurnoID, diferencia)

	// Respuesta
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(models.TurnClosureResponse{
		Success:           true,
		Message:           "Turno cerrado exitosamente",
		SaldoEsperado:     saldoEsperado,
		SaldoRealEfectivo: req.SaldoRealEfectivo,
		Diferencia:        diferencia,
		DesglosePago:      req.DesglosePago,
	})
}

// GetActiveTurnHandler maneja GET /turns/active para obtener turno activo
func GetActiveTurnHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	// Query param: device_id
	deviceID := r.URL.Query().Get("device_id")
	if deviceID == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "device_id es requerido",
		})
		return
	}

	// TODO: Consultar a cache/DB por turno activo

	turnConfig := &models.TurnConfig{
		TurnoID:        "20260603_T01_001",
		DeviceID:       deviceID,
		EstadoTurno:    "ABIERTO",
		SaldoEsperado:  1000.0,
		CierreBloqueado: false,
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":      true,
		"turn_config":  turnConfig,
	})
}
