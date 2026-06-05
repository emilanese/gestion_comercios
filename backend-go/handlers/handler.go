package handlers

import "database/sql"

// Handler centraliza las dependencias compartidas por todos los HTTP handlers.
type Handler struct {
	DB        *sql.DB
	Hub       *WSHub
	JWTSecret string
}

// NewHandler crea un Handler con todas las dependencias inyectadas.
func NewHandler(db *sql.DB, hub *WSHub, jwtSecret string) *Handler {
	return &Handler{
		DB:        db,
		Hub:       hub,
		JWTSecret: jwtSecret,
	}
}
