-- 002_create_sucursales.sql

CREATE TABLE IF NOT EXISTS sucursales (
    id VARCHAR(36) PRIMARY KEY,
    comercio_id VARCHAR(36) NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
    nombre VARCHAR(100) NOT NULL,
    direccion VARCHAR(255),
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
);

CREATE INDEX idx_sucursales_comercio ON sucursales(comercio_id);
