/**
 * WebSocketManager: Gestión de comunicación WebSocket cliente-servidor
 *
 * Versión 2.0 — Agrega soporte para:
 * - OCC (Optimistic Concurrency Control) con retry automático transparente
 * - Protocolo de reconexión POS (HANDSHAKE + TICKETS_PENDING + DELTA_SYNC)
 * - Retry queue: los conflictos de versión se resuelven en milisegundos sin mostrar errores al usuario
 */

import { waitForVersion, type SyncMutation, type PendingMutation } from './versioning';

// ─── Tipos de mensajes (sincronizados con backend-go/handlers/websocket.go) ───

export const WS_MSG = {
  // Servidor → Cliente
  STOCK_UPDATE:        'STOCK_UPDATE',
  PRECIO_UPDATE:       'PRECIO_UPDATE',
  PROMO_ACTIVADA:      'PROMO_ACTIVADA',
  PROMO_DESACTIVADA:   'PROMO_DESACTIVADA',
  TICKET_CONFIRMADO:   'TICKET_CONFIRMADO',
  TURNO_ABIERTO:       'TURNO_ABIERTO',
  TURNO_CERRADO:       'TURNO_CERRADO',
  PONG_SYNC:           'PONG_SYNC',
  CONNECTED:           'CONNECTED',
  // OCC
  VERSION_CONFLICT:    'VERSION_CONFLICT',
  // Resiliencia POS
  DELTA_SYNC:          'DELTA_SYNC',
  TICKETS_PENDING_RETRY: 'TICKETS_PENDING_RETRY',
  // Cliente → Servidor (Backoffice)
  SYNC_MUTATION:       'SYNC_MUTATION',
  // Cliente → Servidor (POS)
  PING_SYNC:           'PING_SYNC',
  TICKET_PENDIENTE:    'TICKET_PENDIENTE',
  POS_HANDSHAKE:       'POS_HANDSHAKE',
  TICKETS_PENDING:     'TICKETS_PENDING',
} as const;

export type WsMsgType = (typeof WS_MSG)[keyof typeof WS_MSG];

// ─── Interfaces de payload ────────────────────────────────────────────────────

export interface StockUpdatePayload  { productoID: string; stockNuevo: number; sucursalID: string }
export interface PrecioUpdatePayload { productoID: string; precioNuevo: number; sucursalID: string }
export interface PromoPayload        { promocionID: string; nombre: string; productoID: string; descuento: number }
export interface TicketConfirmadoPayload { ticketID: string; turnoID: string; total: number; ticketUUID?: string }
export interface TurnoPayload        { turnoID: string; sucursalID: string; operadorNombre: string; timestamp: number }
export interface ConnectedPayload    { sucursal: string; devices: number; timestamp: number }

/** VERSION_CONFLICT recibido del servidor Go */
export interface VersionConflictPayload {
  type: 'VERSION_CONFLICT';
  mutation_id: string;
  current_version: number;
}

export type MessageHandler = (data: unknown) => void;
export type ConnectionListener = (connected: boolean) => void;

export interface WebSocketMessage {
  type: string;
  channel?: string;
  data?: unknown;
  timestamp?: number;
}

// ─── WebSocketManager ─────────────────────────────────────────────────────────

export class WebSocketManager {
  private ws: WebSocket | null = null;
  private serverUrl: string = '';
  private jwt: string = '';
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectDelay: number = 1000;
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private connectionListeners: Set<ConnectionListener> = new Set();
  private isConnected: boolean = false;
  private messageQueue: WebSocketMessage[] = [];
  private shouldReconnect: boolean = true;

  /**
   * Retry queue para OCC.
   * Clave: mutation_id
   * Valor: PendingMutation con applyFn para reintento automático
   */
  private pendingMutations: Map<string, PendingMutation> = new Map();

  /**
   * Función opcional para obtener la versión local actual.
   * Si se inyecta, se usa en handleVersionConflict para waitForVersion.
   */
  private getLocalVersionFn: (() => Promise<number>) | null = null;

