package handlers

import (
	"encoding/json"
	"log"
	"net/http"

	"gestion_comercios/models"
)

// SearchProductsHandler maneja GET /products/search?q=...
func SearchProductsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	// Parse query params
	query := r.URL.Query().Get("q")
	sucursalID := r.URL.Query().Get("sucursal_id")
	limit := 20 // default

	// Validar
	req := models.ProductSearchRequest{
		Query:      query,
		SucursalID: sucursalID,
		Limit:      limit,
	}

	if err := models.ValidateProductSearch(req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(models.ProductSearchResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	// TODO: Consultar WatermelonDB en cliente (búsqueda local)
	// TODO: O consultar PostgreSQL en backend si es búsqueda remota

	// Mock de resultado
	mockProducts := []models.ProductInfo{
		{
			ProductoID:   "PROD_001",
			Nombre:       "Leche Entera 1L",
			Marca:        "La Serenísima",
			Categoria:    "Lácteos",
			EAN:          "7790000001234",
			PrecioVenta:  2.50,
			Stock:        50,
			Promocion:    nil,
		},
		{
			ProductoID:   "PROD_002",
			Nombre:       "Pan de Sándwich",
			Marca:        "Bimbo",
			Categoria:    "Panificados",
			EAN:          "7790000001235",
			PrecioVenta:  1.20,
			Stock:        100,
			Promocion: &models.Promotion{
				PromocionID:         "PROMO_001",
				Nombre:              "2x1 Panes",
				DescuentoPorcentaje: 50,
				PrecioOferta:        0.60,
			},
			PrecioOferta: 0.60,
		},
	}

	log.Printf("[ProductSearch] Búsqueda: %s en sucursal %s, resultados: %d", query, sucursalID, len(mockProducts))

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(models.ProductSearchResponse{
		Success:  true,
		Products: mockProducts,
	})
}

// SearchProductByBarcodeHandler maneja GET /products/by-barcode?ean=...
func SearchProductByBarcodeHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	// Parse query params
	ean := r.URL.Query().Get("ean")
	sucursalID := r.URL.Query().Get("sucursal_id")

	// Validar
	req := models.ProductBarcodeRequest{
		EAN:        ean,
		SucursalID: sucursalID,
	}

	if err := models.ValidateProductBarcode(req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(models.ProductBarcodeResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	// TODO: Buscar en WatermelonDB (local) o PostgreSQL (remoto)

	// Mock de resultado
	product := &models.ProductInfo{
		ProductoID:   "PROD_001",
		Nombre:       "Leche Entera 1L",
		Marca:        "La Serenísima",
		Categoria:    "Lácteos",
		EAN:          ean,
		PrecioVenta:  2.50,
		Stock:        50,
		Promocion:    nil,
	}

	log.Printf("[ProductBarcode] Búsqueda EAN: %s, encontrado: %s", ean, product.Nombre)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(models.ProductBarcodeResponse{
		Success: true,
		Product: product,
	})
}

// GetProductsHandler maneja GET /products (lista general)
func GetProductsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	// Query params opcionales
	sucursalID := r.URL.Query().Get("sucursal_id")
	categoria := r.URL.Query().Get("categoria")

	// TODO: Consultar productos filtrados

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":   true,
		"products":  []interface{}{},
		"total":     0,
		"sucursal":  sucursalID,
		"categoria": categoria,
	})
}
