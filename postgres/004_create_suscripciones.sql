-- 004_create_suscripciones.sql

CREATE TABLE IF NOT EXISTS suscripciones (
    id VARCHAR(36) PRIMARY KEY,
    comercio_id VARCHAR(36) NOT NULL UNIQUE REFERENCES comercios(id) ON DELETE CASCADE,
    pasarela_nombre VARCHAR(50) NOT NULL,
    customer_id_externo VARCHAR(150),
    subscription_id_externa VARCHAR(150),
    plan_tipo VARCHAR(50) DEFAULT 'PLAN_BASICO',
    fecha_vencimiento_actual BIGINT,
    fecha_limite_gracia BIGINT,
    updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
);

CREATE INDEX idx_suscripciones_comercio ON suscripciones(comercio_id);
