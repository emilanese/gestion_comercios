package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"github.com/redis/go-redis/v9"

	"gestion_comercios/handlers"
	"gestion_comercios/models"
)

// ─── Config ───────────────────────────────────────────────────────────────────

type Config struct {
	DbURL      string
	ServerPort string
	JWTSecret  string
	RedisURL   string
}

// ─── Server ───────────────────────────────────────────────────────────────────

type Server struct {
	db      *sql.DB
	config  Config
	hub     *handlers.WSHub
	handler *handlers.Handler
}

func NewServer() *Server {
	_ = godotenv.Load()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://user:password@localhost:5432/comercios_db?sslmode=disable"
	}
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		jwtSecret = "dev-secret-change-in-production"
		log.Println("[Server] ⚠️  JWT_SECRET no configurado — usando valor de desarrollo")
	}

	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatalf("[Server] Error abriendo BD: %v", err)
	}
	if err := db.Ping(); err != nil {
		log.Printf("[Server] ⚠️  BD no disponible: %v — continuando en modo degradado", err)
	}

	// Inicializar Redis (opcional — si no está disponible, el sistema funciona en modo degradado)
	var rdb *redis.Client
	if redisURL := os.Getenv("REDIS_URL"); redisURL != "" {
		opt, err := redis.ParseURL(redisURL)
		if err != nil {
			log.Printf("[Server] ⚠️  REDIS_URL inválida (%v) — versiones sin CAS", err)
		} else {
			rdb = redis.NewClient(opt)
			if pingErr := rdb.Ping(context.Background()).Err(); pingErr != nil {
				log.Printf("[Server] ⚠️  Redis no disponible (%v) — versiones sin CAS", pingErr)
				rdb = nil
			} else {
				log.Println("[Server] ✅ Redis conectado")
			}
		}
	}

	vs  := handlers.NewVersionStore(rdb)
	hub := handlers.NewWSHub(vs)

	return &Server{
		db: db,
		config: Config{
			DbURL:      dbURL,
			ServerPort: os.Getenv("PORT"),
			JWTSecret:  jwtSecret,
			RedisURL:   os.Getenv("REDIS_URL"),
		},
		hub:     hub,
		handler: handlers.NewHandler(db, hub, jwtSecret),
	}
}

// ─── Middleware JWT ───────────────────────────────────────────────────────────

// jwtMiddleware valida el header Authorization: Bearer <token>.
// Inyecta los claims en el contexto de la petición via X-Claims-* headers.
func (s *Server) jwtMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			http.Error(w, `{"error":"Authorization header requerido"}`, http.StatusUnauthorized)
			return
		}

		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
		claims, err := handlers.ValidateToken(tokenStr, s.config.JWTSecret)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": "Token inválido: " + err.Error()})
			return
		}

		// Inyectar claims como headers internos para los handlers
		r.Header.Set("X-Comercio-ID", claims.ComercioID)
		r.Header.Set("X-Sucursal-ID", claims.SucursalID)
		r.Header.Set("X-Device-ID", claims.DeviceID)
		r.Header.Set("X-Rol", claims.Rol)

		next(w, r)
	}
}

// ─── Run ──────────────────────────────────────────────────────────────────────

