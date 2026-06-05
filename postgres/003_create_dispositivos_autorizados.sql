-- 003_create_dispositivos_autorizados.sql

CREATE TABLE IF NOT EXISTS dispositivos_autorizados (
    id VARCHAR(36) PRIMARY KEY,
    comercio_id VARCHAR(36) NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
    sucursal_id VARCHAR(36) NOT NULL REFERENCES sucursales(id) ON DELETE CASCADE,
    id_hardware_dispositivo VARCHAR(255) UNIQUE,
    alias_nombre VARCHAR(100) NOT NULL,
    pin_acceso_hash VARCHAR(255) NOT NULL,
    rol VARCHAR(20) NOT NULL CHECK (rol IN ('ADMIN', 'OPERADOR_STOCK', 'POS_CAJERO', 'GERENTE')),
    estado_terminal VARCHAR(20) NOT NULL DEFAULT 'AUTORIZADO' CHECK (estado_terminal IN ('AUTORIZADO', 'BLOQUEADO_POR_PIN')),
    token_enrolamiento VARCHAR(100),
    updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
);

CREATE INDEX idx_dispositivos_comercio ON dispositivos_autorizados(comercio_id);
CREATE INDEX idx_dispositivos_sucursal ON dispositivos_autorizados(sucursal_id);
CREATE INDEX idx_dispositivos_hardware ON dispositivos_autorizados(id_hardware_dispositivo);
