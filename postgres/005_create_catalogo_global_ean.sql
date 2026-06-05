-- 005_create_catalogo_global_ean.sql

CREATE TABLE IF NOT EXISTS catalogo_global_ean (
    codigo_barras VARCHAR(50) PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    marca VARCHAR(100),
    categoria VARCHAR(100),
    origen_dato VARCHAR(50) DEFAULT 'CROWDSOURCING'
);

CREATE INDEX idx_catalogo_nombre ON catalogo_global_ean(nombre);
CREATE INDEX idx_catalogo_marca ON catalogo_global_ean(marca);
CREATE INDEX idx_catalogo_categoria ON catalogo_global_ean(categoria);