func (s *Server) Run() {
	if s.config.ServerPort == "" {
		s.config.ServerPort = "8080"
	}

	go s.hub.Run()

	mux := http.NewServeMux()

	// ── Públicas ──────────────────────────────────────────────────────────
	mux.HandleFunc("/health", s.healthHandler)
	mux.HandleFunc("/sync/ping", s.syncPingHandler)

	// ── Auth ─────────────────────────────────────────────────────────────
	mux.HandleFunc("/auth/register", s.authRegisterHandler)
	mux.HandleFunc("/auth/login", s.authLoginHandler)
	mux.HandleFunc("/auth/validate-pin", s.handler.ValidatePINHandler)

	// ── Enrolamiento ──────────────────────────────────────────────────────
	mux.HandleFunc("/devices/enroll", s.handler.DeviceEnrollHandler)

	// ── Administración (requiere JWT) ─────────────────────────────────────
	mux.HandleFunc("/admin/unblock-device", s.jwtMiddleware(s.handler.RemoteUnblockDeviceHandler))

	// ── Turnos (requiere JWT) ─────────────────────────────────────────────
	mux.HandleFunc("/turns/open", s.jwtMiddleware(handlers.OpenTurnHandler))
	mux.HandleFunc("/turns/close", s.jwtMiddleware(handlers.CloseTurnHandler))
	mux.HandleFunc("/turns/active", s.jwtMiddleware(handlers.GetActiveTurnHandler))

	// ── Productos (requiere JWT) ───────────────────────────────────────────
	mux.HandleFunc("/products", s.jwtMiddleware(handlers.GetProductsHandler))
	mux.HandleFunc("/products/search", s.jwtMiddleware(handlers.SearchProductsHandler))
	mux.HandleFunc("/products/by-barcode", s.jwtMiddleware(handlers.SearchProductByBarcodeHandler))

	// ── Promociones (requiere JWT) ────────────────────────────────────────
	mux.HandleFunc("/promotions/active", s.jwtMiddleware(s.handler.GetActivePromotionsHandler))
	mux.HandleFunc("/promotions/evaluate", s.jwtMiddleware(s.handler.EvaluatePromotionsHandler))

	// ── WebSocket ─────────────────────────────────────────────────────────
	mux.HandleFunc("/ws", s.wsHandler)

	log.Printf("[Server] ✅ Iniciando en puerto %s", s.config.ServerPort)
	if err := http.ListenAndServe(":"+s.config.ServerPort, mux); err != nil {
		log.Fatalf("[Server] Error: %v", err)
	}
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

func (s *Server) healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"status":"ok","timestamp":%d}`, time.Now().UnixMilli())
}

func (s *Server) syncPingHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"type":"PONG_SYNC","timestamp":%d}`, time.Now().UnixMilli())
}

