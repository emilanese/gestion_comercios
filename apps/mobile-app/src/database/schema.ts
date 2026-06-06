/**
 * WatermelonDB Schema — base de datos local SQLite para el POS mobile.
 *
 * Tablas:
 *  - productos_local   → catálogo sincronizado desde el servidor
 *  - outbox_entries    → tickets pendientes de sincronizar (modo offline)
 */
import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const dbSchema = appSchema({
  version: 1,
  tables: [
    // ── Catálogo local de productos ─────────────────────────────────────────
    tableSchema({
      name: 'productos_local',
      columns: [
        { name: 'server_id',      type: 'string' },   // productoID del servidor
        { name: 'nombre',         type: 'string' },
        { name: 'marca',          type: 'string' },
        { name: 'ean',            type: 'string' },
        { name: 'precio_venta',   type: 'number' },
        { name: 'precio_oferta',  type: 'number', isOptional: true },
        { name: 'stock',          type: 'number' },
        { name: 'sucursal_id',    type: 'string' },
        { name: 'version',        type: 'number' },
        { name: 'updated_at',     type: 'number' },
      ],
    }),

    // ── Outbox: tickets confirmados offline, pendientes de enviar ───────────
    tableSchema({
      name: 'outbox_entries',
      columns: [
        { name: 'entity_type',    type: 'string' },   // siempre 'TICKET'
        { name: 'payload',        type: 'string' },   // JSON del body a enviar a /tickets/confirm
        { name: 'endpoint',       type: 'string' },   // '/tickets/confirm'
        { name: 'status',         type: 'string' },   // 'PENDING' | 'SYNCED' | 'ERROR'
        { name: 'error_message',  type: 'string', isOptional: true },
        { name: 'retry_count',    type: 'number' },
        { name: 'created_at',     type: 'number' },
        { name: 'synced_at',      type: 'number', isOptional: true },
      ],
    }),
  ],
});
