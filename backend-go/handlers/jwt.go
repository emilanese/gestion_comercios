package handlers

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// ─── Roles del sistema AVANTI ─────────────────────────────────────────────────
//
// Los roles determinan:
//   - A qué módulo entra el dispositivo (POS / HUB / Depósito)
//   - Qué tablas sincroniza (syncConfig.ts en shared-logic)
//   - Qué permisos tiene en la interfaz (permissions.ts en shared-logic)

const (
	// RolAdmin — Dueño / Socio Principal
	// Acceso total cross-sucursal, ve costos, métricas globales y puede operar POS.
	RolAdmin = "ADMIN"

	// RolEncargado — Gerente / Supervisor de sucursal
	// Acceso HUB filtrado por sucursal_id, actúa como autorizador del POS.
	RolEncargado = "ENCARGADO"

	// RolDeposito — Operario logístico / Pañolero
	// Solo acceso a ingreso de remitos y auditoría de stock físico. Sin precios ni costos.
	RolDeposito = "DEPOSITO"

	// RolCajero — Personal de mostrador
	// Solo acceso al POS. No ve stock total, no puede abrir caja sin autorización.
	RolCajero = "CAJERO"
)

// ─── Claims ───────────────────────────────────────────────────────────────────

// AppClaims son los claims del JWT de esta aplicación.
type AppClaims struct {
	ComercioID string `json:"comercio_id"`
	SucursalID string `json:"sucursal_id"`
	DeviceID   string `json:"device_id"`
	Rol        string `json:"rol"` // ADMIN | ENCARGADO | DEPOSITO | CAJERO
	jwt.RegisteredClaims
}

// ─── Duración de tokens por rol ───────────────────────────────────────────────

// TokenExpiry retorna la duración del JWT según el rol.
// CAJERO: 12h (jornada laboral estándar)
// ADMIN/ENCARGADO/DEPOSITO: 24h (pueden operar en horarios extendidos)
func TokenExpiry(rol string) time.Duration {
	switch rol {
	case RolCajero:
		return 12 * time.Hour
	default:
		return 24 * time.Hour
	}
}

// ─── GenerateToken ────────────────────────────────────────────────────────────

// GenerateToken emite un JWT firmado con el secret dado.
func GenerateToken(comercioID, sucursalID, deviceID, rol, secret string) (string, error) {
	if secret == "" {
		return "", errors.New("JWT_SECRET no configurado")
	}

	expiry := TokenExpiry(rol)
	claims := AppClaims{
		ComercioID: comercioID,
		SucursalID: sucursalID,
		DeviceID:   deviceID,
		Rol:        rol,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(expiry)),
			Issuer:    "avanti",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

// ─── ValidateToken ────────────────────────────────────────────────────────────

// ValidateToken valida y parsea un JWT. Retorna los claims o error.
func ValidateToken(tokenStr, secret string) (*AppClaims, error) {
	if tokenStr == "" {
		return nil, errors.New("token vacío")
	}

	token, err := jwt.ParseWithClaims(tokenStr, &AppClaims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("método de firma inválido")
		}
		return []byte(secret), nil
	})

	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(*AppClaims)
	if !ok || !token.Valid {
		return nil, errors.New("token inválido")
	}

	return claims, nil
}

// ─── Helpers de autorización ──────────────────────────────────────────────────

// IsAutorizador retorna true si el rol puede autorizar acciones críticas del CAJERO.
func IsAutorizador(rol string) bool {
	return rol == RolAdmin || rol == RolEncargado
}

// CanAccessHUB retorna true si el rol tiene acceso al módulo HUB.
func CanAccessHUB(rol string) bool {
	return rol == RolAdmin || rol == RolEncargado || rol == RolDeposito
}

// CanAccessPOS retorna true si el rol puede operar el mostrador.
func CanAccessPOS(rol string) bool {
	return rol == RolAdmin || rol == RolEncargado || rol == RolCajero
}
