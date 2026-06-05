/**
 * syncConfig.ts — Configuración de tablas a sincronizar por rol
 *
 * Regla de rendimiento "Ultra-Light" para CAJERO:
 *   Solo descarga las tablas mínimas necesarias para cobrar.
 *   El árbol de pantallas no usado se destruye de memoria en React.
 *
 * Regla de privacidad para DEPOSITO:
 *   Los campos de costos y precios viajan en null/0.
 *   Nunca se exponen datos financieros al operario logístico.
 */

import { type Rol, ROLES } from '../logic/permissions';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type SyncTable =
  | 'productos'           // Maestro completo de productos (con costos y precios)
  | 'productos_pos'       // Vista liviana para CAJERO (sin costos, sin métricas)
  | 'precios_sucursal'    // Precios por sucursal
  | 'stock_sucursal'      // Stock real maestro
  | 'promociones'         // Promociones activas
  | 'turnos'              // Turnos de caja (historial completo)
  | 'turnos_caja_local'   // Turno activo del dispositivo (solo CAJERO)
  | 'tickets'             // Historial de ventas
  | 'ticket_items'        // Detalle de tickets
  | 'medios_pago'         // Medios de pago habilitados
  | 'historial_tickets_local'; // Tickets offline del POS

export interface SyncField {
  table: SyncTable;
  /**
   * Si se define, solo estos campos se incluyen en la sincronización.
   * Si es undefined, se sincronizan todos los campos de la tabla.
   * Si un campo es sensible (costo), se envía como null para ciertos roles.
   */
  fields?: string[];
  /**
   * Campos que se ENMASCARAN (enviados como null) para este rol.
   */
  maskedFields?: string[];
}

// ─── Configuración por rol ────────────────────────────────────────────────────

export const SYNC_CONFIG: Record<Rol, SyncField[]> = {

  // ── ADMIN ─────────────────────────────────────────────────────────────────
  // Descarga el 100% de las tablas cross-sucursal.
  [ROLES.ADMIN]: [
    { table: 'productos' },
    { table: 'precios_sucursal' },
    { table: 'stock_sucursal' },
    { table: 'promociones' },
    { table: 'turnos' },
    { table: 'tickets' },
    { table: 'ticket_items' },
    { table: 'medios_pago' },
  ],

  // ── ENCARGADO ─────────────────────────────────────────────────────────────
  // Igual que ADMIN pero filtrado por sucursal_id.
  // El filtro de sucursal se aplica en el query del backend.
  [ROLES.ENCARGADO]: [
    { table: 'productos' },
    { table: 'precios_sucursal' },
    { table: 'stock_sucursal' },
    { table: 'promociones' },
    { table: 'turnos' },
    { table: 'tickets' },
    { table: 'ticket_items' },
    { table: 'medios_pago' },
  ],

  // ── DEPOSITO ──────────────────────────────────────────────────────────────
  // Solo la tabla de productos, SIN costos ni precios de venta.
  // Interfaz puramente logística: código de barras + cantidad.
  [ROLES.DEPOSITO]: [
    {
      table: 'productos',
      fields: ['id', 'ean', 'codigo_interno', 'nombre', 'marca', 'categoria', 'unidad_medida', 'activo'],
      maskedFields: [], // los campos de precio/costo simplemente NO se incluyen
    },
    { table: 'stock_sucursal' },
  ],

  // ── CAJERO ────────────────────────────────────────────────────────────────
  // Tabla liviana 'productos_pos' + turno activo.
  // NO se sincronizan: costos, auditorías, métricas, otras sucursales.
  [ROLES.CAJERO]: [
    { table: 'productos_pos' },
    { table: 'turnos_caja_local' },
    { table: 'historial_tickets_local' },
    { table: 'medios_pago' },
    { table: 'promociones' },
  ],
};

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * getSyncTables(rol) — devuelve la lista de tablas a sincronizar para el rol.
 */
export function getSyncTables(rol: Rol): SyncTable[] {
  return SYNC_CONFIG[rol]?.map(c => c.table) ?? [];
}

/**
 * shouldSyncTable(rol, table) — el rol debe sincronizar esta tabla.
 */
export function shouldSyncTable(rol: Rol, table: SyncTable): boolean {
  return SYNC_CONFIG[rol]?.some(c => c.table === table) ?? false;
}

/**
 * getMaskedFields(rol, table) — campos que deben enviarse como null para el rol.
 */
export function getMaskedFields(rol: Rol, table: SyncTable): string[] {
  return SYNC_CONFIG[rol]?.find(c => c.table === table)?.maskedFields ?? [];
}
