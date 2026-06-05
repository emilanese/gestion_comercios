/**
 * reconnect.ts — Protocolo de Reconexión del POS
 *
 * Gestiona el flujo completo de reconexión del POS al recuperar la red:
 *
 * PASO 1 (prioridad): Vaciar outbox de tickets PENDIENTES
 *   → Los tickets con precio cobrado en el mostrador se envían al Backoffice
 *   → El Backoffice los confirma con UPSERT (idempotente por UUID)
 *
 * PASO 2: Handshake de versión
 *   → POS informa su última versión local conocida
 *   → Backoffice calcula el delta y envía DELTA_SYNC
 *
 * PASO 3: Aplicar delta
 *   → POS actualiza su catálogo local (productos_pos) con batch UPSERT
 *   → POS actualiza version_sucursal local al to_version del delta
 *
 * Regla de oro: si el Backoffice no está online, los mensajes se destruyen.
 * El POS reintenta en la próxima reconexión (durabilidad garantizada por WatermelonDB).
 */

import { TicketOutbox, type LocalTicket, type TicketEstado } from './outbox';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface PosHandshakePayload {
  type: 'POS_HANDSHAKE';
  sucursal_id: string;
  device_id: string;
  last_confirmed_version: number;
  timestamp: number;
}

export interface DeltaEntry {
  entity: 'producto' | 'precio' | 'stock' | 'promocion';
  op: 'create' | 'update' | 'delete';
  /** ID del registro modificado */
  id: string;
  data: Record<string, unknown>;
}

export interface DeltaSyncMessage {
  type: 'DELTA_SYNC';
  target_device_id: string;
  from_version: number;
  to_version: number;
  deltas: DeltaEntry[];
}

export interface TicketConfirmadoMessage {
  type: 'TICKET_CONFIRMADO';
  ticket_uuid: string;
  comercio_id: string;
  sucursal_id: string;
}

// ─── POSReconnectManager ──────────────────────────────────────────────────────

/**
 * POSReconnectManager maneja el protocolo de reconexión del POS.
 *
 * Uso típico (dentro del onopen del WebSocketManager):
 * ```typescript
 * const reconnect = new POSReconnectManager(deviceID, sucursalID, outbox);
 * wsManager.onConnectionChange(async (connected) => {
 *   if (connected) {
 *     await reconnect.onReconnected(wsManager, dbAccessors);
 *   }
 * });
 * ```
 */
export class POSReconnectManager {
  private deviceID: string;
  private sucursalID: string;
  private outbox: TicketOutbox;

  constructor(deviceID: string, sucursalID: string, outbox: TicketOutbox) {
    this.deviceID = deviceID;
    this.sucursalID = sucursalID;
    this.outbox = outbox;
  }

  /**
   * onReconnected — Punto de entrada al recuperar la conexión WS.
   * Ejecuta los pasos en el orden correcto garantizando consistencia.
   */
  async onReconnected(
    sendWs: (payload: unknown) => void,
    dbAccessors: POSDbAccessors
  ): Promise<void> {
    console.log('[Reconnect] 🔌 POS reconectado — iniciando protocolo de sincronización');

    // ── PASO 0: Reactivar tickets atascados (SYNC_IN_PROGRESS → PENDIENTE)
    // Por si la app se cerró durante una transmisión anterior
    await this.outbox.retryStuck(
      dbAccessors.getStuckTickets,
      dbAccessors.markTicketsPending
    );

    // ── PASO 1: Flush de tickets offline (PRIORIDAD)
    await this.outbox.flush(
      dbAccessors.getPendingTickets,
      dbAccessors.markTicketsInProgress,
      (payload) => sendWs(payload)
    );

    // ── PASO 2: Handshake de versión
    const lastVersion = await dbAccessors.getLocalVersion();
    const handshake: PosHandshakePayload = {
      type: 'POS_HANDSHAKE',
      sucursal_id: this.sucursalID,
      device_id: this.deviceID,
      last_confirmed_version: lastVersion,
      timestamp: Date.now(),
    };
    sendWs(handshake);
    console.log(`[Reconnect] 🤝 Handshake enviado — versión local: ${lastVersion}`);
  }

  /**
   * applyDelta — Aplica el paquete de deltas recibido del Backoffice.
   *
   * Ejecuta todas las escrituras en un único batch atómico de WatermelonDB.
   * Usa UPSERT por ID para garantizar idempotencia.
   *
   * @param deltaMsg  mensaje DELTA_SYNC recibido del servidor
   * @param runAction función que ejecuta un bloque de escrituras en WatermelonDB action queue
   * @param upsertEntities función que aplica las escrituras en batch
   * @param setLocalVersion función que actualiza version_sucursal local
   */
  async applyDelta(
    deltaMsg: DeltaSyncMessage,
    runAction: <T>(fn: () => Promise<T>) => Promise<T>,
    upsertEntities: (deltas: DeltaEntry[]) => Promise<void>,
    setLocalVersion: (version: number) => Promise<void>
  ): Promise<void> {
    if (deltaMsg.deltas.length === 0) {
      console.log('[Reconnect] ✅ Sin deltas — catálogo ya sincronizado');
      await setLocalVersion(deltaMsg.to_version);
      return;
    }

    await runAction(async () => {
      // Aplicar todos los deltas en batch atómico
      await upsertEntities(deltaMsg.deltas);
      // Actualizar versión local al nuevo estado
      await setLocalVersion(deltaMsg.to_version);
    });

    console.log(
      `[Reconnect] ✅ Delta aplicado: v${deltaMsg.from_version}→v${deltaMsg.to_version}` +
      ` (${deltaMsg.deltas.length} cambios)`
    );
  }

  /**
   * handleTicketConfirmado — Procesa la confirmación de un ticket por el Backoffice.
   * Llamar desde el handler de TICKET_CONFIRMADO en WebSocketManager.
   */
  async handleTicketConfirmado(
    msg: TicketConfirmadoMessage,
    updateTicketEstado: (uuid: string, estado: TicketEstado) => Promise<void>
  ): Promise<void> {
    await this.outbox.confirm(msg.ticket_uuid, updateTicketEstado);
  }
}

// ─── Tipos de acceso a DB ─────────────────────────────────────────────────────

/**
 * Conjunto de funciones de acceso a WatermelonDB que el POSReconnectManager necesita.
 * Definidas como callbacks para mantener este módulo agnóstico al ORM.
 */
export interface POSDbAccessors {
  /** Lee la versión local confirmada de la sucursal */
  getLocalVersion: () => Promise<number>;
  /** Obtiene tickets con estado PENDIENTE */
  getPendingTickets: () => Promise<LocalTicket[]>;
  /** Obtiene tickets con estado SYNC_IN_PROGRESS (atascados) */
  getStuckTickets: () => Promise<LocalTicket[]>;
  /** Marca tickets como SYNC_IN_PROGRESS */
  markTicketsInProgress: (uuids: string[]) => Promise<void>;
  /** Marca tickets como PENDIENTE */
  markTicketsPending: (uuids: string[]) => Promise<void>;
}
