package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"gestion_comercios/models"
)

// ─── SQL base ─────────────────────────────────────────────────────────────────

// productSelectSQL construye el SELECT estándar de productos con JOIN a precios,
// stock y la primera promoción activa (si existe). Acepta placeholders $1=comercio_id
// y $2=sucursal_id; la condición WHERE adicional se pasa por el caller.
const productSelectSQL = `
	SELECT
		p.id,
		p.nombre,
		COALESCE(p.marca, ''),
		COALESCE(p.categoria, ''),
		COALESCE(p.ean, ''),
		COALESCE(ps.precio_venta, 0)  AS precio_venta,
		COALESCE(ps.precio_costo, 0)  AS precio_costo,
		COALESCE(ss.cantidad, 0)      AS stock,
		p.activo,
		pr.id,
		pr.nombre,
		COALESCE(pr.descuento_porcentaje, 0),
		COALESCE(pr.precio_fijo, 0),
		COALESCE(pr.tipo, '')
	FROM productos p
	LEFT JOIN precios_sucursal ps
		ON ps.producto_id = p.id AND ps.sucursal_id = $2
	LEFT JOIN stock_sucursal ss
		ON ss.producto_id = p.id AND ss.sucursal_id = $2
	LEFT JOIN LATERAL (
		SELECT id, nombre, descuento_porcentaje, precio_fijo, tipo
		FROM promociones
		WHERE producto_id = p.id
		  AND sucursal_id = $2
		  AND activa = TRUE
		  AND fecha_inicio <= $3
		  AND fecha_fin    >= $3
		ORDER BY fecha_fin
		LIMIT 1
	) pr ON TRUE
`

// scanProductRows escanea las filas del SELECT estándar y las convierte a
// []models.ProductInfo calculando el precio de oferta en base a la promoción.
func scanProductRows(rows *sql.Rows) ([]models.ProductInfo, error) {
	var results []models.ProductInfo
	for rows.Next() {
		var (
			productoID, nombre, marca, categoria, ean string
			precioVenta, precioCosto                  float64
			stock                                     int
			activo                                    bool
			promoID, promoNombre                      sql.NullString
			promoDesc, precioFijo                     sql.NullFloat64
			promoTipo                                 sql.NullString
		)
		if err := rows.Scan(
			&productoID, &nombre, &marca, &categoria, &ean,
			&precioVenta, &precioCosto, &stock, &activo,
			&promoID, &promoNombre, &promoDesc, &precioFijo, &promoTipo,
		); err != nil {
			log.Printf("[ProductScan] Error: %v", err)
			continue
		}

		info := models.ProductInfo{
			ProductoID:  productoID,
			Nombre:      nombre,
			Marca:       marca,
			Categoria:   categoria,
			EAN:         ean,
			PrecioVenta: precioVenta,
			Stock:       stock,
		}

		if promoID.Valid {
			promo := &models.Promotion{
				PromocionID:         promoID.String,
				Nombre:              promoNombre.String,
				DescuentoPorcentaje: promoDesc.Float64,
				FechaFin:            0,
			}
			switch promoTipo.String {
			case "DESCUENTO_PORCENTAJE":
				info.PrecioOferta = roundCents(precioVenta * (1 - promoDesc.Float64/100.0))
			case "PRECIO_FIJO":
				info.PrecioOferta = precioFijo.Float64
			}
			promo.PrecioOferta = info.PrecioOferta
			info.Promocion = promo
		}

		results = append(results, info)
	}
	return results, rows.Err()
}

// ─── SearchProductsHandler — GET /products/search?q=&sucursal_id= ────────────

