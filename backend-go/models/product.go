package models

// ─── Requests ─────────────────────────────────────────────────────────────────

type ProductSearchRequest struct {
	Query      string `json:"query"`
	SucursalID string `json:"sucursalID"`
	Limit      int    `json:"limit"`
	Offset     int    `json:"offset"`
}

type ProductBarcodeRequest struct {
	EAN        string `json:"ean"`
	SucursalID string `json:"sucursalID"`
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────

type Promotion struct {
	PromocionID         string  `json:"promocionID"`
	Nombre              string  `json:"nombre"`
	DescuentoPorcentaje float64 `json:"descuentoPorcentaje"`
	PrecioOferta        float64 `json:"precioOferta"`
	FechaFin            int64   `json:"fechaFin,omitempty"`
}

type ProductInfo struct {
	ProductoID   string     `json:"productoID"`
	CodigoBarras string     `json:"codigoBarras"`
	Nombre       string     `json:"nombre"`
	Marca        string     `json:"marca"`
	Categoria    string     `json:"categoria"`
	Descripcion  string     `json:"descripcion,omitempty"`
	EAN          string     `json:"ean,omitempty"`
	PrecioVenta  float64    `json:"precioVenta"`
	PrecioOferta float64    `json:"precioOferta,omitempty"`
	Stock        int        `json:"stock"`
	StockMinimo  int        `json:"stockMinimo"`
	Promocion    *Promotion `json:"promocion,omitempty"`
}

// ─── Responses ────────────────────────────────────────────────────────────────

type ProductSearchResponse struct {
	Success  bool          `json:"success"`
	Products []ProductInfo `json:"products"`
	Total    int           `json:"total"`
	Error    string        `json:"error,omitempty"`
}

type ProductBarcodeResponse struct {
	Success bool         `json:"success"`
	Product *ProductInfo `json:"product,omitempty"`
	Error   string       `json:"error,omitempty"`
}

// ─── Validaciones ─────────────────────────────────────────────────────────────

func ValidateProductSearch(req ProductSearchRequest) error {
	if req.Query == "" {
		return &ValidationError{Field: "query", Message: "query es requerido"}
	}
	if len(req.Query) < 2 {
		return &ValidationError{Field: "query", Message: "query debe tener al menos 2 caracteres"}
	}
	if req.SucursalID == "" {
		return &ValidationError{Field: "sucursalID", Message: "sucursalID es requerido"}
	}
	return nil
}

func ValidateProductBarcode(req ProductBarcodeRequest) error {
	if req.EAN == "" {
		return &ValidationError{Field: "ean", Message: "ean es requerido"}
	}
	if req.SucursalID == "" {
		return &ValidationError{Field: "sucursalID", Message: "sucursalID es requerido"}
	}
	return nil
}
