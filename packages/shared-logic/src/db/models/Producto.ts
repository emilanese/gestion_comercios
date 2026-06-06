// @ts-nocheck — WatermelonDB Model, not type-checked in web context
import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export class Producto extends Model {
  static table = 'productos';

  @field('codigo_barras') codigoBarras!: string | null;
  @field('nombre') nombre!: string;
  @field('marca') marca!: string | null;
  @field('categoria') categoria!: string | null;
  @field('descripcion') descripcion!: string | null;
  @field('ultima_actualizacion') ultimaActualizacion!: number;
}
