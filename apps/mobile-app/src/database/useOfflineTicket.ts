/**
 * useOfflineTicket — Hook para confirmar tickets con soporte offline.
 *
 * Flujo:
 *  1. Intenta POST /tickets/confirm en el backend
 *  2. Si hay error de red → guarda el payload en la tabla outbox_entries (WatermelonDB)
 *  3. Un listener de NetInfo detecta cuando vuelve la conexión y ejecuta flushOutbox()
 *  4. flushOutbox() reintenta todos los PENDING (máx 5 intentos)
 *
 * Uso:
 *   const { confirmarTicket, pendingCount, flushing } = useOfflineTicket(jwt)
 */
import { useEffect, useState, useCallback } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { Q } from '@nozbe/watermelondb';
import { useDatabase } from './index';
import { OutboxEntry } from './models';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080';
const MAX_RETRIES = 5;

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface TicketPayload {
  turnoID:        string;
  total:          number;
  totalDescuento: number;
  items:          object[];
  pagos:          object[];
}

interface ConfirmResult {
  success:   boolean;
  ticketID?: string;
  offline?:  boolean;   // true si se guardó en outbox
  error?:    string;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useOfflineTicket(jwt: string) {
  const db           = useDatabase();
  const [pendingCount, setPendingCount] = useState(0);
  const [flushing, setFlushing]         = useState(false);

  // Contar pendientes al montar
  useEffect(() => {
    const outboxCollection = db.get<OutboxEntry>('outbox_entries');
    const subscription = outboxCollection
      .query(Q.where('status', 'PENDING'))
      .observe()
      .subscribe((rows) => setPendingCount(rows.length));
    return () => subscription.unsubscribe();
  }, [db]);

  // ── Flush outbox cuando hay conexión ────────────────────────────────────
  const flushOutbox = useCallback(async () => {
    if (flushing) return;
    setFlushing(true);
    try {
      const outboxCollection = db.get<OutboxEntry>('outbox_entries');
      const pending = await outboxCollection
        .query(Q.where('status', 'PENDING'), Q.where('retry_count', Q.lt(MAX_RETRIES)))
        .fetch();

      for (const entry of pending) {
        try {
          const payload = JSON.parse(entry.payload);
          const res = await fetch(`${API_URL}${entry.endpoint}`, {
            method:  'POST',
            headers: {
              'Content-Type':  'application/json',
              'Authorization': `Bearer ${jwt}`,
            },
            body: JSON.stringify(payload),
          });
          const data = await res.json();

          if (res.ok && data.success) {
            await db.write(async () => {
              await entry.update((e) => {
                e.status   = 'SYNCED';
                e.syncedAt = Date.now();
              });
            });
          } else {
            await db.write(async () => {
              await entry.update((e) => {
                e.retryCount    = (e.retryCount ?? 0) + 1;
                e.errorMessage  = data.error ?? 'Error desconocido';
                if (e.retryCount >= MAX_RETRIES) e.status = 'ERROR';
              });
            });
          }
        } catch {
          await db.write(async () => {
            await entry.update((e) => {
              e.retryCount = (e.retryCount ?? 0) + 1;
              if (e.retryCount >= MAX_RETRIES) e.status = 'ERROR';
            });
          });
        }
      }
    } finally {
      setFlushing(false);
    }
  }, [db, jwt, flushing]);

  // Escuchar cambios de red
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected) {
        flushOutbox();
      }
    });
    return () => unsubscribe();
  }, [flushOutbox]);

  // ── Confirmar ticket (online-first, fallback a outbox) ──────────────────
  const confirmarTicket = useCallback(async (
    payload: TicketPayload,
  ): Promise<ConfirmResult> => {
    // Verificar conectividad
    const netState = await NetInfo.fetch();

    if (netState.isConnected) {
      try {
        const res = await fetch(`${API_URL}/tickets/confirm`, {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${jwt}`,
          },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          return { success: true, ticketID: data.ticket_id };
        }
        // Error del servidor pero conectado → guardar en outbox igual
        // (puede ser error transitorio)
        if (res.status >= 500) {
          await saveToOutbox(db, payload);
          return { success: true, offline: true };
        }
        return { success: false, error: data.error ?? 'Error del servidor' };
      } catch {
        // Error de red → guardar en outbox
        await saveToOutbox(db, payload);
        return { success: true, offline: true };
      }
    } else {
      // Sin conexión → outbox directo
      await saveToOutbox(db, payload);
      return { success: true, offline: true };
    }
  }, [db, jwt]);

  return { confirmarTicket, pendingCount, flushing, flushOutbox };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function saveToOutbox(db: ReturnType<typeof useDatabase>, payload: object) {
  const outboxCollection = db.get<OutboxEntry>('outbox_entries');
  await db.write(async () => {
    await outboxCollection.create((entry) => {
      entry.entityType  = 'TICKET';
      entry.payload     = JSON.stringify(payload);
      entry.endpoint    = '/tickets/confirm';
      entry.status      = 'PENDING';
      entry.retryCount  = 0;
      entry.createdAt   = Date.now();
    });
  });
}