// authRegisterHandler — POST /auth/register
// Crea un nuevo comercio (primer usuario del SaaS).
// Solo funciona si el email no existe. No requiere JWT.
func (s *Server) authRegisterHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")

	var req struct {
		Email          string `json:"email"`
		Password       string `json:"password"`
		NombreEmpresa  string `json:"nombre_empresa"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "JSON inválido"})
		return
	}
	if req.Email == "" || req.Password == "" || req.NombreEmpresa == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "email, password y nombre_empresa son requeridos"})
		return
	}
	if len(req.Password) < 6 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "La contraseña debe tener al menos 6 caracteres"})
		return
	}

	// Verificar si el email ya existe
	var count int
	_ = s.db.QueryRow(`SELECT COUNT(*) FROM comercios WHERE email_dueno = $1`, req.Email).Scan(&count)
	if count > 0 {
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]string{"error": "El email ya está registrado"})
		return
	}

	// Generar ID y hash de contraseña
	comercioID := fmt.Sprintf("%d", time.Now().UnixNano()) // ID simple para dev
	passwordHash := models.GeneratePINHash(req.Password)

	// Insertar comercio
	_, err := s.db.Exec(
		`INSERT INTO comercios (id, nombre_empresa, email_dueno, password_hash, estado_cuenta)
		 VALUES ($1, $2, $3, $4, 'ACTIVO')`,
		comercioID, req.NombreEmpresa, req.Email, passwordHash,
	)
	if err != nil {
		log.Printf("[Register] Error DB: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Error guardando el comercio"})
		return
	}

	// Crear sucursal principal automáticamente
	sucursalID := fmt.Sprintf("%d", time.Now().UnixNano()+1)
	_, _ = s.db.Exec(
		`INSERT INTO sucursales (id, comercio_id, nombre, direccion)
		 VALUES ($1, $2, $3, $4)`,
		sucursalID, comercioID, "Sucursal Principal", "Sin dirección",
	)

	// Emitir JWT de sesión
	token, err := handlers.GenerateToken(comercioID, sucursalID, "", "GESTOR", s.config.JWTSecret)
	if err != nil {
		log.Printf("[Register] Error generando token: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Error generando sesión"})
		return
	}

	log.Printf("[Register] ✅ Nuevo comercio registrado: %s (%s)", req.NombreEmpresa, req.Email)
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":      true,
		"comercio_id":  comercioID,
		"sucursal_id":  sucursalID,
		"token":        token,
		"rol":          "GESTOR",
		"message":      "Comercio registrado exitosamente",
	})
}

// authLoginHandler — POST /auth/login
// Valida email + password_hash del gestor/admin desde la tabla comercios.
func (s *Server) authLoginHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	var req struct {
		Email     string `json:"email"`
		Password  string `json:"password"`
		SucursalID string `json:"sucursal_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "JSON inválido"})
		return
	}
	if req.Email == "" || req.Password == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "email y password son requeridos"})
		return
	}

	// Consultar comercio por email
	var comercioID, passwordHash string
	err := s.db.QueryRow(
		`SELECT id, password_hash FROM comercios WHERE email_dueno = $1 AND estado_cuenta = 'ACTIVO'`,
		req.Email,
	).Scan(&comercioID, &passwordHash)

	if err == sql.ErrNoRows {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "Credenciales inválidas"})
		return
	}
	if err != nil {
		log.Printf("[Login] Error DB: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Error interno"})
		return
	}

	// Validar contraseña (SHA-256 hex — consistente con handlers/auth.go y models/hash.go)
	if models.GeneratePINHash(req.Password) != passwordHash {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "Credenciales inválidas"})
		return
	}

	// Emitir JWT
	sucursalID := req.SucursalID
	if sucursalID == "" {
		sucursalID = "" // el gestor puede no tener sucursal específica
	}

	token, err := handlers.GenerateToken(comercioID, sucursalID, "", "GESTOR", s.config.JWTSecret)
	if err != nil {
		log.Printf("[Login] Error generando token: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Error generando token"})
		return
	}

	log.Printf("[Login] ✅ Login exitoso — comercio: %s", comercioID)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":     true,
		"token":       token,
		"comercio_id": comercioID,
		"rol":         "GESTOR",
	})
}

// ─── WebSocket ────────────────────────────────────────────────────────────────

var wsUpgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // TODO producción: validar origen contra whitelist
	},
}

// wsHandler — GET /ws?token=<JWT>
// Acepta la conexión WebSocket después de validar el token JWT.
func (s *Server) wsHandler(w http.ResponseWriter, r *http.Request) {
	// Validar JWT desde query param
	tokenStr := r.URL.Query().Get("token")
	if tokenStr == "" {
		// También aceptar del header Authorization
		auth := r.Header.Get("Authorization")
		if strings.HasPrefix(auth, "Bearer ") {
			tokenStr = strings.TrimPrefix(auth, "Bearer ")
		}
	}

	claims, err := handlers.ValidateToken(tokenStr, s.config.JWTSecret)
	if err != nil {
		http.Error(w, `{"error":"Token WS inválido"}`, http.StatusUnauthorized)
		return
	}

	conn, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[WS] Error upgrade: %v", err)
		return
	}

	client := &handlers.WSClient{
		Hub:        s.hub,
		Conn:       conn,
		Send:       make(chan interface{}, 256),
		SucursalID: claims.SucursalID,
		DeviceID:   claims.DeviceID,
		Rol:        claims.Rol,
	}

	s.hub.Register <- client

	// Enviar bienvenida con timestamp del servidor (para time drift)
	client.Send <- map[string]interface{}{
		"type":      "CONNECTED",
		"timestamp": time.Now().UnixMilli(),
		"sucursal":  claims.SucursalID,
		"devices":   s.hub.ConnectedDevices(claims.SucursalID),
	}

	go client.ReadPump()
	go client.WritePump()
}

// ─── Entry point ──────────────────────────────────────────────────────────────

func main() {
	server := NewServer()
	server.Run()
}
