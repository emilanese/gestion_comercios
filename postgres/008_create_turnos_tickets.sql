-- Migración 008: Turnos de caja y tickets de venta
-- Usa VARCHAR(36) para IDs y FKs (consistente con tablas 001-005)

-- ─── Medios de pago ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS medios_pago (
    id          VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    comercio_id VARCHAR(36) NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
    nombre      VARCHAR(100) NOT NULL,
    tipo        VARCHAR(30) NOT NULL
                  CHECK (tipo IN ('EFECTIVO','DEBITO','CREDITO','QR','TRANSFERENCIA','OTRO')),
    activo      BOOLEAN DEFAULT TRUE,
    UNIQUE (comercio_id, tipo)
);

-- ─── Turnos de caja ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS turnos (
    id               VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    comercio_id      VARCHAR(36) NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
    sucursal_id      VARCHAR(36) NOT NULL REFERENCES sucursales(id) ON DELETE CASCADE,
    dispositivo_id   VARCHAR(36) REFERENCES dispositivos_autorizados(id),
    numero_terminal  INTEGER NOT NULL DEFAULT 1,
    operador_nombre  VARCHAR(200) NOT NULL,
    monto_inicial    NUMERIC(12,2) NOT NULL DEFAULT 0,
    saldo_esperado   NUMERIC(12,2) NOT NULL DEFAULT 0,
    estado           VARCHAR(20) NOT NULL DEFAULT 'ABIERTO'
                       CHECK (estado IN ('ABIERTO','CERRADO','SUSPENDIDO')),
    opened_at        BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
    closed_at        BIGINT,
    cierre_bloqueado BOOLEAN DEFAULT FALSE,
    ticket_count     INTEGER DEFAULT 0,
    created_at       BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
);

-- ─── Tickets (ventas) ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets (
    id              VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    turno_id        VARCHAR(36) NOT NULL REFERENCES turnos(id),
    sucursal_id     VARCHAR(36) NOT NULL REFERENCES sucursales(id),
    comercio_id     VARCHAR(36) NOT NULL REFERENCES comercios(id),
    numero          SERIAL,
    total           NUMERIC(12,2) NOT NULL,
    total_descuento NUMERIC(12,2) DEFAULT 0,
    estado          VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
                      CHECK (estado IN ('PENDIENTE','CONFIRMADO','ANULADO')),
    created_at      BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
    confirmed_at    BIGINT
);

-- ─── Detalle de ticket ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ticket_items (
    id               VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    ticket_id        VARCHAR(36) NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    producto_id      VARCHAR(36) REFERENCES productos(id),
    nombre_producto  VARCHAR(255) NOT NULL,
    ean              VARCHAR(20),
    cantidad         INTEGER NOT NULL,
    precio_unitario  NUMERIC(12,2) NOT NULL,
    precio_final     NUMERIC(12,2) NOT NULL,
    descuento        NUMERIC(12,2) DEFAULT 0,
    promocion_id     VARCHAR(36) REFERENCES promociones(id)
);

-- ─── Pagos del ticket ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ticket_pagos (
    id              VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    ticket_id       VARCHAR(36) NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    medio_pago_id   VARCHAR(36) REFERENCES medios_pago(id),
    tipo_pago       VARCHAR(30) NOT NULL,
    monto           NUMERIC(12,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_turnos_sucursal  ON turnos(sucursal_id, estado);
CREATE INDEX IF NOT EXISTS idx_tickets_turno    ON tickets(turno_id);
CREATE INDEX IF NOT EXISTS idx_tickets_sucursal ON tickets(sucursal_id, created_at);
