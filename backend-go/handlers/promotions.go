package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"gestion_comercios/models"
)

// ─── Motor de Promociones ────────────────────────────────────────────────────
//
// Evalúa qué promociones están activas para una sucursal y calcula el precio
// de oferta para un carrito de productos.
//
// Tipos de promoción soportados:
//   - DESCUENTO_PORCENTAJE: Baja el precio en un %
//   - PRECIO_FIJO:          Precio fijo para el producto
//   - 2x1:                  El segundo item gratis
//   - 3x2:                  El tercero gratis
//   - COMBO:                Precio especial al comprar N unidades

// ─── PromocionActiva ─────────────────────────────────────────────────────────

type PromocionActiva struct {
	PromocionID         string    `json:"promocionID"`
	Nombre              string    `json:"nombre"`
	Tipo                string    `json:"tipo"`
	ProductoID          string    `json:"productoID"`
	DescuentoPorcentaje float64   `json:"descuentoPorcentaje,omitempty"`
	PrecioFijo          float64   `json:"precioFijo,omitempty"`
	CantidadMinima      int       `json:"cantidadMinima,omitempty"`
	CantidadGratis      int       `json:"cantidadGratis,omitempty"`
	FechaInicio         time.Time `json:"fechaInicio"`
	FechaFin            time.Time `json:"fechaFin"`
	Activa              bool      `json:"activa"`
}

// ─── EvaluatePromoRequest / Response ─────────────────────────────────────────

type EvaluatePromoRequest struct {
	SucursalID string        `json:"sucursalID"`
	Items      []CartItem    `json:"items"`
}

type CartItem struct {
	ProductoID  string  `json:"productoID"`
	Cantidad    int     `json:"cantidad"`
	PrecioBase  float64 `json:"precioBase"`
}

type CartItemResult struct {
	CartItem
	PrecioFinal         float64          `json:"precioFinal"`
	Ahorro              float64          `json:"ahorro"`
	PromocionAplicada   *PromocionActiva `json:"promocionAplicada,omitempty"`
}

type EvaluatePromoResponse struct {
	Success    bool             `json:"success"`
	Items      []CartItemResult `json:"items"`
	TotalBase  float64          `json:"totalBase"`
	TotalFinal float64          `json:"totalFinal"`
	TotalAhorro float64         `json:"totalAhorro"`
	Error      string           `json:"error,omitempty"`
}

// ─── PromotionEngine ─────────────────────────────────────────────────────────

// PromotionEngine evalúa promociones activas desde la DB.
type PromotionEngine struct {
	db *sql.DB
}

// NewPromotionEngine crea un motor de promociones.
func NewPromotionEngine(db *sql.DB) *PromotionEngine {
	return &PromotionEngine{db: db}
}

// GetActivePromotions retorna las promociones vigentes para una sucursal.
func (pe *PromotionEngine) GetActivePromotions(sucursalID string) ([]PromocionActiva, error) {
	now := time.Now()
	rows, err := pe.db.Query(`
		SELECT 
			p.id::text,
			p.nombre,
			p.tipo,
			p.producto_id::text,
			COALESCE(p.descuento_porcentaje, 0),
			COALESCE(p.precio_fijo, 0),
			COALESCE(p.cantidad_minima, 1),
			COALESCE(p.cantidad_gratis, 0),
			p.fecha_inicio,
			p.fecha_fin,
			p.activa
		FROM promociones p
		WHERE p.sucursal_id = $1
		  AND p.activa = TRUE
		  AND p.fecha_inicio <= $2
		  AND p.fecha_fin >= $2
	`, sucursalID, now)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var promos []PromocionActiva
	for rows.Next() {
		var p PromocionActiva
		if err := rows.Scan(
			&p.PromocionID, &p.Nombre, &p.Tipo, &p.ProductoID,
			&p.DescuentoPorcentaje, &p.PrecioFijo,
			&p.CantidadMinima, &p.CantidadGratis,
			&p.FechaInicio, &p.FechaFin, &p.Activa,
		); err != nil {
			log.Printf("[Promos] Error escaneando fila: %v", err)
			continue
		}
		promos = append(promos, p)
	}
	return promos, rows.Err()
}

