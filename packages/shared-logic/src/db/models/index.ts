/**
 * Tipos de dominio complementarios para los modelos de datos locales.
 *
 * NOTA: ProductoRecord, PrecioSucursalRecord, StockSucursalRecord y
 * MedioPagoRecord ya están definidos en ./db/schema — no se reexportan aquí.
 * Este archivo solo agrega los tipos de Ticket, Auditoría e Historial de precios.
 */

// ─── Estados ──────────────────────────────────────────────────────────────────

export type TicketEstadoLocal = 'PENDIENTE' | 'CONFIRMADO' | 'ANULADO';

export type TipoPromocionLocal =
  | 'DESCUENTO_PORCENTAJE'
  | 'PRECIO_FIJO'
  | '2x1'
  | '3x2'
  | 'COMBO';

export type TipoMovimientoStock =
  | 'INGRESO'
  | 'EGRESO'
  | 'AJUSTE'
  | 'VENTA'
  | 'ANULACION';

// ─── Historial de tickets ─────────────────────────────────────────────────────

export interface HistorialTicketRecord {
  id: string;
  turnoId: string;
  sucursalId: string;
  comercioId: string;
  numero: number;
  total: number;
  totalDescuento: number;
  estado: TicketEstadoLocal;
  createdAt: number;  // ms epoch
  confirmedAt: number;
}

export interface TicketDetalleRecord {
  id: string;
  ticketId: string;
  productoId: string;
  nombreProducto: string;
  ean: string;
  cantidad: number;
  precioUnitario: number;
  precioFinal: number;
  descuento: number;
  promocionId: string;
}

export interface TicketPagoRecord {
  id: string;
  ticketId: string;
  tipoPago: string;
  monto: number;
}

// ─── Auditoría de stock ───────────────────────────────────────────────────────

export interface AuditoriaStockRecord {
  id: string;
  productoId: string;
  sucursalId: string;
  comercioId: string;
  tipo: TipoMovimientoStock;
  cantidadDelta: number;
  stockAntes: number;
  stockDespues: number;
  ticketId: string;
  operadorNombre: string;
  motivo: string;
  createdAt: number;
}

// ─── Historial de precios / costos ────────────────────────────────────────────

export interface HistorialPrecioCostoRecord {
  id: string;
  productoId: string;
  sucursalId: string;
  precioVentaAnterior: number;
  precioVentaNuevo: number;
  precioCostoAnterior: number;
  precioCostoNuevo: number;
  changedBy: string;
  createdAt: number;
}
