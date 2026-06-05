/**
 * wsUrl.ts — Detección automática de URL del WebSocket (ws:// vs wss://)
 *
 * Reglas:
 *   - Desarrollo local (localhost / 127.0.0.1):  ws://localhost:8080/ws
 *   - Producción (servidor real):                wss://api.avanti-retail.cloud/ws
 *
 * Prioridad de resolución:
 *   1. Variable de entorno explícita (NEXT_PUBLIC_WS_URL / EXPO_PUBLIC_WS_URL)
 *   2. React Native (__DEV__ flag de Expo/Metro)
 *   3. Browser: detección de hostname
 *   4. Fallback: localhost desarrollo
 *
 * Uso:
 *   import { getWsUrl } from '@avanti/shared-logic';
 *   const wsManager = new WebSocketManager(getWsUrl(), jwt);
 */

const WS_PROD_URL = 'wss://api.avanti-retail.cloud/ws';
const WS_DEV_URL  = 'ws://localhost:8080/ws';

/**
 * getWsUrl() — Retorna la URL correcta del WebSocket según el entorno.
 * Se puede llamar en cualquier plataforma (React Native, Next.js, browser).
 */
export function getWsUrl(): string {
  // ── Prioridad 1: Variable de entorno explícita ───────────────────────────
  // Next.js: NEXT_PUBLIC_WS_URL
  // Expo:    EXPO_PUBLIC_WS_URL
  const envUrl =
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_WS_URL) ||
    (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_WS_URL);

  if (envUrl) {
    // Garantizar que en producción siempre sea wss://
    if (!isLocalhost() && envUrl.startsWith('ws://') && !envUrl.includes('localhost')) {
      console.warn('[wsUrl] ⚠️  NEXT_PUBLIC_WS_URL usa ws:// en producción — forzando wss://');
      return envUrl.replace('ws://', 'wss://');
    }
    return envUrl;
  }

  // ── Prioridad 2: React Native / Expo (__DEV__ global) ────────────────────
  // En Expo, __DEV__ es true en desarrollo y false en el build de producción.
  if (typeof __DEV__ !== 'undefined') {
    return __DEV__ ? WS_DEV_URL : WS_PROD_URL;
  }

  // ── Prioridad 3: Browser — detectar hostname ─────────────────────────────
  if (typeof window !== 'undefined' && window.location) {
    return isLocalhostFromWindow() ? WS_DEV_URL : WS_PROD_URL;
  }

  // ── Fallback: desarrollo ──────────────────────────────────────────────────
  return WS_DEV_URL;
}

/**
 * getApiUrl() — URL base del API REST según el entorno.
 * Equivalente a getWsUrl() pero para HTTP.
 */
export function getApiUrl(): string {
  const envUrl =
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_URL) ||
    (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL);

  if (envUrl) return envUrl;

  if (typeof __DEV__ !== 'undefined') {
    return __DEV__ ? 'http://localhost:8080' : 'https://api.avanti-retail.cloud';
  }

  if (typeof window !== 'undefined' && window.location) {
    return isLocalhostFromWindow() ? 'http://localhost:8080' : 'https://api.avanti-retail.cloud';
  }

  return 'http://localhost:8080';
}

// ─── Helpers privados ─────────────────────────────────────────────────────────

function isLocalhost(): boolean {
  if (typeof window !== 'undefined') return isLocalhostFromWindow();
  if (typeof process !== 'undefined' && process.env?.NODE_ENV) {
    return process.env.NODE_ENV === 'development';
  }
  return false;
}

function isLocalhostFromWindow(): boolean {
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.');
}
