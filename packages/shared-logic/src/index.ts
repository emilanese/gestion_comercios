// Export database schema + models
export * from './db/schema';
export * from './db/models/index';

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

// Export i18n
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

// Export business logic
export * from './logic/tickets';
export * from './logic/inventory';
export * from './logic/promotions';
export * from './logic/enrollment';
export * from './logic/authentication';
export * from './logic/turn';
export * from './logic/cart';
export * from './logic/search';

// Export components
export { EnrollmentForm } from './components/EnrollmentForm';
export { LoginScreen } from './components/LoginScreen';
export { default as TurnOpenScreen } from './components/TurnOpenScreen';
export { QRScanner } from './components/QRScanner';

// Export device utils
export * from './utils/device';
