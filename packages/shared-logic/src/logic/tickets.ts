/**
 * Lógica de negocio para tickets del POS
 */

import { v4 as uuidv4 } from 'uuid';
import { timeDrift } from '../sync/timeDrift';

export interface TicketItem {
  producto_id: string;
  nombre_producto: string;
  cantidad: number;
  precio_unitario: number;
}

export interface Payment {
  medio_pago_id: string;
  monto_pagado: number;
  monto_recibido?: number;
  vuelto?: number;
}

export interface Ticket {
  id: string;
  sucursal_id: string;
  dispositivo_emisor_id: string;
  vendedor_nombre: string;
  nombre_cliente: string;
  items: TicketItem[];
  pagos: Payment[];
  total_ticket: number;
  estado_sincronizacion: 'PENDIENTE' | 'CONFIRMADO';
  created_at: number;
}

/**
 * Genera un ID de ticket en formato YYYYMMDD + numero_terminal + secuencia
 * @param fecha Timestamp en ms
 * @param numeroTerminal Número secuencial del POS (000001-999999)
 * @param secuencia Número secuencial del ticket del día (000001-999999)
 */
export function generarIDTicket(
  fecha: number,
  numeroTerminal: number,
  secuencia: number
): string {
  const date = new Date(fecha);
  const yyyymmdd = date
    .toISOString()
    .substring(0, 10)
    .replace(/-/g, '');

  const terminal = String(numeroTerminal).padStart(6, '0');
  const seq = String(secuencia).padStart(6, '0');

  return `tkt_${yyyymmdd}${terminal}${seq}`;
}

/**
 * Calcula el total de un ticket
 */
export function calcularTotalTicket(items: TicketItem[]): number {
  return items.reduce((sum, item) => sum + item.cantidad * item.precio_unitario, 0);
}

/**
 * Calcula el vuelto
 */
export function calcularVuelto(totalTicket: number, montoRecibido: number): number {
  return Math.max(0, montoRecibido - totalTicket);
}

/**
 * Valida un ticket antes de emitirlo
 */
export function validarTicket(ticket: Ticket): { valido: boolean; errores: string[] } {
  const errores: string[] = [];

  if (!ticket.sucursal_id) errores.push('Sucursal ID requerida');
  if (!ticket.dispositivo_emisor_id) errores.push('Dispositivo emisor requerido');
  if (!ticket.vendedor_nombre) errores.push('Vendedor requerido');
  if (!ticket.items || ticket.items.length === 0) errores.push('Al menos un producto requerido');
  if (!ticket.pagos || ticket.pagos.length === 0) errores.push('Al menos un medio de pago requerido');
  if (ticket.total_ticket <= 0) errores.push('Total de ticket debe ser mayor a 0');

  return {
    valido: errores.length === 0,
    errores
  };
}

/**
 * Crea un nuevo ticket con timestamp corregido
 */
export function crearTicket(
  sucursal_id: string,
  dispositivo_emisor_id: string,
  vendedor_nombre: string,
  nombre_cliente: string,
  items: TicketItem[],
  pagos: Payment[]
): Ticket {
  const total = calcularTotalTicket(items);

  return {
    id: uuidv4(),
    sucursal_id,
    dispositivo_emisor_id,
    vendedor_nombre,
    nombre_cliente: nombre_cliente || 'CONSUMIDOR FINAL',
    items,
    pagos,
    total_ticket: total,
    estado_sincronizacion: 'PENDIENTE',
    created_at: timeDrift.getTimestamp()
  };
}
