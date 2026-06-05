import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export class PrecioSucursal extends Model {
  static table = 'precios_sucursal';

  @field('producto_id') productoId!: string;
  @field('sucursal_id') sucursalId!: string;
  @field('precio_venta') precioVenta!: number;
  @field('porcentaje_ganancia') porcentajeGanancia!: number;
  @field('ultima_actualizacion') ultimaActualizacion!: number;
}
