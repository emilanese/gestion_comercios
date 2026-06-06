/**
 * shared-logic/index.ts — Punto de entrada PÚBLICO del paquete.
 *
 * ⚠️  REGLA: Solo exportar código que funcione en web (Next.js) Y en mobile (Expo).
 *    Los módulos que dependen de React Native, WatermelonDB, expo-camera, etc.
 *    NO se exportan aquí. La mobile-app los importa directamente por path:
 *      import { enrollDevice }  from '@comercios/shared-logic/src/logic/enrollment';
 *      import { searchProducts } from '@comercios/shared-logic/src/logic/search';
 *      import { EnrollmentForm } from '@comercios/shared-logic/src/components/EnrollmentForm';
 */

// Export config
export * from './config';

// Export URL helpers (WSS auto-detection dev vs prod)
export { getWsUrl, getApiUrl } from './config/wsUrl';

// Export sync/handshake
export { TimeDriftManager } from './sync/timeDrift';
export { WebSocketManager, WS_MSG } from './sync/websocket';
export type {
  WsMsgType,
  WebSocketMessage,
  MessageHandler,
  ConnectionListener,
  StockUpdatePayload,
  PrecioUpdatePayload,
  PromoPayload,
  TicketConfirmadoPayload,
  TurnoPayload,
  ConnectedPayload,
  VersionConflictPayload,
} from './sync/websocket';

// Export OCC (Optimistic Concurrency Control)
export { occAction, waitForVersion } from './sync/versioning';
export type {
  SyncMutation,
  PendingMutation,
  MutationResult,
} from './sync/versioning';

// Export Outbox (POS offline tickets)
export { TicketOutbox } from './sync/outbox';
export type {
  LocalTicket,
  LocalTicketItem,
  TicketEstado,
  TicketsPendientePayload,
} from './sync/outbox';

// Export Reconnect (POS reconnection protocol)
export { POSReconnectManager } from './sync/reconnect';
export type {
  PosHandshakePayload,
  DeltaEntry,
  DeltaSyncMessage,
  TicketConfirmadoMessage,
  POSDbAccessors,
} from './sync/reconnect';

// Export i18n (pure TS, no RN dependency)
export { i18n, getTranslation, t, setLanguage } from './i18n/i18n';
export type { Locale } from './i18n/i18n';

// Export permissions + roles
export {
  ROLES,
  can,
  requiresAuth,
  canOrRequiresAuth,
  getDefaultRoute,
  isAutorizador,
} from './logic/permissions';
export type { Rol, Permission } from './logic/permissions';

// Export sync config (tablas por rol)
export {
  SYNC_CONFIG,
  getSyncTables,
  shouldSyncTable,
  getMaskedFields,
} from './sync/syncConfig';
export type { SyncTable, SyncField } from './sync/syncConfig';

// Export business logic (web-compatible only)
// ❌ Excluidos: enrollment (WatermelonDB), search (WatermelonDB), cart (WatermelonDB import)
export * from './logic/tickets';
export * from './logic/inventory';
export * from './logic/promotions';
export * from './logic/authentication';
export * from './logic/turn';
export * from './logic/cart';

// Export web-compatible components
// ❌ Excluidos: TurnOpenScreen (react-native), EnrollmentForm (WatermelonDB+RN), QRScanner (expo-camera)
// ❌ Excluido: utils/device (expo-constants)
export { LoginScreen } from './components/LoginScreen';
