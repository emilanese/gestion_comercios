package handlers

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"time"

	"gestion_comercios/models"
)

// DeviceEnrollHandler — POST /devices/enroll
// Procesa el enrolamiento de un dispositivo vía QR.
// Body: { token_enrolamiento, id_hardware, plataforma }
// Response: { device_id, alias_nombre, datasets (productos, precios, medios_pago, promociones) }
func (h *Handler) DeviceEnrollHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	var enrollReq models.EnrollRequest
	if err := json.NewDecoder(r.Body).Decode(&enrollReq); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request body"})
		return
	}

	if enrollReq.TokenEnrolamiento == "" || enrollReq.IDHardware == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "token_enrolamiento e id_hardware son requeridos"})
		return
	}

	// Paso 1: Validar token en PostgreSQL (idempotencia)
	dispositivo, err := h.validateEnrollToken(enrollReq.TokenEnrolamiento, enrollReq.IDHardware)
	if err != nil {
		log.Printf("[Enroll] Error validando token: %v", err)
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	// Paso 2: Verificar estado del comercio
	idiomaPref, err := h.getComercioInfo(dispositivo.ComercioID)
	if err != nil {
		log.Printf("[Enroll] Error obteniendo comercio: %v", err)
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	// Paso 3: Descargar datasets
	datasets, err := h.downloadDatasets(dispositivo.ComercioID, dispositivo.SucursalID)
	if err != nil {
		log.Printf("[Enroll] Error descargando datasets: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Error descargando datasets"})
		return
	}

	// Paso 4: Limpiar token para evitar reutilización (idempotencia QR)
	if err := h.clearEnrollToken(dispositivo.ID); err != nil {
		log.Printf("[Enroll] Advertencia limpiando token: %v", err)
	}

	log.Printf("[Enroll] ✅ Dispositivo '%s' (%s) enrollado. Idioma: %s", dispositivo.AliasNombre, dispositivo.ID, idiomaPref)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(models.EnrollResponse{
		Success:        true,
		DeviceID:       dispositivo.ID,
		AliasNombre:    dispositivo.AliasNombre,
		PINAccesoHash:  dispositivo.PINAccesoHash,
		ComercioID:     dispositivo.ComercioID,
		SucursalID:     dispositivo.SucursalID,
		NumeroTerminal: dispositivo.NumeroTerminal,
		Datasets:       datasets,
		Timestamp:      time.Now().UnixMilli(),
	})
}

// validateEnrollToken valida el token de enrolamiento y devuelve la config del dispositivo.
// Implementa la idempotencia del QR: si id_hardware_dispositivo ya está registrado con otro
// hardware, rechaza. Si está vacío, registra el hardware y continúa.
func (h *Handler) validateEnrollToken(token string, idHardware string) (*models.TerminalConfig, error) {
	var dispositivo models.TerminalConfig
	var tokenEnrolamiento sql.NullString
	var idHardwareDB sql.NullString

	err := h.DB.QueryRow(`
		SELECT
			id, comercio_id, sucursal_id, alias_nombre,
			pin_acceso_hash, rol, id_hardware_dispositivo, token_enrolamiento
		FROM dispositivos_autorizados
		WHERE token_enrolamiento = $1
		LIMIT 1
	`, token).Scan(
		&dispositivo.ID,
		&dispositivo.ComercioID,
		&dispositivo.SucursalID,
		&dispositivo.AliasNombre,
		&dispositivo.PINAccesoHash,
		&dispositivo.Rol,
		&idHardwareDB,
		&tokenEnrolamiento,
	)

	if err == sql.ErrNoRows {
		return nil, errors.New("token de enrolamiento no encontrado o expirado")
	}
	if err != nil {
		return nil, fmt.Errorf("error de base de datos: %w", err)
	}

	// IDEMPOTENCIA: Si ya tiene hardware registrado con un ID diferente, rechazar
	if idHardwareDB.Valid && idHardwareDB.String != "" && idHardwareDB.String != idHardware {
		return nil, errors.New("este código QR ya fue utilizado por otro dispositivo")
	}

	// Primer enrolamiento: registrar el hardware
	if !idHardwareDB.Valid || idHardwareDB.String == "" {
		_, err := h.DB.Exec(`
			UPDATE dispositivos_autorizados
			SET id_hardware_dispositivo = $1, estado_terminal = 'AUTORIZADO', updated_at = $2
			WHERE id = $3
		`, idHardware, time.Now().UnixMilli(), dispositivo.ID)
		if err != nil {
			return nil, fmt.Errorf("error registrando hardware: %w", err)
		}
	}

	dispositivo.IDHardware = idHardware
	return &dispositivo, nil
}

// getComercioInfo valida que el comercio esté activo y devuelve el idioma preferido.
func (h *Handler) getComercioInfo(comercioID string) (string, error) {
	var estadoCuenta, idiomaPref string

	err := h.DB.QueryRow(`
		SELECT estado_cuenta, idioma_preferido
		FROM comercios
		WHERE id = $1
	`, comercioID).Scan(&estadoCuenta, &idiomaPref)

	if err != nil {
		return "", fmt.Errorf("comercio no encontrado: %w", err)
	}

	if estadoCuenta == "SUSPENDIDO" {
		return "", fmt.Errorf("cuenta del comercio suspendida")
	}

	return idiomaPref, nil
}

