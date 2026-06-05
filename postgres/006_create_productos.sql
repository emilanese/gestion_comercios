-- Migración 006: Tabla de productos, precios por sucursal y stock
-- Usa VARCHAR(36) para IDs y FKs (consistente con tablas 001-005)

CREATE TABLE IF NOT EXISTS productos (
    id              VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    comercio_id     VARCHAR(36) NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
    ean             VARCHAR(20),
    codigo_interno  VARCHAR(50),
    nombre          VARCHAR(255) NOT NULL,
    descripcion     TEXT,
    marca           VARCHAR(100),
    categoria       VARCHAR(100),
    unidad_medida   VARCHAR(20)  DEFAULT 'unidad',
    activo          BOOLEAN      DEFAULT TRUE,
    created_at      BIGINT       DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
    updated_at      BIGINT       DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
    UNIQUE (comercio_id, ean)
);

-- Precios por sucursal (pueden diferir entre sucursales)
CREATE TABLE IF NOT EXISTS precios_sucursal (
    id              VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    producto_id     VARCHAR(36) NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    sucursal_id     VARCHAR(36) NOT NULL REFERENCES sucursales(id) ON DELETE CASCADE,
    precio_venta    NUMERIC(12,2) NOT NULL,
    precio_costo    NUMERIC(12,2),
    updated_at      BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
    UNIQUE (producto_id, sucursal_id)
);

-- Stock por sucursal
CREATE TABLE IF NOT EXISTS stock_sucursal (
    id              VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    producto_id     VARCHAR(36) NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    sucursal_id     VARCHAR(36) NOT NULL REFERENCES sucursales(id) ON DELETE CASCADE,
    cantidad        INTEGER NOT NULL DEFAULT 0,
    stock_minimo    INTEGER NOT NULL DEFAULT 0,
    updated_at      BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
    UNIQUE (producto_id, sucursal_id)
);

CREATE INDEX IF NOT EXISTS idx_productos_comercio  ON productos(comercio_id);
CREATE INDEX IF NOT EXISTS idx_productos_ean        ON productos(ean);
CREATE INDEX IF NOT EXISTS idx_precios_sucursal     ON precios_sucursal(sucursal_id);
CREATE INDEX IF NOT EXISTS idx_stock_sucursal       ON stock_sucursal(sucursal_id);
