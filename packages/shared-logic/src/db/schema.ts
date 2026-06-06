// @ts-nocheck — WatermelonDB schema, not type-checked in web context
import { appSchema, tableSchema } from '@nozbe/watermelondb';

/**
 * Schema WatermelonDB v2
 * Versión 2: agrega tabla productos_pos (desnormalizada, para búsqueda rápida en POS)
 */
export const schema = appSchema({
  version: 2,
  tables: [
    // ── Catálogo de productos (descargado desde Gestor Cloud) ──────────────
    tableSchema({
      name: 'productos',
      columns: [
        { name: 'codigo_barras', type: 'string', isIndexed: true },
        { name: 'nombre', type: 'string', isIndexed: true },
        { name: 'marca', type: 'string', isIndexed: true },
        { name: 'categoria', type: 'string', isIndexed: true },
        { name: 'descripcion', type: 'string' },
        { name: 'ultima_actualizacion', type: 'number' }
      ]
    }),

    // ── Vista desnormalizada para búsqueda en POS (producto + precio + stock) ─
    // Poblada en enrolamiento y actualizada por mensajes WebSocket
    // (STOCK_UPDATE, PRECIO_UPDATE, PROMO_ACTIVADA)
    tableSchema({
      name: 'productos_pos',
      columns: [
        { name: 'producto_id', type: 'string', isIndexed: true },
        { name: 'codigo_barras', type: 'string', isIndexed: true },
        { name: 'nombre', type: 'string', isIndexed: true },
        { name: 'marca', type: 'string', isIndexed: true },
        { name: 'categoria', type: 'string', isIndexed: true },
        { name: 'descripcion', type: 'string' },
        { name: 'precio_venta', type: 'number' },
        { name: 'precio_oferta', type: 'number' },   // 0 si no hay promo activa
        { name: 'tiene_promo', type: 'boolean' },
        { name: 'stock', type: 'number' },
        { name: 'stock_minimo', type: 'number' },
        { name: 'ultima_actualizacion', type: 'number' }
      ]
    }),

    // ── Precios por sucursal ───────────────────────────────────────────────
    tableSchema({
      name: 'precios_sucursal',
      columns: [
        { name: 'producto_id', type: 'string', isIndexed: true },
        { name: 'sucursal_id', type: 'string', isIndexed: true },
        { name: 'precio_venta', type: 'number' },
        { name: 'porcentaje_ganancia', type: 'number' },
        { name: 'ultima_actualizacion', type: 'number' }
      ]
    }),

    // ── Stock por sucursal ────────────────────────────────────────────────
    tableSchema({
      name: 'stock_sucursal',
      columns: [
        { name: 'producto_id', type: 'string', isIndexed: true },
        { name: 'sucursal_id', type: 'string', isIndexed: true },
        { name: 'cantidad', type: 'number' },
        { name: 'stock_minimo', type: 'number' },
        { name: 'ultima_actualizacion', type: 'number' }
      ]
    }),

    // ── Medios de pago ────────────────────────────────────────────────────
    tableSchema({
      name: 'medios_pago',
      columns: [
        { name: 'comercio_id', type: 'string', isIndexed: true },
        { name: 'nombre', type: 'string' },
        { name: 'activo', type: 'boolean' },
        { name: 'ultima_actualizacion', type: 'number' }
      ]
    }),

    // ── Tickets emitidos en este terminal (cola offline-first) ────────────
    tableSchema({
      name: 'historial_tickets_local',
      columns: [
        { name: 'sucursal_id', type: 'string', isIndexed: true },
        { name: 'turno_id', type: 'string', isIndexed: true },
        { name: 'dispositivo_emisor_id', type: 'string' },
        { name: 'vendedor_nombre', type: 'string' },
        { name: 'nombre_cliente', type: 'string' },
        { name: 'total_ticket', type: 'number' },
        { name: 'estado_sincronizacion', type: 'string', isIndexed: true }, // PENDIENTE | CONFIRMADO
        { name: 'created_at', type: 'number' }
      ]
    }),

    // ── Detalles de cada ticket ────────────────────────────────────────────
    tableSchema({
      name: 'ticket_detalles_local',
      columns: [
        { name: 'ticket_id', type: 'string', isIndexed: true },
        { name: 'producto_id', type: 'string' },
        { name: 'nombre_producto_snapshot', type: 'string' },
        { name: 'cantidad', type: 'number' },
        { name: 'precio_unitario', type: 'number' },
        { name: 'precio_oferta_snapshot', type: 'number' } // 0 si no hubo promo
      ]
    }),

    // ── Pagos de cada ticket ───────────────────────────────────────────────
    tableSchema({
      name: 'ticket_pagos_local',
      columns: [
        { name: 'ticket_id', type: 'string', isIndexed: true },
        { name: 'medio_pago_id', type: 'string' },
        { name: 'monto_pagado', type: 'number' },
        { name: 'monto_recibido', type: 'number' },
        { name: 'vuelto', type: 'number' }
      ]
    }),

    // ── Auditoría de movimientos de stock ─────────────────────────────────
    tableSchema({
      name: 'auditoria_stock_local',
      columns: [
        { name: 'producto_id', type: 'string', isIndexed: true },
        { name: 'sucursal_id', type: 'string', isIndexed: true },
        { name: 'dispositivo_operador_id', type: 'string' },
        { name: 'rol_operador', type: 'string' }, // ADMIN | OPERADOR_STOCK
        { name: 'concepto', type: 'string' }, // VENTA_POS | INVENTARIO | INGRESO | EGRESO
        { name: 'cantidad_anterior', type: 'number' },
        { name: 'variacion_delta', type: 'number' },
        { name: 'cantidad_resultante', type: 'number' },
        { name: 'motivo_descripcion', type: 'string' },
        { name: 'estado_sincronizacion', type: 'string', isIndexed: true }, // PENDIENTE | CONFIRMADO
        { name: 'created_at', type: 'number' }
      ]
    }),

    // ── Historial de cambios de precios y costos ──────────────────────────
    tableSchema({
      name: 'historial_precios_costos_local',
      columns: [
        { name: 'producto_id', type: 'string', isIndexed: true },
        { name: 'sucursal_id', type: 'string', isIndexed: true },
        { name: 'dispositivo_operador_id', type: 'string' },
        { name: 'origen_cambio', type: 'string' }, // ABM_PRODUCTO | INGRESO_COMPRA
        { name: 'costo_anterior', type: 'number' },
        { name: 'costo_nuevo', type: 'number' },
        { name: 'precio_venta_anterior', type: 'number' },
        { name: 'precio_venta_nuevo', type: 'number' },
        { name: 'created_at', type: 'number' }
      ]
    }),

    // ── Promociones activas en esta sucursal ──────────────────────────────
    tableSchema({
      name: 'promociones_local',
      columns: [
        { name: 'producto_id', type: 'string', isIndexed: true },
        { name: 'sucursal_id', type: 'string', isIndexed: true },
        { name: 'precio_oferta', type: 'number' },
        { name: 'fecha_inicio', type: 'number' },
        { name: 'fecha_fin', type: 'number' },
        { name: 'limite_cantidad', type: 'number' },
        { name: 'cantidad_restante', type: 'number' },
        { name: 'estado', type: 'string', isIndexed: true }, // PROGRAMADA | ACTIVA | AGOTADA | FINALIZADA
        { name: 'ultima_actualizacion', type: 'number' }
      ]
    })
  ]
});

