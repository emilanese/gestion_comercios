/**
 * Lógica de negocio para inventario
 */

import { timeDrift } from '../sync/timeDrift';

export interface DeltaMovimiento {
  producto_id: string;
  sucursal_id: string;
  concepto: 'VENTA_POS' | 'INVENTARIO' | 'INGRESO' | 'EGRESO';
  variacion_delta: number;
  motivo_descripcion?: string;
  cantidad_resultante: number;
}

/**
 * Calcula el Delta de inventario
 */
export function calcularDelta(
  cantidadActual: number,
  cantidadNueva: number,
  concepto: 'INVENTARIO' | 'INGRESO' | 'EGRESO'
): number {
  if (concepto === 'INVENTARIO') {
    return cantidadNueva - cantidadActual;
  }
  return cantidadNueva; // Para ingreso/egreso es el delta directo
}

/**
 * Valida un movimiento de inventario
 */
export function validarMovimientoInventario(
  cantidadResultante: number,
  stockMinimo: number
): { valido: boolean; advertencias: string[] } {
  const advertencias: string[] = [];

  if (cantidadResultante < 0) {
    advertencias.push('Stock negativo no permitido');
  }

  if (cantidadResultante < stockMinimo) {
    advertencias.push(`Stock por debajo del mínimo (${stockMinimo})`);
  }

  return {
    valido: cantidadResultante >= 0,
    advertencias
  };
}

/**
 * Crea un movimiento de Delta con timestamp corregido
 */
export function crearDeltaMovimiento(
  producto_id: string,
  sucursal_id: string,
  concepto: 'VENTA_POS' | 'INVENTARIO' | 'INGRESO' | 'EGRESO',
  variacion_delta: number,
  cantidad_resultante: number,
  motivo_descripcion?: string
): DeltaMovimiento {
  return {
    producto_id,
    sucursal_id,
    concepto,
    variacion_delta,
    cantidad_resultante,
    motivo_descripcion
  };
}
