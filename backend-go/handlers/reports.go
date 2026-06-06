package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"time"
)

// ─── Tipos de reporte ─────────────────────────────────────────────────────────

type ResumenTurnoReport struct {
	TurnoID         string  `json:"turnoID"`
	Operador        string  `json:"operador"`
	Terminal        int     `json:"terminal"`
	Estado          string  `json:"estado"`
	OpenedAt        int64   `json:"openedAt"`
	ClosedAt        *int64  `json:"closedAt,omitempty"`
	MontoInicial    float64 `json:"montoInicial"`
	SaldoEsperado   float64 `json:"saldoEsperado"`
	TotalVentas     float64 `json:"totalVentas"`
	CantidadTickets int     `json:"cantidadTickets"`
}

type ResumenDiaReport struct {
	Fecha           string               `json:"fecha"`
	TotalVentas     float64              `json:"totalVentas"`
	CantidadTickets int                  `json:"cantidadTickets"`
	Turnos          []ResumenTurnoReport `json:"turnos"`
}

// ResumenMedioPago representa las ventas agrupadas por tipo de pago
type ResumenMedioPago struct {
	TipoPago string  `json:"tipoPago"`
	Total    float64 `json:"total"`
	Cantidad int     `json:"cantidad"`
}

// ─── DailyReportHandler — GET /reports/daily?fecha=YYYY-MM-DD ────────────────
//
// Devuelve el resumen de ventas del día agrupado por turno para el comercio
// autenticado. Calcula totales de ventas desde tickets con estado 'CONFIRMADO'.

func (h *Handler) DailyReportHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")

	comercioID := r.Header.Get("X-Comercio-ID")
	fechaStr := r.URL.Query().Get("fecha") // YYYY-MM-DD

	// Determinar rango del día
	var startDay, endDay time.Time
	loc := time.Local
	if fechaStr != "" {
		parsed, err := time.ParseInLocation("2006-01-02", fechaStr, loc)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "Formato de fecha inválido (esperado YYYY-MM-DD)"})
			return
		}
		startDay = parsed
	} else {
		now := time.Now().In(loc)
		startDay = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	}
	endDay = startDay.Add(24 * time.Hour)

	startMs := startDay.UnixMilli()
	endMs := endDay.UnixMilli()

	// ── Consultar turnos del día ──────────────────────────────────────────────
	rows, err := h.DB.Query(`
		SELECT
			t.id,
			t.operador_nombre,
			t.numero_terminal,
			t.estado,
			t.opened_at,
			t.closed_at,
			t.monto_inicial,
			t.saldo_esperado,
			COALESCE(SUM(tk.total), 0)  AS total_ventas,
			COUNT(tk.id)                 AS cantidad_tickets
		FROM turnos t
		LEFT JOIN tickets tk
			ON  tk.turno_id   = t.id
			AND tk.estado     = 'CONFIRMADO'
		WHERE t.comercio_id = $1
		  AND t.opened_at  >= $2
		  AND t.opened_at   < $3
		GROUP BY t.id, t.operador_nombre, t.numero_terminal, t.estado,
		         t.opened_at, t.closed_at, t.monto_inicial, t.saldo_esperado
		ORDER BY t.opened_at ASC
	`, comercioID, startMs, endMs)
	if err != nil {
		log.Printf("[DailyReport] DB error turnos: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "Error consultando turnos"})
		return
	}
	defer rows.Close()

	var turnos []ResumenTurnoReport
	var totalVentasDia float64
	var totalTicketsDia int

	for rows.Next() {
		var tr ResumenTurnoReport
		if err := rows.Scan(
			&tr.TurnoID, &tr.Operador, &tr.Terminal, &tr.Estado,
			&tr.OpenedAt, &tr.ClosedAt,
			&tr.MontoInicial, &tr.SaldoEsperado,
			&tr.TotalVentas, &tr.CantidadTickets,
		); err != nil {
			log.Printf("[DailyReport] Scan turno: %v", err)
			continue
		}
		totalVentasDia += tr.TotalVentas
		totalTicketsDia += tr.CantidadTickets
		turnos = append(turnos, tr)
	}
	if turnos == nil {
		turnos = []ResumenTurnoReport{}
	}

	resumen := ResumenDiaReport{
		Fecha:           startDay.Format("2006-01-02"),
		TotalVentas:     roundCents(totalVentasDia),
		CantidadTickets: totalTicketsDia,
		Turnos:          turnos,
	}

	log.Printf("[DailyReport] comercio=%s fecha=%s turnos=%d ventas=%.2f",
		comercioID, resumen.Fecha, len(turnos), totalVentasDia)

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"resumen": resumen,
	})
}

