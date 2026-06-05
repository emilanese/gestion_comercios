package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"gestion_comercios/models"
)

// ValidatePINRequest — Request para validar PIN de cajero
type ValidatePINRequest struct {
	DeviceID     string `json:"device_id"`
	PIN          string `json:"pin"`
	OperatorName string `json:"operator_name"`
}

// ValidatePINResponse — Respuesta de validación
type ValidatePINResponse struct {
	Success      bool   `json:"success"`
	SessionToken string `json:"session_token,omitempty"`
	Message      string `json:"message,omitempty"`
}

// ValidatePINHandler — POST /auth/validate-pin
// El POS valida el PIN localmente; este endpoint es de auditoría y para
// notificar al Backoffice sobre intentos fallidos.
func (h *Handler) ValidatePINHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	var req ValidatePINRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request body"})
		return
	}

	if req.DeviceID == "" || req.PIN == "" || req.OperatorName == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "device_id, pin y operator_name son requeridos"})
		return
	}

	// Obtener hash del PIN y estado del comercio desde PostgreSQL
	var pinAccesoHash, comercioID, estadoCuenta string
	err := h.DB.QueryRow(`
		SELECT da.pin_acceso_hash, da.comercio_id, c.estado_cuenta
		FROM dispositivos_autorizados da
		JOIN comercios c ON da.comercio_id = c.id
		WHERE da.id_hardware_dispositivo = $1
	`, req.DeviceID).Scan(&pinAccesoHash, &comercioID, &estadoCuenta)

	if err != nil {
		log.Printf("[Auth] Dispositivo no encontrado: %s — %v", req.DeviceID, err)
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(ValidatePINResponse{
			Success: false,
			Message: "Dispositivo no encontrado",
		})
		return
	}

	// Validar estado de cuenta
	if estadoCuenta == "SUSPENDIDO" {
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(ValidatePINResponse{
			Success: false,
			Message: "Cuenta suspendida",
		})
		return
	}

	// Validar PIN
	enteredPINHash := models.GeneratePINHash(req.PIN)
	pinValid := enteredPINHash == pinAccesoHash

	if pinValid {
		log.Printf("[Auth] Login exitoso: Device=%s, Operador=%s", req.DeviceID, req.OperatorName)
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(ValidatePINResponse{
			Success: true,
			Message: "PIN correcto",
		})
	} else {
		log.Printf("[Auth] PIN incorrecto: Device=%s, Operador=%s", req.DeviceID, req.OperatorName)
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(ValidatePINResponse{
			Success: false,
			Message: "PIN incorrecto",
		})
	}
}

// UnblockDeviceRequest — Request para desbloquear dispositivo remotamente
type UnblockDeviceRequest struct {
	DeviceID   string `json:"device_id"`
	AdminToken string `json:"admin_token"`
}

// RemoteUnblockDeviceHandler — POST /admin/unblock-device
// El administrador desbloquea un POS bloqueado por intentos fallidos de PIN.
// Actualiza estado_terminal en dispositivos_autorizados.
// El POS recibe la señal DEVICE_UNBLOCK por WebSocket (implementado en FASE 3).
func (h *Handler) RemoteUnblockDeviceHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	var req UnblockDeviceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request body"})
		return
	}

	if req.DeviceID == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "device_id es requerido"})
		return
	}

	// TODO (FASE 3): validar admin_token con JWT middleware

	// Actualizar estado_terminal a AUTORIZADO en PostgreSQL
	result, err := h.DB.Exec(`
		UPDATE dispositivos_autorizados
		SET estado_terminal = 'AUTORIZADO', updated_at = $1
		WHERE id_hardware_dispositivo = $2
	`, time.Now().UnixMilli(), req.DeviceID)

	if err != nil {
		log.Printf("[Admin] Error desbloqueando dispositivo %s: %v", req.DeviceID, err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Error al desbloquear dispositivo"})
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "Dispositivo no encontrado"})
		return
	}

	log.Printf("[Admin] Dispositivo desbloqueado: %s", req.DeviceID)

	// TODO (FASE 3): publicar DEVICE_UNBLOCK al canal WebSocket del dispositivo

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Dispositivo desbloqueado correctamente",
	})
}
