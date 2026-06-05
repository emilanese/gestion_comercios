/**
 * WatermelonDB Model classes — re-exports para uso en la app
 *
 * Registro de uso en la instancia Database:
 *   import { modelClasses } from '@shared-logic/db/models';
 *   const database = new Database({ schema, modelClasses });
 */

export { Producto } from './Producto';
export { ProductoPOS } from './ProductoPOS';
export { PrecioSucursal } from './PrecioSucursal';
export { StockSucursal } from './StockSucursal';
export { MedioPago } from './MedioPago';
export { HistorialTicketLocal } from './HistorialTicketLocal';
export { TicketDetalleLocal } from './TicketDetalleLocal';
export { TicketPagoLocal } from './TicketPagoLocal';
export { AuditoriaStockLocal } from './AuditoriaStockLocal';
export { HistorialPreciosCostosLocal } from './HistorialPreciosCostosLocal';
export { PromocionLocal } from './PromocionLocal';

import { Producto } from './Producto';
import { ProductoPOS } from './ProductoPOS';
import { PrecioSucursal } from './PrecioSucursal';
import { StockSucursal } from './StockSucursal';
import { MedioPago } from './MedioPago';
import { HistorialTicketLocal } from './HistorialTicketLocal';
import { TicketDetalleLocal } from './TicketDetalleLocal';
import { TicketPagoLocal } from './TicketPagoLocal';
import { AuditoriaStockLocal } from './AuditoriaStockLocal';
import { HistorialPreciosCostosLocal } from './HistorialPreciosCostosLocal';
import { PromocionLocal } from './PromocionLocal';

/** Array de Model classes para pasar a `new Database({ schema, modelClasses })` */
export const modelClasses = [
  Producto,
  ProductoPOS,
  PrecioSucursal,
  StockSucursal,
  MedioPago,
  HistorialTicketLocal,
  TicketDetalleLocal,
  TicketPagoLocal,
  AuditoriaStockLocal,
  HistorialPreciosCostosLocal,
  PromocionLocal,
];
