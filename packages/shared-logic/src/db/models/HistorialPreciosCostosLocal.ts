import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export class HistorialPreciosCostosLocal extends Model {
  static table = 'historial_precios_costos_local';

  @field('producto_id') productoId!: string;
  @field('sucursal_id') sucursalId!: string;
  @field('dispositivo_operador_id') dispositivoOperadorId!: string;
  @field('origen_cambio') origenCambio!: 'ABM_PRODUCTO' | 'INGRESO_COMPRA';
  @field('costo_anterior') costoAnterior!: number;
  @field('costo_nuevo') costoNuevo!: number;
  @field('precio_venta_anterior') precioVentaAnterior!: number;
  @field('precio_venta_nuevo') precioVentaNuevo!: number;
  @field('created_at') createdAt!: number;
}
