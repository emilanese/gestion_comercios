-- Migración 010: Registro de auditoría de autorizaciones
-- Tabla inmutable: nunca se hacen UPDATE ni DELETE.
-- Registra el flujo completo de autorizaciones remotas vía WebSocket:
--   CAJERO solicita → ENCARGADO/ADMIN aprueba o rechaza → se graba aquí.
--
-- Uso: anulaciones de ticket, descuentos manuales, apertura de caja fuera de horario, etc.

CREATE TABLE IF NOT EXISTS auditoria_autorizaciones (
    -- Identificación
    id               VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    request_id       VARCHAR(36) NOT NULL UNIQUE,  -- UUID generado por el POS solicitante
    comercio_id      VARCHAR(36) NOT NULL REFERENCES comercios(id),
    sucursal_id      VARCHAR(36) NOT NULL REFERENCES sucursales(id),

    -- Qué se solicitó
    tipo_accion      VARCHAR(50) NOT NULL
                       CHECK (tipo_accion IN (
                         'ANULACION_TICKET',
                         'DESCUENTO_MANUAL',
                         'APERTURA_CAJA',
                         'CIERRE_FORZADO',
                         'MODIFICACION_PRECIO',
                         'EGRESO_STOCK',
                         'OTRO'
                       )),
    ticket_ref_id    VARCHAR(36),   -- ID del ticket involucrado (si aplica)
    monto_impacto    NUMERIC(12,2), -- monto del descuento o ticket anulado

    -- Quién lo solicitó (CAJERO)
    pos_device_id    VARCHAR(36),
    cajero_nombre    VARCHAR(200),

    -- Quién lo resolvió (ENCARGADO/ADMIN)
    autorizador_id   VARCHAR(36),   -- device ID del autorizador
    autorizador_rol  VARCHAR(20),   -- ADMIN | ENCARGADO
    autorizador_nombre VARCHAR(200),

    -- Estado y timestamps
    estado           VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
                       CHECK (estado IN ('PENDIENTE', 'APROBADO', 'RECHAZADO', 'EXPIRADO')),
    motivo_rechazo   TEXT,
    created_at       BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
    resolved_at      BIGINT
);

CREATE INDEX IF NOT EXISTS idx_auditoria_sucursal    ON auditoria_autorizaciones(sucursal_id, created_at);
CREATE INDEX IF NOT EXISTS idx_auditoria_request_id  ON auditoria_autorizaciones(request_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_pos_device  ON auditoria_autorizaciones(pos_device_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_estado      ON auditoria_autorizaciones(estado, created_at);
