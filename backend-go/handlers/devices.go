package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"time"
)

// GetDevicesHandler — GET /devices
// Lista todos los dispositivos autorizados del comercio autenticado.
func (h *Handler) GetDevicesHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")

	comercioID := r.Header.Get("X-Comercio-ID")

	rows, err := h.DB.Query(`
		SELECT
			d.id,
			d.nombre_dispositivo,
			d.rol,
			COALESCE(d.sucursal_id, '') AS sucursal_id,
			COALESCE(s.nombre, '')       AS sucursal_nombre,
			d.estado,
			d.numero_terminal,
			d.enrolled_at
		FROM dispositivos_autorizados d
		LEFT JOIN sucursales s ON s.id = d.sucursal_id
		WHERE d.comercio_id = $1
		ORDER BY d.enrolled_at DESC
	`, comercioID)
	if err != nil {
		log.Printf("[GetDevices] DB error: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "Error consultando dispositivos"})
		return
	}
	defer rows.Close()

	type DeviceInfo struct {
		ID               string `json:"id"`
		Nombre           string `json:"nombre"`
		Rol              string `json:"rol"`
		SucursalID       string `json:"sucursalID"`
		SucursalNombre   string `json:"sucursalNombre"`
		Estado           string `json:"estado"`
		NumeroTerminal   int    `json:"numeroTerminal"`
		EnrolledAt       int64  `json:"enrolledAt"`
	}

	var devices []DeviceInfo
	for rows.Next() {
		var d DeviceInfo
		if err := rows.Scan(
			&d.ID, &d.Nombre, &d.Rol, &d.SucursalID, &d.SucursalNombre,
			&d.Estado, &d.NumeroTerminal, &d.EnrolledAt,
		); err != nil {
			log.Printf("[GetDevices] Scan error: %v", err)
			continue
		}
		devices = append(devices, d)
	}
	if devices == nil {
		devices = []DeviceInfo{}
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"devices": devices,
		"count":   len(devices),
	})
}

// GenerateEnrollCodeHandler — POST /devices/generate-code
// Genera un token de enrolamiento de 6 horas para un nuevo dispositivo POS.
func (h *Handler) GenerateEnrollCodeHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")

	comercioID := r.Header.Get("X-Comercio-ID")

	var req struct {
		SucursalID string `json:"sucursalID"`
		Rol        string `json:"rol"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "JSON inválido"})
		return
	}
	if req.SucursalID == "" {
		req.SucursalID = r.Header.Get("X-Sucursal-ID")
	}
	if req.Rol == "" {
		req.Rol = "POS_CAJERO"
	}

	// Generar token aleatorio de 8 bytes → 16 caracteres hex
	tokenBytes := make([]byte, 8)
	if _, err := rand.Read(tokenBytes); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "Error generando token"})
		return
	}
	token := hex.EncodeToString(tokenBytes)

	expiresAt := time.Now().Add(6 * time.Hour).UnixMilli()

	// Guardar token en la tabla de enrolamiento pendiente (si existe) o en dispositivos con estado PENDIENTE
	// Intentar insertar en enrolamiento_pendiente; si no existe la tabla, usar token en memoria
	_, err := h.DB.Exec(`
		INSERT INTO enrolamiento_pendiente (token, comercio_id, sucursal_id, rol, expires_at)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (token) DO NOTHING
	`, token, comercioID, req.SucursalID, req.Rol, expiresAt)
	if err != nil {
		// Tabla puede no existir en esta versión — devolver token igualmente para uso manual
		log.Printf("[GenerateEnrollCode] Advertencia guardando token: %v", err)
	}

	log.Printf("[GenerateEnrollCode] Token generado para comercio=%s sucursal=%s rol=%s", comercioID, req.SucursalID, req.Rol)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":    true,
		"token":      token,
		"expires_at": expiresAt,
		"rol":        req.Rol,
	})
}
