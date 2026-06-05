/**
 * Lógica de negocio para promociones
 */

import { timeDrift } from '../sync/timeDrift';

export type EstadoPromocion = 'PROGRAMADA' | 'ACTIVA' | 'AGOTADA' | 'FINALIZADA';

export interface Promocion {
  id: string;
  producto_id: string;
  sucursal_id: string;
  precio_oferta: number;
  fecha_inicio: number;
  fecha_fin: number | null;
  limite_cantidad: number | null;
  cantidad_restante: number | null;
  estado: EstadoPromocion;
  ultima_actualizacion: number;
}

/**
 * Evalúa el estado de una promoción basado en fechas y cantidad
 */
export function evaluarEstadoPromocion(promocion: Promocion): EstadoPromocion {
  const ahora = timeDrift.getTimestamp();

  // Si aún no llegó la fecha de inicio
  if (ahora < promocion.fecha_inicio) {
    return 'PROGRAMADA';
  }

  // Si pasó la fecha de fin
  if (promocion.fecha_fin && ahora > promocion.fecha_fin) {
    return 'FINALIZADA';
  }

  // Si se agotó la cantidad
  if (
    promocion.limite_cantidad &&
    promocion.cantidad_restante !== null &&
    promocion.cantidad_restante <= 0
  ) {
    return 'AGOTADA';
  }

  // Si no se cumple ninguna condición, está activa
  return 'ACTIVA';
}

/**
 * Valida si una promoción puede aplicarse a un producto
 */
export function puedeAplicarPromocion(promocion: Promocion): boolean {
  const estado = evaluarEstadoPromocion(promocion);
  return estado === 'ACTIVA';
}

/**
 * Decrementa la cantidad restante de una promoción
 */
export function decrementarCantidadPromocion(
  promocion: Promocion,
  cantidad: number
): Promocion {
  if (promocion.cantidad_restante === null) {
    return promocion; // Sin límite de cantidad
  }

  return {
    ...promocion,
    cantidad_restante: Math.max(0, promocion.cantidad_restante - cantidad),
    ultima_actualizacion: timeDrift.getTimestamp()
  };
}

/**
 * Crea una nueva promoción
 */
export function crearPromocion(
  producto_id: string,
  sucursal_id: string,
  precio_oferta: number,
  fecha_inicio: number,
  fecha_fin?: number,
  limite_cantidad?: number
): Promocion {
  return {
    id: `promo_${Date.now()}`,
    producto_id,
    sucursal_id,
    precio_oferta,
    fecha_inicio,
    fecha_fin: fecha_fin || null,
    limite_cantidad: limite_cantidad || null,
    cantidad_restante: limite_cantidad || null,
    estado: evaluarEstadoPromocion({
      id: `promo_${Date.now()}`,
      producto_id,
      sucursal_id,
      precio_oferta,
      fecha_inicio,
      fecha_fin: fecha_fin || null,
      limite_cantidad: limite_cantidad || null,
      cantidad_restante: limite_cantidad || null,
      estado: 'PROGRAMADA',
      ultima_actualizacion: timeDrift.getTimestamp()
    }),
    ultima_actualizacion: timeDrift.getTimestamp()
  };
}