  constructor(serverUrl: string, jwt: string) {
    this.serverUrl = serverUrl;
    this.jwt = jwt;
  }

  /**
   * Inyecta la función para leer la versión local (necesaria para OCC retry).
   */
  setLocalVersionGetter(fn: () => Promise<number>): void {
    this.getLocalVersionFn = fn;
  }

  // ─── Conexión ───────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const url = new URL(this.serverUrl);
        url.searchParams.set('token', this.jwt);

        this.ws = new WebSocket(url.toString());

        this.ws.onopen = () => {
          console.log('[WebSocket] ✅ Conectado');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.flushMessageQueue();
          this.notifyConnectionListeners(true);
          resolve();
        };

        this.ws.onmessage = (event: MessageEvent) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data as string);
            this.handleMessage(message);
          } catch (error) {
            console.error('[WebSocket] Error parsing message:', error);
          }
        };

        this.ws.onerror = (error: Event) => {
          console.error('[WebSocket] Error:', error);
          reject(error);
        };

        this.ws.onclose = () => {
          console.log('[WebSocket] Desconectado');
          this.isConnected = false;
          this.notifyConnectionListeners(false);
          if (this.shouldReconnect) {
            this.attemptReconnect();
          }
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // ─── Envío de mensajes ──────────────────────────────────────────────────────

  send(message: WebSocketMessage): void {
    if (this.isConnected && this.ws) {
      try {
        this.ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('[WebSocket] Error sending message:', error);
        this.messageQueue.push(message);
      }
    } else {
      this.messageQueue.push(message);
    }
  }

  /**
   * sendMutation — Envía una mutación versionada del Backoffice.
   *
   * Guarda la mutación en el retry queue ANTES de enviarla.
   * Si Go devuelve VERSION_CONFLICT, handleVersionConflict() la reintentará
   * de forma transparente sin mostrar ningún error al usuario.
   *
   * @param mutation  payload con base_version y new_version
   * @param applyFn   función que reaplica el cambio sobre una base nueva
   */
  sendMutation(mutation: SyncMutation, applyFn: (newBase: number) => Promise<SyncMutation>): void {
    // Guardar en retry queue antes de enviar
    this.pendingMutations.set(mutation.mutation_id, {
      mutation,
      retryCount: 0,
      applyFn,
    });

    this.send({
      type: WS_MSG.SYNC_MUTATION,
      ...mutation,
    } as unknown as WebSocketMessage);
  }

  // ─── Suscripciones ──────────────────────────────────────────────────────────

  subscribe(channel: string, handler: MessageHandler): void {
    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, new Set());
    }
    this.handlers.get(channel)!.add(handler);
  }

  unsubscribe(channel: string, handler: MessageHandler): void {
    const handlers = this.handlers.get(channel);
    if (handlers) handlers.delete(handler);
  }

  onConnectionChange(listener: ConnectionListener): void {
    this.connectionListeners.add(listener);
  }

  isConnectedNow(): boolean {
    return this.isConnected;
  }

  // ─── Manejo de mensajes entrantes ───────────────────────────────────────────

  private handleMessage(message: WebSocketMessage): void {
    const { type, channel, data } = message;

    // ── OCC: Conflicto de versión → reintento automático en background ──────
    if (type === WS_MSG.VERSION_CONFLICT) {
      const conflict = message as unknown as VersionConflictPayload;
      // Fire-and-forget: no await para no bloquear el pump de mensajes
      void this.handleVersionConflict(conflict);
      return;
    }

    // Distribuir a suscriptores de canal
    if (channel && this.handlers.has(channel)) {
      this.handlers.get(channel)!.forEach((handler) => {
        try { handler(data); }
        catch (error) { console.error(`[WebSocket] Error en handler de ${channel}:`, error); }
      });
    }

    // Distribuir a suscriptores de tipo de mensaje
    if (this.handlers.has(type)) {
      this.handlers.get(type)!.forEach((handler) => {
        try { handler(message); }
        catch (error) { console.error(`[WebSocket] Error en handler de ${type}:`, error); }
      });
    }
  }

  /**
   * handleVersionConflict — Reintenta la mutación rechazada de forma transparente.
   *
   * Flujo:
   * 1. Busca la mutación por mutation_id en el retry queue
   * 2. Espera a que la versión local alcance current_version (el broadcast del otro
   *    dispositivo ya debería haber llegado o llegará en milisegundos)
   * 3. Llama applyFn(current_version) para generar un nuevo payload con versiones actualizadas
   * 4. Llama sendMutation() con el nuevo payload → registra nuevo retry
   * 5. Límite de 3 reintentos para evitar loops infinitos
   */
  private async handleVersionConflict(conflict: VersionConflictPayload): Promise<void> {
    const pending = this.pendingMutations.get(conflict.mutation_id);
    if (!pending) {
      console.warn(`[OCC] VERSION_CONFLICT para mutation_id desconocido: ${conflict.mutation_id}`);
      return;
    }

    console.log(
      `[OCC] ⚡ Conflicto v${pending.mutation.base_version} → esperada=${pending.mutation.new_version} actual=${conflict.current_version}` +
      ` (intento ${pending.retryCount + 1}/3)`
    );

    // Limpiar la entrada anterior del retry queue
    this.pendingMutations.delete(conflict.mutation_id);

    if (pending.retryCount >= 3) {
      console.error(`[OCC] ❌ Máximo de reintentos alcanzado para mutation_id=${conflict.mutation_id} — descartando`);
      return;
    }

    try {
      // Esperar a que el broadcast del otro dispositivo se aplique localmente
      // (puede ya estar aplicado si el broadcast llegó primero)
      if (this.getLocalVersionFn) {
        await waitForVersion(this.getLocalVersionFn, conflict.current_version);
      }

      // Re-aplicar el cambio del usuario sobre la nueva base
      const newMutation = await pending.applyFn(conflict.current_version);

      // Registrar en retry queue con contador incrementado
      this.pendingMutations.set(newMutation.mutation_id, {
        mutation: newMutation,
        retryCount: pending.retryCount + 1,
        applyFn: pending.applyFn,
      });

      // Reenviar
      this.send({
        type: WS_MSG.SYNC_MUTATION,
        ...newMutation,
      } as unknown as WebSocketMessage);

      console.log(
        `[OCC] 🔄 Reintento enviado: mutation_id=${newMutation.mutation_id}` +
        ` v${newMutation.base_version}→v${newMutation.new_version}`
      );
    } catch (err) {
      console.error(`[OCC] Error durante reintento de mutation_id=${conflict.mutation_id}:`, err);
    }
  }

  /**
   * Limpia una mutación del retry queue cuando fue confirmada (si el servidor
   * la acepta, nunca devuelve acuse — la limpieza ocurre por TTL implícito).
   * Se puede llamar manualmente si se quiere liberar memoria.
   */
  clearPendingMutation(mutationId: string): void {
    this.pendingMutations.delete(mutationId);
  }

  // ─── Reconexión ─────────────────────────────────────────────────────────────

  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);
      console.log(`[WebSocket] Reintentando en ${delay}ms (intento ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      setTimeout(() => {
        this.shouldReconnect = true;
        this.connect().catch((err) => {
          console.error('[WebSocket] Error en reconexión:', err);
        });
      }, delay);
    } else {
      console.error('[WebSocket] Máximo de reintentos alcanzado — conectividad perdida');
    }
  }

  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message) this.send(message);
    }
  }

  private notifyConnectionListeners(connected: boolean): void {
    this.connectionListeners.forEach((listener) => {
      try { listener(connected); }
      catch (error) { console.error('[WebSocket] Error en connection listener:', error); }
    });
  }
}
