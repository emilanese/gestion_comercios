-- Migración 009: Datos de prueba (solo para desarrollo)
-- Crea un producto de ejemplo con precio y stock en la sucursal principal
-- NOTA: Este seed NO inserta el comercio ni la sucursal
--       (esos se crean via POST /auth/register)
-- Este archivo se puede ejecutar manualmente DESPUÉS de registrar tu comercio.

-- Para insertar un producto de prueba en tu comercio, ejecutá esto
-- reemplazando las variables:
--
-- INSERT INTO productos (id, comercio_id, ean, nombre, marca, categoria)
-- VALUES (
--   gen_random_uuid()::text,
--   '<tu_comercio_id>',
--   '7790001234567',
--   'Coca-Cola 500ml',
--   'Coca-Cola',
--   'Bebidas'
-- );
--
-- INSERT INTO precios_sucursal (producto_id, sucursal_id, precio_venta, precio_costo)
-- SELECT p.id, s.id, 1.50, 0.90
-- FROM productos p, sucursales s
-- WHERE p.ean = '7790001234567' AND s.comercio_id = '<tu_comercio_id>';
--
-- INSERT INTO stock_sucursal (producto_id, sucursal_id, cantidad, stock_minimo)
-- SELECT p.id, s.id, 100, 10
-- FROM productos p, sucursales s
-- WHERE p.ean = '7790001234567' AND s.comercio_id = '<tu_comercio_id>';

SELECT 'Seed 009: listo para configurar manualmente' AS status;