func (h *Handler) SearchProductsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")

	comercioID := r.Header.Get("X-Comercio-ID")
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	sucursalID := r.URL.Query().Get("sucursal_id")

	if q == "" || len(q) < 2 {
		json.NewEncoder(w).Encode(models.ProductSearchResponse{Success: true, Products: []models.ProductInfo{}})
		return
	}

	now := time.Now()
	like := "%" + strings.ToLower(q) + "%"

	rows, err := h.DB.Query(
		productSelectSQL+`
		WHERE p.comercio_id = $1
		  AND p.activo = TRUE
		  AND (LOWER(p.nombre)    LIKE $4
		    OR LOWER(p.marca)     LIKE $4
		    OR LOWER(p.categoria) LIKE $4
		    OR p.ean              LIKE $4)
		ORDER BY p.nombre
		LIMIT 50
		`,
		comercioID, sucursalID, now, like,
	)
	if err != nil {
		log.Printf("[SearchProducts] DB error: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(models.ProductSearchResponse{Success: false, Error: "Error consultando productos"})
		return
	}
	defer rows.Close()

	products, err := scanProductRows(rows)
	if err != nil {
		log.Printf("[SearchProducts] Scan error: %v", err)
	}
	if products == nil {
		products = []models.ProductInfo{}
	}

	log.Printf("[SearchProducts] q=%q comercio=%s resultados=%d", q, comercioID, len(products))
	json.NewEncoder(w).Encode(models.ProductSearchResponse{Success: true, Products: products})
}

// ─── SearchProductByBarcodeHandler — GET /products/by-barcode?ean= ───────────

func (h *Handler) SearchProductByBarcodeHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")

	comercioID := r.Header.Get("X-Comercio-ID")
	ean := strings.TrimSpace(r.URL.Query().Get("ean"))
	sucursalID := r.URL.Query().Get("sucursal_id")

	if ean == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(models.ProductBarcodeResponse{Success: false, Error: "ean es requerido"})
		return
	}

	now := time.Now()
	rows, err := h.DB.Query(
		productSelectSQL+`
		WHERE p.comercio_id = $1
		  AND p.activo = TRUE
		  AND p.ean = $4
		LIMIT 1
		`,
		comercioID, sucursalID, now, ean,
	)
	if err != nil {
		log.Printf("[SearchBarcode] DB error: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(models.ProductBarcodeResponse{Success: false, Error: "Error consultando producto"})
		return
	}
	defer rows.Close()

	products, _ := scanProductRows(rows)
	if len(products) == 0 {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(models.ProductBarcodeResponse{Success: false, Error: "Producto no encontrado"})
		return
	}

	log.Printf("[SearchBarcode] EAN=%s encontrado: %s", ean, products[0].Nombre)
	json.NewEncoder(w).Encode(models.ProductBarcodeResponse{Success: true, Product: &products[0]})
}

// ─── GetProductsHandler — GET /products?sucursal_id=&limit=&offset= ──────────

func (h *Handler) GetProductsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")

	comercioID := r.Header.Get("X-Comercio-ID")
	sucursalID := r.URL.Query().Get("sucursal_id")

	now := time.Now()
	rows, err := h.DB.Query(
		productSelectSQL+`
		WHERE p.comercio_id = $1
		  AND p.activo = TRUE
		ORDER BY p.nombre
		LIMIT 200
		`,
		comercioID, sucursalID, now,
	)
	if err != nil {
		log.Printf("[GetProducts] DB error: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "Error consultando productos"})
		return
	}
	defer rows.Close()

	products, _ := scanProductRows(rows)
	if products == nil {
		products = []models.ProductInfo{}
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"products": products,
		"total":    len(products),
	})
}

// ─── CreateProductHandler — POST /products ────────────────────────────────────

type CreateProductRequest struct {
	Nombre       string  `json:"nombre"`
	Marca        string  `json:"marca"`
	Categoria    string  `json:"categoria"`
	EAN          string  `json:"ean"`
	SucursalID   string  `json:"sucursalID"`
	PrecioVenta  float64 `json:"precioVenta"`
	PrecioCosto  float64 `json:"precioCosto"`
	Stock        int     `json:"stock"`
	StockMinimo  int     `json:"stockMinimo"`
}