// Evaluate aplica las promociones activas a los items del carrito.
func (pe *PromotionEngine) Evaluate(sucursalID string, items []CartItem) ([]CartItemResult, error) {
	promos, err := pe.GetActivePromotions(sucursalID)
	if err != nil {
		log.Printf("[Promos] Error obteniendo promos: %v — devolviendo precios base", err)
		promos = []PromocionActiva{}
	}

	// Índice: productoID → promoción aplicable
	promoIdx := make(map[string]*PromocionActiva)
	for i := range promos {
		promoIdx[promos[i].ProductoID] = &promos[i]
	}

	results := make([]CartItemResult, 0, len(items))
	for _, item := range items {
		result := CartItemResult{CartItem: item}

		promo, hasPromo := promoIdx[item.ProductoID]
		if !hasPromo {
			result.PrecioFinal = item.PrecioBase
			results = append(results, result)
			continue
		}

		result.PromocionAplicada = promo

		switch promo.Tipo {
		case "DESCUENTO_PORCENTAJE":
			factor := 1.0 - (promo.DescuentoPorcentaje / 100.0)
			result.PrecioFinal = roundCents(item.PrecioBase * factor)

		case "PRECIO_FIJO":
			result.PrecioFinal = promo.PrecioFijo

		case "2x1":
			// Paga la mitad redondeando a favor del cliente
			gratis := item.Cantidad / 2
			pagados := item.Cantidad - gratis
			result.PrecioFinal = roundCents((float64(pagados) * item.PrecioBase) / float64(item.Cantidad))

		case "3x2":
			// Cada grupo de 3 paga 2
			grupos := item.Cantidad / 3
			resto := item.Cantidad % 3
			pagados := grupos*2 + resto
			result.PrecioFinal = roundCents((float64(pagados) * item.PrecioBase) / float64(item.Cantidad))

		case "COMBO":
			if item.Cantidad >= promo.CantidadMinima {
				result.PrecioFinal = promo.PrecioFijo / float64(item.Cantidad)
			} else {
				result.PrecioFinal = item.PrecioBase
				result.PromocionAplicada = nil
			}

		default:
			result.PrecioFinal = item.PrecioBase
		}

		result.Ahorro = roundCents((item.PrecioBase - result.PrecioFinal) * float64(item.Cantidad))
		results = append(results, result)
	}

	return results, nil
}

// roundCents redondea a 2 decimales.
func roundCents(v float64) float64 {
	return float64(int(v*100+0.5)) / 100
}

// ─── HTTP Handler ─────────────────────────────────────────────────────────────

// EvaluatePromotionsHandler — POST /promotions/evaluate
// Recibe un carrito y devuelve los precios con promociones aplicadas.
func (h *Handler) EvaluatePromotionsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	var req EvaluatePromoRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(EvaluatePromoResponse{Success: false, Error: "JSON inválido"})
		return
	}
	if req.SucursalID == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(EvaluatePromoResponse{Success: false, Error: "sucursalID es requerido"})
		return
	}
	if len(req.Items) == 0 {
		json.NewEncoder(w).Encode(EvaluatePromoResponse{Success: true})
		return
	}

	engine := NewPromotionEngine(h.DB)
	results, err := engine.Evaluate(req.SucursalID, req.Items)
	if err != nil {
		log.Printf("[Promos] Error evaluando: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(EvaluatePromoResponse{Success: false, Error: "Error interno"})
		return
	}

	// Calcular totales
	var totalBase, totalFinal float64
	for _, r := range results {
		totalBase += r.PrecioBase * float64(r.Cantidad)
		totalFinal += r.PrecioFinal * float64(r.Cantidad)
	}

	json.NewEncoder(w).Encode(EvaluatePromoResponse{
		Success:     true,
		Items:       results,
		TotalBase:   roundCents(totalBase),
		TotalFinal:  roundCents(totalFinal),
		TotalAhorro: roundCents(totalBase - totalFinal),
	})
}

// GetActivePromotionsHandler — GET /promotions/active?sucursal_id=...
// Lista las promociones vigentes de una sucursal.
func (h *Handler) GetActivePromotionsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	sucursalID := r.URL.Query().Get("sucursal_id")
	if sucursalID == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "sucursal_id es requerido"})
		return
	}

	engine := NewPromotionEngine(h.DB)
	promos, err := engine.GetActivePromotions(sucursalID)
	if err != nil {
		log.Printf("[Promos] Error consultando DB: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Error consultando promociones"})
		return
	}

	// Convertir a models.Promotion para el cliente
	clientPromos := make([]models.Promotion, 0, len(promos))
	for _, p := range promos {
		clientPromos = append(clientPromos, models.Promotion{
			PromocionID:         p.PromocionID,
			Nombre:              p.Nombre,
			DescuentoPorcentaje: p.DescuentoPorcentaje,
			PrecioOferta:        p.PrecioFijo,
			FechaFin:            p.FechaFin.UnixMilli(),
		})
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":    true,
		"promociones": clientPromos,
		"total":      len(clientPromos),
	})
}
