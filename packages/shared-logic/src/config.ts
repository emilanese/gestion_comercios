/**
 * config.ts — Configuración centralizada del cliente shared-logic
 *
 * Los valores por defecto apuntan a localhost para desarrollo.
 * Cada app consumidora (web-app / mobile-app) sobreescribe estos valores
 * llamando a `initConfig(overrides)` al arrancar.
 */

export interface AppConfig {
  apiBaseUrl: string;
  wsUrl: string;
}

let _config: AppConfig = {
  apiBaseUrl: 'http://localhost:8080',
  wsUrl: 'ws://localhost:8080/ws',
};

/** Inicializa la config con los valores de la app consumidora */
export function initConfig(overrides: Partial<AppConfig>): void {
  _config = { ..._config, ...overrides };
}

/** URL base REST del Gestor Cloud */
export const getApiBaseUrl = (): string => _config.apiBaseUrl;

/** URL WebSocket del Gestor Cloud */
export const getWsUrl = (): string => _config.wsUrl;

// ── URLs derivadas ─────────────────────────────────────────────────────────

/** URL del endpoint de sincronización horaria (PING_SYNC / PONG_SYNC) */
export const getSyncPingUrl = (): string => `${_config.apiBaseUrl}/sync/ping`;

/** URL del endpoint de enrolamiento por QR */
export const getEnrollUrl = (): string => `${_config.apiBaseUrl}/devices/enroll`;

/** URL base de endpoints de turno */
export const getTurnsUrl = (): string => `${_config.apiBaseUrl}/turns`;

/** URL del lookup de catálogo EAN global */
export const getEanLookupUrl = (): string => `${_config.apiBaseUrl}/catalog/ean-lookup`;

// Alias para compatibilidad con imports existentes (turn.ts usa API_BASE_URL)
export const API_BASE_URL: string = _config.apiBaseUrl;