func (h *Handler) CreateProductHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")

	comercioID := r.Header.Get("X-Comercio-ID")

	var req CreateProductRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "JSON inválido"})
		return
	}
	if req.Nombre == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "nombre es requerido"})
		return
	}
	if req.SucursalID == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "sucursalID es requerido"})
		return
	}

	now := time.Now().UnixMilli()

	tx, err := h.DB.Begin()
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "Error interno"})
		return
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	// 1. Insertar producto
	var productoID string
	err = tx.QueryRow(`
		INSERT INTO productos (comercio_id, ean, nombre, marca, categoria, activo, created_at, updated_at)
		VALUES ($1, NULLIF($2,''), $3, $4, $5, TRUE, $6, $6)
		RETURNING id
	`, comercioID, req.EAN, req.Nombre, req.Marca, req.Categoria, now).Scan(&productoID)
	if err != nil {
		log.Printf("[CreateProduct] Error insertando producto: %v", err)
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "Error creando producto (EAN duplicado?)"})
		return
	}

	// 2. Precio por sucursal
	_, err = tx.Exec(`
		INSERT INTO precios_sucursal (producto_id, sucursal_id, precio_venta, precio_costo, updated_at)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (producto_id, sucursal_id) DO UPDATE
		SET precio_venta = EXCLUDED.precio_venta,
		    precio_costo = EXCLUDED.precio_costo,
		    updated_at   = EXCLUDED.updated_at
	`, productoID, req.SucursalID, req.PrecioVenta, req.PrecioCosto, now)
	if err != nil {
		log.Printf("[CreateProduct] Error precio: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "Error guardando precio"})
		return
	}

	// 3. Stock por sucursal
	_, err = tx.Exec(`
		INSERT INTO stock_sucursal (producto_id, sucursal_id, cantidad, stock_minimo, updated_at)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (producto_id, sucursal_id) DO UPDATE
		SET cantidad     = EXCLUDED.cantidad,
		    stock_minimo = EXCLUDED.stock_minimo,
		    updated_at   = EXCLUDED.updated_at
	`, productoID, req.SucursalID, req.Stock, req.StockMinimo, now)
	if err != nil {
		log.Printf("[CreateProduct] Error stock: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "Error guardando stock"})
		return
	}

	if err = tx.Commit(); err != nil {
		log.Printf("[CreateProduct] Error commit: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "Error finalizando transacción"})
		return
	}

	// Notificar por WS a la sucursal del nuevo producto
	h.Hub.BroadcastToSucursal(req.SucursalID, map[string]interface{}{
		"type":       "PRODUCT_CREATED",
		"product_id": productoID,
		"nombre":     req.Nombre,
	})

	log.Printf("[CreateProduct] ✅ Producto creado: %s (%s) en comercio %s", req.Nombre, productoID, comercioID)
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":    true,
		"productoID": productoID,
		"nombre":     req.Nombre,
	})
}

// ─── UpdateProductHandler — PUT /products/:id ─────────────────────────────────

type UpdateProductRequest struct {
	PrecioVenta  float64  `json:"precioVenta"`
	PrecioCosto  *float64 `json:"precioCosto,omitempty"`
	PrecioOferta *float64 `json:"precioOferta,omitempty"`
	Stock        *int     `json:"stock,omitempty"`
	StockMinimo  *int     `json:"stockMinimo,omitempty"`
	SucursalID   string   `json:"sucursalID"`
	// Replicar precio a todas las sucursales del comercio
	ReplicarTodas bool `json:"replicarTodas,omitempty"`
}

