package models

// EnrollRequest - Solicitud de enrolamiento desde dispositivo
type EnrollRequest struct {
	TokenEnrolamiento string `json:"token_enrolamiento"`
	IDHardware        string `json:"id_hardware"`
	Plataforma        string `json:"plataforma"` // "mobile", "web"
}

// EnrollResponse - Respuesta al enrolamiento
type EnrollResponse struct {
	Success           bool                 `json:"success"`
	Message           string               `json:"message,omitempty"`
	DeviceID          string               `json:"device_id"`
	AliasNombre       string               `json:"alias_nombre"`
	PINAccesoHash     string               `json:"pin_acceso_hash"`
	ComercioID        string               `json:"comercio_id"`
	SucursalID        string               `json:"sucursal_id"`
	NumeroTerminal    int                  `json:"numero_terminal"`
	Datasets          EnrollDatasets       `json:"datasets"`
	Timestamp         int64                `json:"timestamp"`
}

// EnrollDatasets - Datasets a descargar en el enrolamiento
type EnrollDatasets struct {
	Productos       []ProductoDTO       `json:"productos"`
	PreciosSucursal []PreciosSucursalDTO `json:"precios_sucursal"`
	MediosPago      []MedioPagoDTO      `json:"medios_pago"`
	PromocionesLocal []PromocionDTO    `json:"promociones_local"`
}

// ProductoDTO - DTO para descarga (SIN costo)
type ProductoDTO struct {
	ID                  string `json:"id"`
	CodigoBarras        string `json:"codigo_barras"`
	Nombre              string `json:"nombre"`
	Marca               string `json:"marca"`
	Categoria           string `json:"categoria"`
	Descripcion         string `json:"descripcion"`
	UltimaActualizacion int64  `json:"ultima_actualizacion"`
}

// PreciosSucursalDTO
type PreciosSucursalDTO struct {
	ID                  string  `json:"id"`
	ProductoID          string  `json:"producto_id"`
	SucursalID          string  `json:"sucursal_id"`
	PrecioVenta         float64 `json:"precio_venta"`
	PorcentajeGanancia  float64 `json:"porcentaje_ganancia"`
	UltimaActualizacion int64   `json:"ultima_actualizacion"`
}

// MedioPagoDTO
type MedioPagoDTO struct {
	ID                  string `json:"id"`
	ComercioID          string `json:"comercio_id"`
	Nombre              string `json:"nombre"`
	Activo              bool   `json:"activo"`
	UltimaActualizacion int64  `json:"ultima_actualizacion"`
}

// PromocionDTO
type PromocionDTO struct {
	ID                  string  `json:"id"`
	ProductoID          string  `json:"producto_id"`
	SucursalID          string  `json:"sucursal_id"`
	PrecioOferta        float64 `json:"precio_oferta"`
	FechaInicio         int64   `json:"fecha_inicio"`
	FechaFin            int64   `json:"fecha_fin"`
	LimiteCantidad      int64   `json:"limite_cantidad"`
	CantidadRestante    int64   `json:"cantidad_restante"`
	Estado              string  `json:"estado"` // PROGRAMADA, ACTIVA, AGOTADA, FINALIZADA
	UltimaActualizacion int64   `json:"ultima_actualizacion"`
}

// TerminalConfig - Configuración persistente del terminal local
type TerminalConfig struct {
	ID               string // UUID de dispositivos_autorizados
	ComercioID       string
	SucursalID       string
	NumeroTerminal   int
	IDHardware       string
	AliasNombre      string
	PINAccesoHash    string
	Rol              string // ADMIN, OPERADOR_STOCK, POS_CAJERO
	EstadoTerminal   string // AUTORIZADO, BLOQUEADO_POR_PIN
	EnrolledAt       int64
	LastSync         int64
}
