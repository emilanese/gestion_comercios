// @ts-nocheck — WatermelonDB Model, not type-checked in web context
import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

/**
 * ProductoPOS — tabla desnormalizada para búsqueda rápida en el POS.
 * Combina producto + precio + stock + promo activa en un solo registro.
 * Se puebla en el enrolamiento y se actualiza via WebSocket.
 */
export class ProductoPOS extends Model {
  static table = 'productos_pos';

  @field('producto_id') productoId!: string;
  @field('codigo_barras') codigoBarras!: string;
  @field('nombre') nombre!: string;
  @field('marca') marca!: string;
  @field('categoria') categoria!: string;
  @field('descripcion') descripcion!: string;
  @field('precio_venta') precioVenta!: number;
  @field('precio_oferta') precioOferta!: number;  // 0 si no hay promo
  @field('tiene_promo') tienePromo!: boolean;
  @field('stock') stock!: number;
  @field('stock_minimo') stockMinimo!: number;
  @field('ultima_actualizacion') ultimaActualizacion!: number;

  /** Precio efectivo: precio_oferta si tiene_promo, sino precio_venta */
  get precioEfectivo(): number {
    return this.tienePromo && this.precioOferta > 0 ? this.precioOferta : this.precioVenta;
  }

  /** True si el stock está por debajo del mínimo */
  get stockBajo(): boolean {
    return this.stock <= this.stockMinimo;
  }
}
