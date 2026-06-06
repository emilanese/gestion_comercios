package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"
)

// ─── CreatePromotionHandler — POST /promotions ────────────────────────────────

type CreatePromotionRequest struct {
	Nombre              string  `json:"nombre"`
	Tipo                string  `json:"tipo"` // DESCUENTO_PORCENTAJE | PRECIO_FIJO | 2x1 | 3x2 | COMBO
	ProductoID          string  `json:"productoID"`
	SucursalID          string  `json:"sucursalID"`
	DescuentoPorcentaje float64 `json:"descuentoPorcentaje,omitempty"`
	PrecioFijo          float64 `json:"precioFijo,omitempty"`
	CantidadMinima      int     `json:"cantidadMinima,omitempty"`
	CantidadGratis      int     `json:"cantidadGratis,omitempty"`
	FechaInicio         string  `json:"fechaInicio"` // RFC3339 o YYYY-MM-DD
	FechaFin            string  `json:"fechaFin"`
}

func (h *Handler) CreatePromotionHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")

	comercioID := r.Header.Get("X-Comercio-ID")

	var req CreatePromotionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "JSON inválido"})
		return
	}
	if req.Nombre == "" || req.Tipo == "" || req.ProductoID == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "nombre, tipo y productoID son requeridos"})
		return
	}

	sucursalID := req.SucursalID
	if sucursalID == "" {
		sucursalID = r.Header.Get("X-Sucursal-ID")
	}

	// Parsear fechas (aceptar YYYY-MM-DD o RFC3339)
	fechaInicio, err := parseDate(req.FechaInicio)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "fechaInicio inválida (usar YYYY-MM-DD)"})
		return
	}
	fechaFin, err := parseDate(req.FechaFin)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "fechaFin inválida (usar YYYY-MM-DD)"})
		return
	}

	cantMin := req.CantidadMinima
	if cantMin == 0 {
		cantMin = 1
	}

	var promoID string
	err = h.DB.QueryRow(`
		INSERT INTO promociones
			(nombre, tipo, producto_id, sucursal_id, comercio_id,
			 descuento_porcentaje, precio_fijo, cantidad_minima, cantidad_gratis,
			 fecha_inicio, fecha_fin, activa)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TRUE)
		RETURNING id
	`, req.Nombre, req.Tipo, req.ProductoID, sucursalID, comercioID,
		req.DescuentoPorcentaje, req.PrecioFijo, cantMin, req.CantidadGratis,
		fechaInicio, fechaFin,
	).Scan(&promoID)
	if err != nil {
		log.Printf("[CreatePromotion] DB error: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "Error guardando promoción"})
		return
	}

	// Notificar por WebSocket
	h.Hub.BroadcastToSucursal(sucursalID, map[string]interface{}{
		"type":       "PROMO_ACTIVADA",
		"promo_id":   promoID,
		"nombre":     req.Nombre,
		"tipo":       req.Tipo,
		"timestamp":  time.Now().UnixMilli(),
	})

	log.Printf("[CreatePromotion] ✅ Promoción %s creada — tipo=%s comercio=%s", req.Nombre, req.Tipo, comercioID)
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"promoID":  promoID,
		"nombre":   req.Nombre,
	})
}

// ─── PromotionRouterHandler — /promotions/:id dispatcher ─────────────────────

func (h *Handler) PromotionRouterHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPut:
		h.UpdatePromotionHandler(w, r)
	case http.MethodDelete:
		h.DeletePromotionHandler(w, r)
	case http.MethodGet:
		h.GetPromotionHandler(w, r)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// ─── UpdatePromotionHandler — PUT /promotions/:id ─────────────────────────────

