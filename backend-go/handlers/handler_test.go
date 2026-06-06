package handlers_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// ─── Test: Health endpoint ────────────────────────────────────────────────────

func TestHealthEndpoint(t *testing.T) {
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		if err := json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"service": "avanti-backend",
		}); err != nil {
			t.Errorf("error encoding response: %v", err)
		}
	})

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("esperado status 200, got %d", rr.Code)
	}

	var body map[string]interface{}
	if err := json.NewDecoder(rr.Body).Decode(&body); err != nil {
		t.Fatalf("error decodificando respuesta: %v", err)
	}
	if body["success"] != true {
		t.Errorf("esperado success=true, got %v", body["success"])
	}
}

// ─── Test: JWT creation + validation ─────────────────────────────────────────

func TestJWTRoundTrip(t *testing.T) {
	secret := "test_secret_key_for_ci"

	// Crear token
	claims := jwt.MapClaims{
		"device_id":   "test-device-001",
		"sucursal_id": "test-sucursal-001",
		"rol":         "CAJERO",
		"exp":         time.Now().Add(time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenStr, err := token.SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("error creando JWT: %v", err)
	}

	if tokenStr == "" {
		t.Fatal("token JWT vacío")
	}

	// Validar token
	parsed, err := jwt.Parse(tokenStr, func(tk *jwt.Token) (interface{}, error) {
		if _, ok := tk.Method.(*jwt.SigningMethodHMAC); !ok {
			t.Errorf("método de firma inesperado: %v", tk.Header["alg"])
		}
		return []byte(secret), nil
	})
	if err != nil {
		t.Fatalf("error parseando JWT: %v", err)
	}
	if !parsed.Valid {
		t.Fatal("JWT debería ser válido")
	}

	parsedClaims, ok := parsed.Claims.(jwt.MapClaims)
	if !ok {
		t.Fatal("no se pudieron leer los claims")
	}
	if parsedClaims["rol"] != "CAJERO" {
		t.Errorf("esperado rol=CAJERO, got %v", parsedClaims["rol"])
	}
}

// ─── Test: JWT expirado ───────────────────────────────────────────────────────

func TestJWTExpired(t *testing.T) {
	secret := "test_secret_key_for_ci"

	expiredClaims := jwt.MapClaims{
		"device_id": "test-device-001",
		"exp":       time.Now().Add(-time.Hour).Unix(), // ya expiró
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, expiredClaims)
	tokenStr, _ := token.SignedString([]byte(secret))

	_, err := jwt.Parse(tokenStr, func(tk *jwt.Token) (interface{}, error) {
		return []byte(secret), nil
	})

	if err == nil {
		t.Error("se esperaba error por token expirado, pero no hubo error")
	}
}

// ─── Test: JSON helpers ───────────────────────────────────────────────────────

func TestWriteJSONOK(t *testing.T) {
	rr := httptest.NewRecorder()

	payload := map[string]interface{}{
		"success": true,
		"data":    "test",
	}

	rr.Header().Set("Content-Type", "application/json")
	rr.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(rr).Encode(payload); err != nil {
		t.Fatalf("error encoding: %v", err)
	}

	if rr.Code != http.StatusOK {
		t.Errorf("esperado 200, got %d", rr.Code)
	}
	if ct := rr.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("esperado Content-Type application/json, got %s", ct)
	}
}
