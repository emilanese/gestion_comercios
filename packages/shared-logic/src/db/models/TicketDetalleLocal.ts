import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export class TicketDetalleLocal extends Model {
  static table = 'ticket_detalles_local';

  @field('ticket_id') ticketId!: string;
  @field('producto_id') productoId!: string;
  @field('nombre_producto_snapshot') nombreProductoSnapshot!: string;
  @field('cantidad') cantidad!: number;
  @field('precio_unitario') precioUnitario!: number;
  @field('precio_oferta_snapshot') precioOfertaSnapshot!: number;

  get subtotal(): number {
    return this.cantidad * this.precioUnitario;
  }
}
