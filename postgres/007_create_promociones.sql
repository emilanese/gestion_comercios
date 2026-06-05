-- Migración 007: Tabla de promociones por sucursal
-- Tipos soportados por el motor de promociones del backend Go:
--   DESCUENTO_PORCENTAJE, PRECIO_FIJO, 2x1, 3x2, COMBO
-- Usa VARCHAR(36) para IDs y FKs (consistente con tablas 001-005)

CREATE TABLE IF NOT EXISTS promociones (
    id                   VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    comercio_id          VARCHAR(36) NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
    sucursal_id          VARCHAR(36) NOT NULL REFERENCES sucursales(id) ON DELETE CASCADE,
    producto_id          VARCHAR(36) REFERENCES productos(id) ON DELETE SET NULL,
    nombre               VARCHAR(255) NOT NULL,
    descripcion          TEXT,
    tipo                 VARCHAR(30) NOT NULL
                           CHECK (tipo IN ('DESCUENTO_PORCENTAJE','PRECIO_FIJO','2x1','3x2','COMBO')),
    descuento_porcentaje NUMERIC(5,2),
    precio_fijo          NUMERIC(12,2),
    cantidad_minima      INTEGER DEFAULT 1,
    cantidad_gratis      INTEGER DEFAULT 0,
    fecha_inicio         TIMESTAMPTZ NOT NULL,
    fecha_fin            TIMESTAMPTZ NOT NULL,
    activa               BOOLEAN DEFAULT TRUE,
    created_at           BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
    updated_at           BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
    CHECK (fecha_fin > fecha_inicio)
);

CREATE INDEX IF NOT EXISTS idx_promociones_sucursal  ON promociones(sucursal_id);
CREATE INDEX IF NOT EXISTS idx_promociones_activa    ON promociones(activa, fecha_inicio, fecha_fin);
CREATE INDEX IF NOT EXISTS idx_promociones_producto  ON promociones(producto_id);
