// @ts-nocheck — WatermelonDB Model, not type-checked in web context
import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export class AuditoriaStockLocal extends Model {
  static table = 'auditoria_stock_local';

  @field('producto_id') productoId!: string;
  @field('sucursal_id') sucursalId!: string;
  @field('dispositivo_operador_id') dispositivoOperadorId!: string;
  @field('rol_operador') rolOperador!: 'ADMIN' | 'OPERADOR_STOCK';
  @field('concepto') concepto!: 'VENTA_POS' | 'INVENTARIO' | 'INGRESO' | 'EGRESO';
  @field('cantidad_anterior') cantidadAnterior!: number;
  @field('variacion_delta') variacionDelta!: number;
  @field('cantidad_resultante') cantidadResultante!: number;
  @field('motivo_descripcion') motivoDescripcion!: string | null;
  @field('estado_sincronizacion') estadoSincronizacion!: 'PENDIENTE' | 'CONFIRMADO';
  @field('created_at') createdAt!: number;
}
