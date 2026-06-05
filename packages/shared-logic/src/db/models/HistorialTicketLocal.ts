import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export class HistorialTicketLocal extends Model {
  static table = 'historial_tickets_local';

  @field('sucursal_id') sucursalId!: string;
  @field('turno_id') turnoId!: string;
  @field('dispositivo_emisor_id') dispositivoEmisorId!: string;
  @field('vendedor_nombre') vendedorNombre!: string;
  @field('nombre_cliente') nombreCliente!: string;
  @field('total_ticket') totalTicket!: number;
  @field('estado_sincronizacion') estadoSincronizacion!: 'PENDIENTE' | 'CONFIRMADO';
  @field('created_at') createdAt!: number;

  get isPendiente(): boolean {
    return this.estadoSincronizacion === 'PENDIENTE';
  }
}
