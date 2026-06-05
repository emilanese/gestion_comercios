package models

import (
	"crypto/sha256"
	"fmt"
)

// GeneratePINHash - Genera hash SHA256 del PIN (mismo método que el cliente)
func GeneratePINHash(pin string) string {
	hash := sha256.Sum256([]byte(pin))
	return fmt.Sprintf("%x", hash)
}

// ValidatePINHash - Valida un PIN contra su hash
func ValidatePINHash(enteredPin string, storedHash string) bool {
	return GeneratePINHash(enteredPin) == storedHash
}

// LoginAttempt - Registro de intento de login
type LoginAttempt struct {
	DeviceID      string
	Timestamp     int64
	Success       bool
	OperatorName  string
	ErrorReason   string `json:"error_reason,omitempty"`
}

// BlockedDevice - Registro de dispositivo bloqueado
type BlockedDevice struct {
	DeviceID         string
	ComercioID       string
	BlockedUntil     int64
	FailedAttempts   int
	LastAttemptTime  int64
	UnblockedRemotely bool
}
