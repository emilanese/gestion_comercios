// @ts-nocheck — WatermelonDB Model, not type-checked in web context
import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export class StockSucursal extends Model {
  static table = 'stock_sucursal';

  @field('producto_id') productoId!: string;
  @field('sucursal_id') sucursalId!: string;
  @field('cantidad') cantidad!: number;
  @field('stock_minimo') stockMinimo!: number;
  @field('ultima_actualizacion') ultimaActualizacion!: number;
}