func (h *Handler) UpdatePromotionHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	promoID := strings.TrimPrefix(r.URL.Path, "/promotions/")
	if promoID == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "ID requerido"})
		return
	}

	var req struct {
		Nombre              string  `json:"nombre"`
		DescuentoPorcentaje float64 `json:"descuentoPorcentaje"`
		PrecioFijo          float64 `json:"precioFijo"`
		FechaFin            string  `json:"fechaFin"`
		Activa              bool    `json:"activa"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "JSON inválido"})
		return
	}

	fechaFin, err := parseDate(req.FechaFin)
	if err != nil {
		fechaFin = time.Now().AddDate(0, 1, 0) // 1 mes por defecto
	}

	res, err := h.DB.Exec(`
		UPDATE promociones
		SET nombre               = $1,
		    descuento_porcentaje = $2,
		    precio_fijo          = $3,
		    fecha_fin            = $4,
		    activa               = $5
		WHERE id = $6
	`, req.Nombre, req.DescuentoPorcentaje, req.PrecioFijo, fechaFin, req.Activa, promoID)
	if err != nil {
		log.Printf("[UpdatePromotion] DB error: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "Error actualizando promoción"})
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "Promoción no encontrada"})
		return
	}

	log.Printf("[UpdatePromotion] Promoción %s actualizada", promoID)
	json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "message": "Promoción actualizada"})
}

// ─── DeletePromotionHandler — DELETE /promotions/:id ─────────────────────────

func (h *Handler) DeletePromotionHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	promoID := strings.TrimPrefix(r.URL.Path, "/promotions/")
	if promoID == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "ID requerido"})
		return
	}

	sucursalID := r.Header.Get("X-Sucursal-ID")

	res, err := h.DB.Exec(`UPDATE promociones SET activa = FALSE WHERE id = $1`, promoID)
	if err != nil {
		log.Printf("[DeletePromotion] DB error: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "Error desactivando promoción"})
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "Promoción no encontrada"})
		return
	}

	h.Hub.BroadcastToSucursal(sucursalID, map[string]interface{}{
		"type":      "PROMO_DESACTIVADA",
		"promo_id":  promoID,
		"timestamp": time.Now().UnixMilli(),
	})

	log.Printf("[DeletePromotion] Promoción %s desactivada", promoID)
	json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "message": "Promoción desactivada"})
}

// ─── GetPromotionHandler — GET /promotions/:id ────────────────────────────────

func (h *Handler) GetPromotionHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	promoID := strings.TrimPrefix(r.URL.Path, "/promotions/")
	if promoID == "" {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	row := h.DB.QueryRow(`
		SELECT id, nombre, tipo, producto_id,
		       COALESCE(descuento_porcentaje, 0), COALESCE(precio_fijo, 0),
		       COALESCE(cantidad_minima, 1), COALESCE(cantidad_gratis, 0),
		       fecha_inicio, fecha_fin, activa
		FROM promociones WHERE id = $1
	`, promoID)

	var p struct {
		ID                  string    `json:"id"`
		Nombre              string    `json:"nombre"`
		Tipo                string    `json:"tipo"`
		ProductoID          string    `json:"productoID"`
		DescuentoPorcentaje float64   `json:"descuentoPorcentaje"`
		PrecioFijo          float64   `json:"precioFijo"`
		CantidadMinima      int       `json:"cantidadMinima"`
		CantidadGratis      int       `json:"cantidadGratis"`
		FechaInicio         time.Time `json:"fechaInicio"`
		FechaFin            time.Time `json:"fechaFin"`
		Activa              bool      `json:"activa"`
	}
	if err := row.Scan(
		&p.ID, &p.Nombre, &p.Tipo, &p.ProductoID,
		&p.DescuentoPorcentaje, &p.PrecioFijo,
		&p.CantidadMinima, &p.CantidadGratis,
		&p.FechaInicio, &p.FechaFin, &p.Activa,
	); err != nil {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "Promoción no encontrada"})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "promo": p})
}

// ─── Helper ───────────────────────────────────────────────────────────────────

func parseDate(s string) (time.Time, error) {
	if s == "" {
		return time.Time{}, nil
	}
	// Intentar YYYY-MM-DD primero
	if t, err := time.ParseInLocation("2006-01-02", s, time.Local); err == nil {
		return t, nil
	}
	// Luego RFC3339
	return time.Parse(time.RFC3339, s)
}