// downloadDatasets descarga productos, precios, medios_pago y promociones activas
// para la sucursal indicada.
func (h *Handler) downloadDatasets(comercioID, sucursalID string) (models.EnrollDatasets, error) {
	datasets := models.EnrollDatasets{
		Productos:        []models.ProductoDTO{},
		PreciosSucursal:  []models.PreciosSucursalDTO{},
		MediosPago:       []models.MedioPagoDTO{},
		PromocionesLocal: []models.PromocionDTO{},
	}

	// 1. Productos (sin costo)
	productoRows, err := h.DB.Query(`
		SELECT id, COALESCE(codigo_barras,''), nombre,
		       COALESCE(marca,''), COALESCE(categoria,''),
		       COALESCE(descripcion,''), ultima_actualizacion
		FROM productos
		WHERE comercio_id = $1
		LIMIT 10000
	`, comercioID)
	if err != nil {
		return datasets, fmt.Errorf("error obteniendo productos: %w", err)
	}
	defer productoRows.Close()
	for productoRows.Next() {
		var p models.ProductoDTO
		if err := productoRows.Scan(&p.ID, &p.CodigoBarras, &p.Nombre, &p.Marca,
			&p.Categoria, &p.Descripcion, &p.UltimaActualizacion); err != nil {
			log.Printf("[Enroll] Warn escaneando producto: %v", err)
			continue
		}
		datasets.Productos = append(datasets.Productos, p)
	}

	// 2. Precios para esta sucursal
	preciosRows, err := h.DB.Query(`
		SELECT id, producto_id, sucursal_id, precio_venta,
		       porcentaje_ganancia, ultima_actualizacion
		FROM precios_sucursal
		WHERE sucursal_id = $1
	`, sucursalID)
	if err != nil {
		return datasets, fmt.Errorf("error obteniendo precios: %w", err)
	}
	defer preciosRows.Close()
	for preciosRows.Next() {
		var p models.PreciosSucursalDTO
		if err := preciosRows.Scan(&p.ID, &p.ProductoID, &p.SucursalID,
			&p.PrecioVenta, &p.PorcentajeGanancia, &p.UltimaActualizacion); err != nil {
			log.Printf("[Enroll] Warn escaneando precio: %v", err)
			continue
		}
		datasets.PreciosSucursal = append(datasets.PreciosSucursal, p)
	}

	// 3. Medios de pago activos del comercio
	mediosRows, err := h.DB.Query(`
		SELECT id, comercio_id, nombre, activo, ultima_actualizacion
		FROM medios_pago
		WHERE comercio_id = $1 AND activo = true
	`, comercioID)
	if err != nil {
		return datasets, fmt.Errorf("error obteniendo medios de pago: %w", err)
	}
	defer mediosRows.Close()
	for mediosRows.Next() {
		var m models.MedioPagoDTO
		if err := mediosRows.Scan(&m.ID, &m.ComercioID, &m.Nombre,
			&m.Activo, &m.UltimaActualizacion); err != nil {
			log.Printf("[Enroll] Warn escaneando medio pago: %v", err)
			continue
		}
		datasets.MediosPago = append(datasets.MediosPago, m)
	}

	// 4. Promociones ACTIVAS de la sucursal
	promosRows, err := h.DB.Query(`
		SELECT id, producto_id, sucursal_id, precio_oferta, fecha_inicio,
		       COALESCE(fecha_fin, 0), COALESCE(limite_cantidad, 0),
		       COALESCE(cantidad_restante, 0), estado, ultima_actualizacion
		FROM promociones_local
		WHERE sucursal_id = $1 AND estado = 'ACTIVA'
	`, sucursalID)
	if err != nil {
		return datasets, fmt.Errorf("error obteniendo promociones: %w", err)
	}
	defer promosRows.Close()
	for promosRows.Next() {
		var p models.PromocionDTO
		if err := promosRows.Scan(&p.ID, &p.ProductoID, &p.SucursalID, &p.PrecioOferta,
			&p.FechaInicio, &p.FechaFin, &p.LimiteCantidad,
			&p.CantidadRestante, &p.Estado, &p.UltimaActualizacion); err != nil {
			log.Printf("[Enroll] Warn escaneando promocion: %v", err)
			continue
		}
		datasets.PromocionesLocal = append(datasets.PromocionesLocal, p)
	}

	log.Printf("[Enroll] Datasets: %d productos, %d precios, %d medios_pago, %d promociones",
		len(datasets.Productos), len(datasets.PreciosSucursal),
		len(datasets.MediosPago), len(datasets.PromocionesLocal))

	return datasets, nil
}

// clearEnrollToken limpia el token QR para garantizar que no se reutilice.
func (h *Handler) clearEnrollToken(deviceID string) error {
	_, err := h.DB.Exec(`
		UPDATE dispositivos_autorizados
		SET token_enrolamiento = NULL, updated_at = $1
		WHERE id = $2
	`, time.Now().UnixMilli(), deviceID)
	return err
}
