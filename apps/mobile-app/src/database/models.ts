/**
 * WatermelonDB Models — clases que representan las tablas locales.
 */
import { Model } from '@nozbe/watermelondb';
import { field, readonly, date } from '@nozbe/watermelondb/decorators';

// ── ProductoLocal ─────────────────────────────────────────────────────────────
export class ProductoLocal extends Model {
  static table = 'productos_local';

  @field('server_id')      serverID!: string;
  @field('nombre')         nombre!: string;
  @field('marca')          marca!: string;
  @field('ean')            ean!: string;
  @field('precio_venta')   precioVenta!: number;
  @field('precio_oferta')  precioOferta!: number | null;
  @field('stock')          stock!: number;
  @field('sucursal_id')    sucursalID!: string;
  @field('version')        version!: number;
  @readonly @date('updated_at') updatedAt!: Date;

  // Helper para construir el objeto Producto usado en el POS
  toProducto() {
    return {
      productoID:   this.serverID,
      nombre:       this.nombre,
      marca:        this.marca,
      ean:          this.ean,
      precioVenta:  this.precioVenta,
      precioOferta: this.precioOferta ?? undefined,
      stock:        this.stock,
      promocion:    null,
    };
  }
}

// ── OutboxEntry ───────────────────────────────────────────────────────────────
export class OutboxEntry extends Model {
  static table = 'outbox_entries';

  @field('entity_type')   entityType!: string;
  @field('payload')       payload!: string;        // JSON string
  @field('endpoint')      endpoint!: string;
  @field('status')        status!: string;          // PENDING | SYNCED | ERROR
  @field('error_message') errorMessage!: string | null;
  @field('retry_count')   retryCount!: number;
  @field('created_at')    createdAt!: number;
  @field('synced_at')     syncedAt!: number | null;
}
