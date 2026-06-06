// @ts-nocheck — WatermelonDB Model, not type-checked in web context
import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export class TicketPagoLocal extends Model {
  static table = 'ticket_pagos_local';

  @field('ticket_id') ticketId!: string;
  @field('medio_pago_id') medioPagoId!: string;
  @field('monto_pagado') montoPagado!: number;
  @field('monto_recibido') montoRecibido!: number;
  @field('vuelto') vuelto!: number;
}
