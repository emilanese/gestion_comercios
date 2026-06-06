// @ts-nocheck — WatermelonDB Model, not type-checked in web context
import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export class MedioPago extends Model {
  static table = 'medios_pago';

  @field('comercio_id') comercioId!: string;
  @field('nombre') nombre!: string;
  @field('activo') activo!: boolean;
  @field('ultima_actualizacion') ultimaActualizacion!: number;
}
