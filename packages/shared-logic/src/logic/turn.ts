/**
 * turn.ts — Gestión del turno de caja
 *
 * El turno se persiste como JSON en AsyncStorage/localStorage (un solo key).
 * Esto es más simple que una tabla WatermelonDB porque solo existe UN turno
 * activo por terminal en cualquier momento, y no necesitamos queries.
 *
 * El StorageAdapter se inyecta via `initTurnStorage()` al arrancar la app,
 * usando el mismo adaptador que authentication.ts.
 */

import { getApiBaseUrl } from '../config';
import { StorageAdapter, SessionConfig } from './authentication';

// ─── Storage ──────────────────────────────────────────────────────────────────

const ACTIVE_TURN_KEY = 'active_turn';

let _turnStorage: StorageAdapter | null = null;

/** Inicializar storage de turno (llamar junto con initStorage de authentication) */
export function initTurnStorage(adapter: StorageAdapter): void {
  _turnStorage = adapter;
}

function getTurnStorage(): StorageAdapter {
  if (_turnStorage) return _turnStorage;
  if (typeof localStorage !== 'undefined') return localStorage as StorageAdapter;
  throw new Error('[Turn] Storage no inicializado. Llamar a initTurnStorage() al arrancar la app.');
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface TurnConfig {
  turnoID: string;
  deviceID: string;
  comercioID: string;
  sucursalID: string;
  numeroTerminal: number;
  operadorNombre: string;
  montoInicial: number;
  openedAt: number;
  closedAt?: number;
  estadoTurno: 'ABIERTO' | 'CERRADO' | 'SUSPENDIDO';
  saldoEsperado: number;
  saldoRealEfectivo?: number;
  cierreBloqueado: boolean;
  ticketCount: number;
}

export interface TurnOpenRequest {
  deviceID: string;
  sessionToken: string;
  montoInicial: number;
  operadorNombre: string;
}

export interface TurnOpenResponse {
  success: boolean;
  turnoID?: string;
  turnConfig?: TurnConfig;
  message?: string;
  error?: string;
}

export interface TurnCloseRequest {
  turnoID: string;
  saldoRealEfectivo: number;
}

export interface TurnCloseResponse {
  success: boolean;
  message?: string;
  error?: string;
  diferencia?: number;
}

// ─── Generación de ID ─────────────────────────────────────────────────────────

/**
 * Genera el ID de turno con formato YYYYMMDD_T{terminal:02d}_{secuencia:04d}
 */
export function generateTurnoID(numeroTerminal: number, secuenciaDelDia: number): string {
  const hoy = new Date();
  const yyyy = hoy.getFullYear();
  const mm = String(hoy.getMonth() + 1).padStart(2, '0');
  const dd = String(hoy.getDate()).padStart(2, '0');
  const terminal = String(numeroTerminal).padStart(2, '0');
  const secuencia = String(secuenciaDelDia).padStart(4, '0');
  return `${yyyy}${mm}${dd}_T${terminal}_${secuencia}`;
}

// ─── Operaciones CRUD sobre el turno activo ───────────────────────────────────

/** Persistir el turno activo en storage */
async function saveTurn(turn: TurnConfig): Promise<void> {
  await getTurnStorage().setItem(ACTIVE_TURN_KEY, JSON.stringify(turn));
}

/**
 * Cargar el turno activo desde storage.
 * Retorna null si no hay turno o si el turno está CERRADO.
 */
export async function loadActiveTurn(): Promise<TurnConfig | null> {
  try {
    const raw = await getTurnStorage().getItem(ACTIVE_TURN_KEY);
    if (!raw) return null;

    const turn = JSON.parse(raw) as TurnConfig;
    return turn.estadoTurno === 'ABIERTO' ? turn : null;
  } catch (error) {
    console.error('[Turn] Error cargando turno activo:', error);
    return null;
  }
}

/** Verificar que no hay turno abierto (previene doble apertura) */
export async function validateNoActiveTurn(): Promise<boolean> {
  const activeTurn = await loadActiveTurn();
  return activeTurn === null;
}

/** Obtener el turno activo (alias de loadActiveTurn) */
export async function getActiveTurn(): Promise<TurnConfig | null> {
  return loadActiveTurn();
}

// ─── Apertura de turno ────────────────────────────────────────────────────────

/**
 * Abre un nuevo turno de caja.
 * Persiste en AsyncStorage y notifica al backend (best-effort).
 */
export async function openTurn(
  montoInicial: number,
  session: SessionConfig
): Promise<TurnOpenResponse> {
  try {
    // Validaciones
    if (!(await validateNoActiveTurn())) {
      return { success: false, error: 'Ya hay un turno abierto. Ciérralo antes de abrir uno nuevo.' };
    }
    if (montoInicial < 0) {
      return { success: false, error: 'El monto inicial no puede ser negativo.' };
    }

    // Generar ID de turno (intenta desde el backend, si no usa local)
    let turnoID = generateTurnoID(session.numeroTerminal, 1);
    try {
      const resp = await fetch(`${getApiBaseUrl()}/turns/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceID: session.deviceId,
          sessionToken: session.sessionToken,
          montoInicial,
          operadorNombre: session.operadorActual,
        } satisfies TurnOpenRequest),
      });
      if (resp.ok) {
        const data = await resp.json();
        turnoID = data.turno_id || turnoID;
      }
    } catch {
      console.warn('[Turn] Backend no disponible, usando ID generado localmente:', turnoID);
    }

    const turnConfig: TurnConfig = {
      turnoID,
      deviceID: session.deviceId,
      comercioID: session.commercioId,
      sucursalID: session.sucursalId,
      numeroTerminal: session.numeroTerminal,
      operadorNombre: session.operadorActual,
      montoInicial,
      openedAt: Date.now(),
      estadoTurno: 'ABIERTO',
      saldoEsperado: montoInicial,
      cierreBloqueado: false,
      ticketCount: 0,
    };

    await saveTurn(turnConfig);
    console.log(`[Turn] ✅ Turno abierto: ${turnoID} — Operador: ${session.operadorActual} — Monto inicial: $${montoInicial}`);

    return { success: true, turnoID, turnConfig, message: 'Turno abierto exitosamente' };
  } catch (error) {
    console.error('[Turn] Error abriendo turno:', error);
    return { success: false, error: `Error abriendo turno: ${String(error)}` };
  }
}

// ─── Validación para ventas ───────────────────────────────────────────────────

/**
 * Verifica que el turno esté abierto y no bloqueado (pre-condición para emitir tickets)
 */
export async function validateTurnIsOpen(): Promise<{ valid: boolean; error?: string }> {
  const turn = await loadActiveTurn();
  if (!turn) return { valid: false, error: 'No hay turno abierto. Abre un turno para comenzar a vender.' };
  if (turn.estadoTurno !== 'ABIERTO') return { valid: false, error: `Turno no está abierto (estado: ${turn.estadoTurno})` };
  if (turn.cierreBloqueado) return { valid: false, error: 'Cierre bloqueado: hay tickets pendientes de sincronización.' };
  return { valid: true };
}

// ─── Actualización de estado de turno ────────────────────────────────────────

/** Incrementar el contador de tickets del turno activo */
export async function incrementTurnTicketCount(): Promise<void> {
  const turn = await loadActiveTurn();
  if (!turn) return;
  turn.ticketCount += 1;
  await saveTurn(turn);
}

/** Actualizar el saldo esperado (se llama al confirmar cada ticket) */
export async function updateTurnExpectedBalance(nuevoSaldo: number): Promise<void> {
  const turn = await loadActiveTurn();
  if (!turn) return;
  turn.saldoEsperado = nuevoSaldo;
  await saveTurn(turn);
}

/** Bloquear cierre si hay tickets PENDIENTE sin sincronizar */
export async function lockTurnClosure(): Promise<void> {
  const turn = await loadActiveTurn();
  if (!turn) return;
  turn.cierreBloqueado = true;
  await saveTurn(turn);
  console.warn('[Turn] ⚠️ Cierre bloqueado — hay tickets pendientes de sincronización');
}

/** Desbloquear cierre cuando todos los tickets estén CONFIRMADO */
export async function unlockTurnClosure(): Promise<void> {
  const turn = await loadActiveTurn();
  if (!turn) return;
  turn.cierreBloqueado = false;
  await saveTurn(turn);
  console.log('[Turn] Cierre desbloqueado — todos los tickets sincronizados');
}

// ─── Cierre de turno ──────────────────────────────────────────────────────────

/**
 * Cierra el turno activo.
 * Bloquea el cierre si quedan tickets PENDIENTE (los cajeros no pueden borrar datos).
 */
export async function closeTurn(
  saldoRealEfectivo: number
): Promise<TurnCloseResponse> {
  try {
    const turn = await loadActiveTurn();
    if (!turn) {
      return { success: false, error: 'No hay turno abierto para cerrar.' };
    }

    if (turn.cierreBloqueado) {
      return {
        success: false,
        error: 'No se puede cerrar el turno: hay tickets pendientes de sincronización. Espera que se conecte al servidor.',
      };
    }

    const diferencia = saldoRealEfectivo - turn.saldoEsperado;
    const closedTurn: TurnConfig = {
      ...turn,
      closedAt: Date.now(),
      estadoTurno: 'CERRADO',
      saldoRealEfectivo,
    };

    // Guardar el turno cerrado (para historial de esta sesión)
    await getTurnStorage().setItem(ACTIVE_TURN_KEY, JSON.stringify(closedTurn));

    // También notificar al backend (best-effort)
    try {
      await fetch(`${getApiBaseUrl()}/turns/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnoID: turn.turnoID, saldoRealEfectivo }),
      });
    } catch {
      console.warn('[Turn] Backend no disponible al cerrar turno, se sincronizará después');
    }

    console.log(`[Turn] ✅ Turno cerrado: ${turn.turnoID} — Diferencia de caja: $${diferencia.toFixed(2)}`);

    return {
      success: true,
      message: `Turno cerrado. Diferencia de caja: $${diferencia.toFixed(2)}`,
      diferencia,
    };
  } catch (error) {
    console.error('[Turn] Error cerrando turno:', error);
    return { success: false, error: `Error cerrando turno: ${String(error)}` };
  }
}