func (h *Handler) UpdateProductHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	comercioID := r.Header.Get("X-Comercio-ID")

	// Extraer ID del path: /products/<id>
	productoID := strings.TrimPrefix(r.URL.Path, "/products/")
	if productoID == "" || strings.Contains(productoID, "/") {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "ID de producto inválido"})
		return
	}

	var req UpdateProductRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "JSON inválido"})
		return
	}

	sucursalID := req.SucursalID
	if sucursalID == "" {
		sucursalID = r.Header.Get("X-Sucursal-ID")
	}

	now := time.Now().UnixMilli()

	// Verificar que el producto pertenece al comercio
	var count int
	_ = h.DB.QueryRow(`SELECT COUNT(*) FROM productos WHERE id = $1 AND comercio_id = $2`, productoID, comercioID).Scan(&count)
	if count == 0 {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "Producto no encontrado"})
		return
	}

	// Actualizar precio en la(s) sucursal(es)
	var targetSucursales []string
	if req.ReplicarTodas {
		rows, err := h.DB.Query(`SELECT id FROM sucursales WHERE comercio_id = $1`, comercioID)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var sid string
				if rows.Scan(&sid) == nil {
					targetSucursales = append(targetSucursales, sid)
				}
			}
		}
	} else {
		targetSucursales = []string{sucursalID}
	}

	for _, sid := range targetSucursales {
		_, _ = h.DB.Exec(`
			INSERT INTO precios_sucursal (producto_id, sucursal_id, precio_venta, precio_costo, updated_at)
			VALUES ($1, $2, $3, COALESCE($4, 0), $5)
			ON CONFLICT (producto_id, sucursal_id) DO UPDATE
			SET precio_venta = EXCLUDED.precio_venta,
			    precio_costo = COALESCE($4, precios_sucursal.precio_costo),
			    updated_at   = EXCLUDED.updated_at
		`, productoID, sid, req.PrecioVenta, req.PrecioCosto, now)
	}

	// Actualizar stock si viene en el request
	if req.Stock != nil && sucursalID != "" {
		stockMin := 0
		if req.StockMinimo != nil {
			stockMin = *req.StockMinimo
		}
		_, _ = h.DB.Exec(`
			INSERT INTO stock_sucursal (producto_id, sucursal_id, cantidad, stock_minimo, updated_at)
			VALUES ($1, $2, $3, $4, $5)
			ON CONFLICT (producto_id, sucursal_id) DO UPDATE
			SET cantidad     = EXCLUDED.cantidad,
			    stock_minimo = EXCLUDED.stock_minimo,
			    updated_at   = EXCLUDED.updated_at
		`, productoID, sucursalID, *req.Stock, stockMin, now)
	}

	// Actualizar updated_at en productos
	_, _ = h.DB.Exec(`UPDATE productos SET updated_at = $1 WHERE id = $2`, now, productoID)

	// Notificar por WS a todos los dispositivos de la sucursal
	for _, sid := range targetSucursales {
		h.Hub.BroadcastToSucursal(sid, map[string]interface{}{
			"type":        "PRECIO_UPDATE",
			"product_id":  productoID,
			"precioVenta": req.PrecioVenta,
			"timestamp":   now,
		})
	}

	log.Printf("[UpdateProduct] ✅ Producto %s actualizado — precio=%.2f comercio=%s", productoID, req.PrecioVenta, comercioID)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":   true,
		"message":   "Producto actualizado",
		"sucursales": len(targetSucursales),
	})
}

// ─── DeleteProductHandler — DELETE /products/:id ─────────────────────────────

func (h *Handler) DeleteProductHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	comercioID := r.Header.Get("X-Comercio-ID")
	productoID := strings.TrimPrefix(r.URL.Path, "/products/")
	if productoID == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "ID requerido"})
		return
	}

	res, err := h.DB.Exec(`
		UPDATE productos SET activo = FALSE, updated_at = $1
		WHERE id = $2 AND comercio_id = $3
	`, time.Now().UnixMilli(), productoID, comercioID)
	if err != nil {
		log.Printf("[DeleteProduct] Error: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "Error desactivando producto"})
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "Producto no encontrado"})
		return
	}

	log.Printf("[DeleteProduct] Producto %s desactivado en comercio %s", productoID, comercioID)
	json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "message": "Producto desactivado"})
}

// ─── ProductRouterHandler — /products/* dispatcher ───────────────────────────
// Ruta catch-all para /products/:id que despacha según el método HTTP.

func (h *Handler) ProductRouterHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPut:
		h.UpdateProductHandler(w, r)
	case http.MethodDelete:
		h.DeleteProductHandler(w, r)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