// ─── Record types (para tipado sin instanciar Models) ────────────────────────

export interface ProductoRecord {
  id: string;
  codigo_barras: string | null;
  nombre: string;
  marca: string | null;
  categoria: string | null;
  descripcion: string | null;
  ultima_actualizacion: number;
}

export interface ProductoPOSRecord {
  id: string;
  producto_id: string;
  codigo_barras: string;
  nombre: string;
  marca: string;
  categoria: string;
  descripcion: string;
  precio_venta: number;
  precio_oferta: number;
  tiene_promo: boolean;
  stock: number;
  stock_minimo: number;
  ultima_actualizacion: number;
}

export interface PrecioSucursalRecord {
  id: string;
  producto_id: string;
  sucursal_id: string;
  precio_venta: number;
  porcentaje_ganancia: number;
  ultima_actualizacion: number;
}

export interface StockSucursalRecord {
  id: string;
  producto_id: string;
  sucursal_id: string;
  cantidad: number;
  stock_minimo: number;
  ultima_actualizacion: number;
}

export interface MedioPagoRecord {
  id: string;
  comercio_id: string;
  nombre: string;
  activo: boolean;
  ultima_actualizacion: number;
}

export interface HistorialTicketLocalRecord {
  id: string;
  sucursal_id: string;
  turno_id: string;
  dispositivo_emisor_id: string;
  vendedor_nombre: string;
  nombre_cliente: string;
  total_ticket: number;
  estado_sincronizacion: 'PENDIENTE' | 'CONFIRMADO';
  created_at: number;
}

export interface TicketDetalleLocalRecord {
  id: string;
  ticket_id: string;
  producto_id: string;
  nombre_producto_snapshot: string;
  cantidad: number;
  precio_unitario: number;
  precio_oferta_snapshot: number;
}

export interface TicketPagoLocalRecord {
  id: string;
  ticket_id: string;
  medio_pago_id: string;
  monto_pagado: number;
  monto_recibido: number;
  vuelto: number;
}

export interface AuditoriaStockLocalRecord {
  id: string;
  producto_id: string;
  sucursal_id: string;
  dispositivo_operador_id: string;
  rol_operador: 'ADMIN' | 'OPERADOR_STOCK';
  concepto: 'VENTA_POS' | 'INVENTARIO' | 'INGRESO' | 'EGRESO';
  cantidad_anterior: number;
  variacion_delta: number;
  cantidad_resultante: number;
  motivo_descripcion: string | null;
  estado_sincronizacion: 'PENDIENTE' | 'CONFIRMADO';
  created_at: number;
}

export interface HistorialPreciosCostosLocalRecord {
  id: string;
  producto_id: string;
  sucursal_id: string;
  dispositivo_operador_id: string;
  origen_cambio: 'ABM_PRODUCTO' | 'INGRESO_COMPRA';
  costo_anterior: number;
  costo_nuevo: number;
  precio_venta_anterior: number;
  precio_venta_nuevo: number;
  created_at: number;
}

export interface PromocionLocalRecord {
  id: string;
  producto_id: string;
  sucursal_id: string;
  precio_oferta: number;
  fecha_inicio: number;
  fecha_fin: number;
  limite_cantidad: number;
  cantidad_restante: number;
  estado: 'PROGRAMADA' | 'ACTIVA' | 'AGOTADA' | 'FINALIZADA';
  ultima_actualizacion: number;
}