// ─── MediosPagoReportHandler — GET /reports/medios-pago?turno_id= ────────────
//
// Devuelve el desglose de ventas por medio de pago de un turno.

func (h *Handler) MediosPagoReportHandler(w http.ResponseWriter, r *http.Request) {
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
		SELECT
			tp.tipo_pago,
			SUM(tp.monto)  AS total,
			COUNT(tp.id)   AS cantidad
		FROM ticket_pagos tp
		JOIN tickets tk ON tk.id = tp.ticket_id
		WHERE tk.turno_id = $1
		  AND tk.estado   = 'CONFIRMADO'
		GROUP BY tp.tipo_pago
		ORDER BY total DESC
	`, turnoID)
	if err != nil {
		log.Printf("[MediosPagoReport] DB error: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "Error consultando medios de pago"})
		return
	}
	defer rows.Close()

	var medios []ResumenMedioPago
	for rows.Next() {
		var m ResumenMedioPago
		if err := rows.Scan(&m.TipoPago, &m.Total, &m.Cantidad); err != nil {
			continue
		}
		medios = append(medios, m)
	}
	if medios == nil {
		medios = []ResumenMedioPago{}
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"medios":  medios,
	})
}

// ─── StockCriticoHandler — GET /reports/stock-critico?sucursal_id= ───────────
//
// Devuelve productos con stock por debajo del mínimo configurado.

func (h *Handler) StockCriticoHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")

	comercioID := r.Header.Get("X-Comercio-ID")
	sucursalID := r.URL.Query().Get("sucursal_id")
	if sucursalID == "" {
		sucursalID = r.Header.Get("X-Sucursal-ID")
	}

	rows, err := h.DB.Query(`
		SELECT
			p.id, p.nombre, COALESCE(p.marca, ''), COALESCE(p.ean, ''),
			COALESCE(ps.precio_venta, 0),
			ss.cantidad     AS stock_actual,
			ss.stock_minimo
		FROM stock_sucursal ss
		JOIN productos p ON p.id = ss.producto_id AND p.comercio_id = $1 AND p.activo = TRUE
		LEFT JOIN precios_sucursal ps ON ps.producto_id = p.id AND ps.sucursal_id = ss.sucursal_id
		WHERE ss.sucursal_id = $2
		  AND ss.cantidad    <= ss.stock_minimo
		ORDER BY ss.cantidad ASC
		LIMIT 100
	`, comercioID, sucursalID)
	if err != nil {
		log.Printf("[StockCritico] DB error: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "Error consultando stock"})
		return
	}
	defer rows.Close()

	type StockCriticoItem struct {
		ProductoID  string  `json:"productoID"`
		Nombre      string  `json:"nombre"`
		Marca       string  `json:"marca"`
		EAN         string  `json:"ean"`
		PrecioVenta float64 `json:"precioVenta"`
		StockActual int     `json:"stockActual"`
		StockMinimo int     `json:"stockMinimo"`
	}

	var items []StockCriticoItem
	for rows.Next() {
		var item StockCriticoItem
		if err := rows.Scan(
			&item.ProductoID, &item.Nombre, &item.Marca, &item.EAN,
			&item.PrecioVenta, &item.StockActual, &item.StockMinimo,
		); err != nil {
			continue
		}
		items = append(items, item)
	}
	if items == nil {
		items = []StockCriticoItem{}
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"items":   items,
		"count":   len(items),
	})
}
