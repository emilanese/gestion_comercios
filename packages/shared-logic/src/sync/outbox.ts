/**
 * outbox.ts — Patrón Outbox para tickets del POS offline
 *
 * El POS es el DUEÑO de la persistencia de sus tickets.
 * Cuando está offline, guarda los tickets en WatermelonDB con estado 'PENDIENTE'.
 * Al reconectar, los despacha al Backoffice que los confirma vía TICKET_CONFIRMADO.
 *
 * Reglas de oro:
 * - Idempotencia: el UUID del ticket es inmutable → el Backoffice usa UPSERT
 * - Prioridad: los tickets PENDIENTES se envían ANTES del POS_HANDSHAKE de versión
 * - Sin memoria en la nube: si el Backoffice no está online, el ticket espera local
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type TicketEstado = 'PENDIENTE' | 'SYNC_IN_PROGRESS' | 'CONFIRMADO' | 'ANULADO';

export interface LocalTicket {
  /** UUID v4 inmutable — clave de idempotencia en el Backoffice */
  uuid: string;
  turnoID: string;
  sucursalID: string;
  comercioID: string;
  estado: TicketEstado;
  total: number;
  totalDescuento: number;
  medioPago: string;
  items: LocalTicketItem[];
  createdAt: number; // ms epoch
}

export interface LocalTicketItem {
  productoID?: string;
  nombreProducto: string;
  ean?: string;
  cantidad: number;
  precioUnitario: number;  // precio cobrado en el mostrador (inmutable)
  precioFinal: number;
  descuento: number;
  promocionID?: string;
}

export interface TicketsPendientePayload {
  type: 'TICKETS_PENDING';
  sucursal_id: string;
  device_id: string;
  tickets: LocalTicket[];
}

// ─── TicketOutbox ─────────────────────────────────────────────────────────────

/**
 * TicketOutbox gestiona el ciclo de vida de tickets offline.
 *
 * Diseñado para ser agnóstico al storage: recibe funciones de acceso a DB
 * en lugar de depender directamente de WatermelonDB (facilita testing).
 */
export class TicketOutbox {
  private deviceID: string;
  private sucursalID: string;

  constructor(deviceID: string, sucursalID: string) {
    this.deviceID = deviceID;
    this.sucursalID = sucursalID;
  }

  /**
   * Guarda un ticket en estado PENDIENTE cuando el POS está offline.
   * Si el WS está conectado puede enviarse directamente, pero siempre
   * se guarda local primero (durabilidad garantizada).
   */
  async saveOffline(
    ticket: LocalTicket,
    saveToDb: (ticket: LocalTicket) => Promise<void>
  ): Promise<void> {
    const pending: LocalTicket = { ...ticket, estado: 'PENDIENTE' };
    await saveToDb(pending);
  }

  /**
   * flush() — Envía todos los tickets PENDIENTES al Backoffice.
   * Llamar ANTES del POS_HANDSHAKE de versión al reconectar.
   *
   * @param getPendingTickets  función que consulta WatermelonDB por estado='PENDIENTE'
   * @param markInProgress     función que actualiza estado a 'SYNC_IN_PROGRESS' (batch)
   * @param sendWs             función que envía el payload por WebSocket
   */
  async flush(
    getPendingTickets: () => Promise<LocalTicket[]>,
    markInProgress: (uuids: string[]) => Promise<void>,
    sendWs: (payload: TicketsPendientePayload) => void
  ): Promise<void> {
    const pending = await getPendingTickets();
    if (pending.length === 0) return;

    // Marcar como en progreso para evitar doble envío si hay reconexión en plena transmisión
    await markInProgress(pending.map(t => t.uuid));

    const payload: TicketsPendientePayload = {
      type: 'TICKETS_PENDING',
      sucursal_id: this.sucursalID,
      device_id: this.deviceID,
      tickets: pending,
    };

    sendWs(payload);
    console.log(`[Outbox] 📤 Enviados ${pending.length} ticket(s) pendiente(s)`);
  }

  /**
   * confirm() — Marca un ticket como CONFIRMADO al recibir TICKET_CONFIRMADO del Backoffice.
   * Basado en UUID → 100% idempotente.
   */
  async confirm(
    ticketUUID: string,
    updateTicketEstado: (uuid: string, estado: TicketEstado) => Promise<void>
  ): Promise<void> {
    await updateTicketEstado(ticketUUID, 'CONFIRMADO');
    console.log(`[Outbox] ✅ Ticket ${ticketUUID} confirmado`);
  }

  /**
   * retryStuck() — Reactiva tickets que quedaron en SYNC_IN_PROGRESS
   * (por ejemplo si la app se cerró durante una transmisión).
   * Los vuelve a PENDIENTE para el próximo flush.
   */
  async retryStuck(
    getStuckTickets: () => Promise<LocalTicket[]>,
    markPending: (uuids: string[]) => Promise<void>
  ): Promise<void> {
    const stuck = await getStuckTickets();
    if (stuck.length === 0) return;
    await markPending(stuck.map(t => t.uuid));
    console.log(`[Outbox] 🔄 ${stuck.length} ticket(s) reactivados de SYNC_IN_PROGRESS a PENDIENTE`);
  }
}
