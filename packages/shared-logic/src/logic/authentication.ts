/**
 * authentication.ts — Login local con PIN + gestión de sesión
 *
 * Diseñado para funcionar en React Native y Web sin dependencia de
 * APIs de plataforma. Usa inyección de dependencias para el storage
 * (AsyncStorage en RN, localStorage en web).
 *
 * Hashing: Web Crypto API (SubtleCrypto) — disponible en RN 0.71+, browsers y Node 19+
 */

// ─── Storage Adapter ──────────────────────────────────────────────────────────

/** Interfaz de storage compatible con AsyncStorage (RN) y localStorage (web) */
export interface StorageAdapter {
  setItem(key: string, value: string): Promise<void> | void;
  getItem(key: string): Promise<string | null> | string | null;
  removeItem(key: string): Promise<void> | void;
}

let _storage: StorageAdapter | null = null;

/** Inicializar el adaptador de storage (llamar al arrancar la app) */
export function initStorage(adapter: StorageAdapter): void {
  _storage = adapter;
}

/** Fallback a localStorage si no se inicializó un adaptador */
function getStorage(): StorageAdapter {
  if (_storage) return _storage;
  if (typeof localStorage !== 'undefined') return localStorage as StorageAdapter;
  throw new Error('[Auth] Storage no inicializado. Llamar a initStorage() al arrancar la app.');
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface SessionConfig {
  deviceId: string;
  commercioId: string;
  sucursalId: string;
  numeroTerminal: number;
  aliasNombre: string;
  operadorActual: string;
  rol: 'ADMIN' | 'OPERADOR_STOCK' | 'POS_CAJERO' | 'GERENTE';
  pinAccesoHash: string;
  sessionToken: string;
  loginTimestamp: number;
  lastActivityTimestamp: number;
  turnoActivo: boolean;
}

// ─── Hashing ─────────────────────────────────────────────────────────────────

/**
 * Hash SHA-256 usando Web Crypto API (cross-platform)
 * Compatible con React Native 0.71+, browsers modernos y Node 19+
 */
export async function hashSHA256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Validar PIN ingresado contra el hash almacenado
 */
export async function validatePINLocal(enteredPin: string, storedPinHash: string): Promise<boolean> {
  try {
    const enteredHash = await hashSHA256(enteredPin);
    return enteredHash === storedPinHash;
  } catch (error) {
    console.error('[Auth] Error validando PIN:', error);
    return false;
  }
}

// ─── Control de intentos fallidos ─────────────────────────────────────────────

const PIN_ATTEMPT_KEY = 'pin_attempts';
const MAX_PIN_ATTEMPTS = 3;
const PIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutos

interface PINAttemptsData {
  attempts: number;
  lockedUntil: number | null;
}

export async function checkPinAttempts(): Promise<{
  attemptsRemaining: number;
  isLocked: boolean;
  lockedUntil?: number;
}> {
  try {
    const storage = getStorage();
    const raw = await storage.getItem(PIN_ATTEMPT_KEY);
    const data: PINAttemptsData = raw ? JSON.parse(raw) : { attempts: 0, lockedUntil: null };

    if (data.lockedUntil && Date.now() < data.lockedUntil) {
      return { attemptsRemaining: 0, isLocked: true, lockedUntil: data.lockedUntil };
    }

    if (data.lockedUntil && Date.now() >= data.lockedUntil) {
      await storage.removeItem(PIN_ATTEMPT_KEY);
      return { attemptsRemaining: MAX_PIN_ATTEMPTS, isLocked: false };
    }

    return { attemptsRemaining: MAX_PIN_ATTEMPTS - data.attempts, isLocked: false };
  } catch {
    return { attemptsRemaining: MAX_PIN_ATTEMPTS, isLocked: false };
  }
}

export async function recordFailedPinAttempt(): Promise<void> {
  try {
    const storage = getStorage();
    const raw = await storage.getItem(PIN_ATTEMPT_KEY);
    const data: PINAttemptsData = raw ? JSON.parse(raw) : { attempts: 0, lockedUntil: null };

    data.attempts = (data.attempts || 0) + 1;
    if (data.attempts >= MAX_PIN_ATTEMPTS) {
      data.lockedUntil = Date.now() + PIN_LOCKOUT_MS;
    }

    await storage.setItem(PIN_ATTEMPT_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('[Auth] Error registrando intento fallido:', error);
  }
}

export async function resetPinAttempts(): Promise<void> {
  try {
    await getStorage().removeItem(PIN_ATTEMPT_KEY);
  } catch (error) {
    console.error('[Auth] Error reseteando intentos:', error);
  }
}

// ─── Login ────────────────────────────────────────────────────────────────────

/**
 * Iniciar sesión con PIN y nombre de cajero
 * Valida el PIN localmente contra el hash almacenado en TerminalConfig
 */
export async function loginWithPIN(
  enteredPin: string,
  operadorNombre: string,
  terminalConfig: {
    deviceId: string;
    commercioId: string;
    sucursalId: string;
    numeroTerminal: number;
    aliasNombre: string;
    pinAccesoHash: string;
    rol: 'ADMIN' | 'OPERADOR_STOCK' | 'POS_CAJERO' | 'GERENTE';
  }
): Promise<{ success: boolean; session?: SessionConfig; error?: string }> {
  try {
    // ── Validaciones de entrada ─────────────────────────────────────────
    if (!enteredPin || enteredPin.trim().length === 0) {
      return { success: false, error: 'El PIN no puede estar vacío.' };
    }
    if (!operadorNombre || operadorNombre.trim().length === 0) {
      return { success: false, error: 'El nombre del operador es obligatorio.' };
    }

    // ── Verificar bloqueo ────────────────────────────────────────────────
    const attemptsState = await checkPinAttempts();
    if (attemptsState.isLocked) {
      const minutosRestantes = Math.ceil(
        ((attemptsState.lockedUntil ?? Date.now()) - Date.now()) / 1000 / 60
      );
      return {
        success: false,
        error: `Dispositivo bloqueado. Intenta de nuevo en ${minutosRestantes} minutos.`,
      };
    }

    // ── Validar PIN ──────────────────────────────────────────────────────
    const pinValid = await validatePINLocal(enteredPin.trim(), terminalConfig.pinAccesoHash);
    if (!pinValid) {
      await recordFailedPinAttempt();
      const after = await checkPinAttempts();
      const msg = after.attemptsRemaining > 0
        ? `${after.attemptsRemaining} intentos restantes`
        : 'Dispositivo bloqueado por 15 minutos';
      return { success: false, error: `PIN incorrecto. ${msg}` };
    }

    // ── Crear sesión ─────────────────────────────────────────────────────
    await resetPinAttempts();

    const sessionToken = globalThis.crypto?.randomUUID?.() ?? `token_${Date.now()}_${Math.random()}`;

    const session: SessionConfig = {
      deviceId: terminalConfig.deviceId,
      commercioId: terminalConfig.commercioId,
      sucursalId: terminalConfig.sucursalId,
      numeroTerminal: terminalConfig.numeroTerminal,
      aliasNombre: terminalConfig.aliasNombre,
      operadorActual: operadorNombre.trim(),
      rol: terminalConfig.rol,
      pinAccesoHash: terminalConfig.pinAccesoHash,
      sessionToken,
      loginTimestamp: Date.now(),
      lastActivityTimestamp: Date.now(),
      turnoActivo: false,
    };

    await saveSessionConfig(session);
    console.log(`[Auth] Login exitoso: ${operadorNombre} en ${terminalConfig.aliasNombre}`);

    return { success: true, session };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Error desconocido' };
  }
}

// ─── Gestión de sesión ────────────────────────────────────────────────────────

const SESSION_KEY = 'session_config';
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 horas

async function saveSessionConfig(session: SessionConfig): Promise<void> {
  await getStorage().setItem(SESSION_KEY, JSON.stringify(session));
}

export async function loadCurrentSession(): Promise<SessionConfig | null> {
  try {
    const raw = await getStorage().getItem(SESSION_KEY);
    if (!raw) return null;

    const session = JSON.parse(raw) as SessionConfig;
    if (Date.now() - session.loginTimestamp > SESSION_DURATION_MS) {
      await clearCurrentSession();
      return null;
    }
    return session;
  } catch (error) {
    console.error('[Auth] Error cargando sesión:', error);
    return null;
  }
}

export async function updateSessionActivity(): Promise<void> {
  try {
    const session = await loadCurrentSession();
    if (session) {
      session.lastActivityTimestamp = Date.now();
      await saveSessionConfig(session);
    }
  } catch (error) {
    console.error('[Auth] Error actualizando actividad:', error);
  }
}

export async function clearCurrentSession(): Promise<void> {
  await getStorage().removeItem(SESSION_KEY);
}

export async function isSessionActive(): Promise<boolean> {
  const session = await loadCurrentSession();
  return session !== null && session.turnoActivo;
}

export async function getActiveSession(): Promise<SessionConfig> {
  const session = await loadCurrentSession();
  if (!session) throw new Error('[Auth] No hay sesión activa');
  return session;
}
