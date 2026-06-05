package models

import "time"

// ─── Requests ─────────────────────────────────────────────────────────────────

type TurnRequest struct {
	DeviceID       string  `json:"deviceID"`
	SessionToken   string  `json:"sessionToken"`
	MontoInicial   float64 `json:"montoInicial"`
	OperadorNombre string  `json:"operadorNombre"`
}

type TurnClosureRequest struct {
	TurnoID           string             `json:"turnoID"`
	SaldoRealEfectivo float64            `json:"saldoRealEfectivo"`
	DesglosePago      []PaymentBreakdown `json:"desglosePago"`
}

type PaymentBreakdown struct {
	MedioPagoID   string  `json:"medioPagoID"`
	MedioPagoNombre string `json:"medioPagoNombre"`
	Monto         float64 `json:"monto"`
}

// ─── TurnConfig ───────────────────────────────────────────────────────────────

type TurnConfig struct {
	TurnoID         string     `json:"turnoID"`
	DeviceID        string     `json:"deviceID"`
	ComercioID      string     `json:"comercioID"`
	SucursalID      string     `json:"sucursalID"`
	NumeroTerminal  int        `json:"numeroTerminal"`
	OperadorNombre  string     `json:"operadorNombre"`
	MontoInicial    float64    `json:"montoInicial"`
	OpenedAt        time.Time  `json:"openedAt"`
	ClosedAt        *time.Time `json:"closedAt,omitempty"`
	EstadoTurno     string     `json:"estadoTurno"` // ABIERTO | CERRADO | SUSPENDIDO
	SaldoEsperado   float64    `json:"saldoEsperado"`
	CierreBloqueado bool       `json:"cierreBloqueado"`
	TicketCount     int        `json:"ticketCount"`
}

// ─── Responses ────────────────────────────────────────────────────────────────

type TurnResponse struct {
	Success    bool        `json:"success"`
	TurnoID    string      `json:"turnoID,omitempty"`
	TurnConfig *TurnConfig `json:"turnConfig,omitempty"`
	Message    string      `json:"message,omitempty"`
	Error      string      `json:"error,omitempty"`
}

type TurnClosureResponse struct {
	Success           bool               `json:"success"`
	Message           string             `json:"message,omitempty"`
	Error             string             `json:"error,omitempty"`
	SaldoEsperado     float64            `json:"saldoEsperado,omitempty"`
	SaldoRealEfectivo float64            `json:"saldoRealEfectivo,omitempty"`
	Diferencia        float64            `json:"diferencia,omitempty"`
	DesglosePago      []PaymentBreakdown `json:"desglosePago,omitempty"`
}

// ─── Validaciones ─────────────────────────────────────────────────────────────

func ValidateTurnOpen(req TurnRequest) error {
	if req.DeviceID == "" {
		return &ValidationError{Field: "deviceID", Message: "deviceID es requerido"}
	}
	if req.OperadorNombre == "" {
		return &ValidationError{Field: "operadorNombre", Message: "operadorNombre es requerido"}
	}
	if req.MontoInicial < 0 {
		return &ValidationError{Field: "montoInicial", Message: "montoInicial no puede ser negativo"}
	}
	return nil
}
