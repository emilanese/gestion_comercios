// @ts-nocheck — WatermelonDB Model, not type-checked in web context
import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export class PromocionLocal extends Model {
  static table = 'promociones_local';

  @field('producto_id') productoId!: string;
  @field('sucursal_id') sucursalId!: string;
  @field('precio_oferta') precioOferta!: number;
  @field('fecha_inicio') fechaInicio!: number;
  @field('fecha_fin') fechaFin!: number;
  @field('limite_cantidad') limiteCantidad!: number;
  @field('cantidad_restante') cantidadRestante!: number;
  @field('estado') estado!: 'PROGRAMADA' | 'ACTIVA' | 'AGOTADA' | 'FINALIZADA';
  @field('ultima_actualizacion') ultimaActualizacion!: number;

  get isActiva(): boolean {
    const now = Date.now();
    return (
      this.estado === 'ACTIVA' &&
      this.fechaInicio <= now &&
      this.fechaFin >= now &&
      (this.limiteCantidad === 0 || this.cantidadRestante > 0)
    );
  }
}
