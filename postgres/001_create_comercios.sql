-- 001_create_comercios.sql
-- Tabla de comercios (tenants del SaaS)

CREATE TABLE IF NOT EXISTS comercios (
    id VARCHAR(36) PRIMARY KEY,
    nombre_empresa VARCHAR(150) NOT NULL,
    email_dueno VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    estado_cuenta VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
    idioma_preferido VARCHAR(10) DEFAULT 'es',
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
);

CREATE INDEX idx_comercios_email ON comercios(email_dueno);
CREATE INDEX idx_comercios_estado ON comercios(estado_cuenta);
