/**
 * permissions.ts — Matriz de permisos por rol del sistema AVANTI
 *
 * Centraliza las reglas de acceso para que tanto la app mobile como la web
 * usen exactamente la misma lógica de permisos.
 *
 * Uso:
 *   can('CAJERO', 'abrir_caja')         // false — requiere autorización
 *   can('ADMIN', 'ver_costos')          // true
 *   requires_auth('CAJERO', 'abrir_caja') // true
 */

// ─── Tipos de rol ─────────────────────────────────────────────────────────────

export const ROLES = {
  ADMIN:     'ADMIN',
  ENCARGADO: 'ENCARGADO',
  DEPOSITO:  'DEPOSITO',
  CAJERO:    'CAJERO',
} as const;

export type Rol = (typeof ROLES)[keyof typeof ROLES];

// ─── Permisos disponibles ─────────────────────────────────────────────────────

export type Permission =
  // Módulos principales
  | 'acceder_pos'               // puede entrar a la pantalla POS
  | 'acceder_hub'               // puede entrar al módulo HUB
  | 'acceder_deposito'          // puede entrar a la pantalla de logística
  // Finanzas
  | 'ver_costos'                // ver costos de compra (solo ADMIN)
  | 'modificar_precio'          // cambiar precio de venta
  | 'modificar_costo'           // cambiar costo en pantalla de remito (solo ADMIN)
  | 'ver_metricas_globales'     // métricas cross-sucursal (solo ADMIN)
  | 'ver_otras_sucursales'      // datos de otras sucursales (solo ADMIN)
  // Operaciones POS
  | 'abrir_caja'                // abrir turno de caja (CAJERO requiere auth)
  | 'cerrar_caja'               // cerrar turno
  | 'anular_ticket'             // anular ticket emitido (CAJERO requiere auth)
  | 'descuento_manual'          // aplicar descuento de cortesía (CAJERO requiere auth)
  | 'ver_stock_total'           // ver stock real completo (no solo productos_pos)
  // Logística
  | 'ingresar_remito'           // registrar ingreso de mercadería
  | 'egreso_stock'              // registrar roturas/devoluciones
  | 'auditoria_stock'           // auditoría física de stock
  // Administración
  | 'gestionar_empleados'       // ABM de usuarios del comercio (solo ADMIN)
  | 'ver_auditoria'             // ver log de autorizaciones
  | 'autorizar_acciones'        // puede aprobar/rechazar solicitudes del CAJERO;

// ─── Matriz de permisos ───────────────────────────────────────────────────────

/**
 * Permisos directos: el rol puede ejecutar la acción sin requerir autorización.
 */
const DIRECT_PERMISSIONS: Record<Rol, Permission[]> = {
  ADMIN: [
    'acceder_pos', 'acceder_hub', 'acceder_deposito',
    'ver_costos', 'modificar_precio', 'modificar_costo',
    'ver_metricas_globales', 'ver_otras_sucursales',
    'abrir_caja', 'cerrar_caja', 'anular_ticket', 'descuento_manual',
    'ver_stock_total', 'ingresar_remito', 'egreso_stock', 'auditoria_stock',
    'gestionar_empleados', 'ver_auditoria', 'autorizar_acciones',
  ],
  ENCARGADO: [
    'acceder_pos', 'acceder_hub',
    'modificar_precio',
    'abrir_caja', 'cerrar_caja', 'anular_ticket', 'descuento_manual',
    'ver_stock_total', 'ingresar_remito', 'egreso_stock', 'auditoria_stock',
    'ver_auditoria', 'autorizar_acciones',
  ],
  DEPOSITO: [
    'acceder_deposito',
    'ingresar_remito', 'egreso_stock', 'auditoria_stock',
  ],
  CAJERO: [
    'acceder_pos',
    'cerrar_caja',
    // abrir_caja, anular_ticket, descuento_manual → requieren autorización (ver REQUIRES_AUTH)
  ],
};

/**
 * Permisos que requieren autorización de ENCARGADO/ADMIN para el CAJERO.
 * Para otros roles con acceso directo, estas acciones NO están en esta lista.
 */
const REQUIRES_AUTH: Partial<Record<Rol, Permission[]>> = {
  CAJERO: ['abrir_caja', 'anular_ticket', 'descuento_manual'],
};

// ─── Funciones públicas ───────────────────────────────────────────────────────

/**
 * can(rol, permission) — el rol puede ejecutar la acción directamente.
 * Retorna false si la acción requiere autorización para ese rol.
 */
export function can(rol: Rol, permission: Permission): boolean {
  return DIRECT_PERMISSIONS[rol]?.includes(permission) ?? false;
}

/**
 * requiresAuth(rol, permission) — la acción requiere autorización de un superior.
 * Solo aplica al CAJERO (en este sistema).
 */
export function requiresAuth(rol: Rol, permission: Permission): boolean {
  return REQUIRES_AUTH[rol]?.includes(permission) ?? false;
}

/**
 * canOrRequiresAuth(rol, permission) — el rol puede ejecutar la acción,
 * ya sea directamente o previa autorización.
 * Útil para saber si el botón debe mostrarse en la UI.
 */
export function canOrRequiresAuth(rol: Rol, permission: Permission): boolean {
  return can(rol, permission) || requiresAuth(rol, permission);
}

/**
 * getDefaultRoute(rol) — ruta inicial de la app según el rol.
 * Sincronizado con la lógica de index.tsx del mobile.
 */
export function getDefaultRoute(rol: Rol): '/pos' | '/hub' | '/deposito' {
  switch (rol) {
    case ROLES.CAJERO:
      return '/pos';
    case ROLES.DEPOSITO:
      return '/deposito';
    case ROLES.ADMIN:
    case ROLES.ENCARGADO:
    default:
      return '/hub';
  }
}

/**
 * isAutorizador(rol) — puede aprobar/rechazar solicitudes del CAJERO.
 */
export function isAutorizador(rol: Rol): boolean {
  return rol === ROLES.ADMIN || rol === ROLES.ENCARGADO;
}
