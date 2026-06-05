/**
 * Enrolamiento de Dispositivo - Lógica compartida
 * Valida token, descarga datasets y sincroniza con WatermelonDB local
 */

import { Database } from '@nozbe/watermelondb';
import { RawRecord } from '@nozbe/watermelondb/RawRecord';

export interface EnrollRequest {
  tokenEnrolamiento: string;
  idHardware: string;
  plataforma: 'mobile' | 'web';
}

export interface EnrollResponse {
  success: boolean;
  message?: string;
  device_id: string;
  alias_nombre: string;
  pin_acceso_hash: string;
  comercio_id: string;
  sucursal_id: string;
  numero_terminal: number;
  datasets: {
    productos: ProductoDTO[];
    precios_sucursal: PreciosSucursalDTO[];
    medios_pago: MedioPagoDTO[];
    promociones_local: PromocionDTO[];
  };
  timestamp: number;
}

export interface ProductoDTO {
  id: string;
  codigo_barras: string;
  nombre: string;
  marca: string;
  categoria: string;
  descripcion: string;
  ultima_actualizacion: number;
}

export interface PreciosSucursalDTO {
  id: string;
  producto_id: string;
  sucursal_id: string;
  precio_venta: number;
  porcentaje_ganancia: number;
  ultima_actualizacion: number;
}

export interface MedioPagoDTO {
  id: string;
  comercio_id: string;
  nombre: string;
  activo: boolean;
  ultima_actualizacion: number;
}

export interface PromocionDTO {
  id: string;
  producto_id: string;
  sucursal_id: string;
  precio_oferta: number;
  fecha_inicio: number;
  fecha_fin: number | null;
  limite_cantidad: number | null;
  cantidad_restante: number | null;
  estado: 'PROGRAMADA' | 'ACTIVA' | 'AGOTADA' | 'FINALIZADA';
  ultima_actualizacion: number;
}

export interface TerminalConfig {
  comercioID: string;
  sucursalID: string;
  numeroTerminal: number;
  idHardware: string;
  aliasNombre: string;
  pinAccesoHash: string;
  rol: 'ADMIN' | 'OPERADOR_STOCK' | 'POS_CAJERO' | 'GERENTE';
  enrolledAt: number;
  lastSync: number;
}

/**
 * Procesar enrolamiento: valida token, descarga datasets, sincroniza BD local
 */
export async function enrollDevice(
  serverUrl: string,
  enrollRequest: EnrollRequest,
  database: Database,
  onProgress?: (status: string) => void
): Promise<{ success: boolean; config: TerminalConfig; error?: string }> {
  try {
    onProgress?.('Enviando solicitud de enrolamiento...');

    // Paso 1: Enviar solicitud al servidor Go
    const response = await fetch(`${serverUrl}/devices/enroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(enrollRequest),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Enrollment failed: ${response.status}`);
    }

    const enrollResponse: EnrollResponse = await response.json();

    if (!enrollResponse.success) {
      throw new Error(enrollResponse.message || 'Enrollment failed');
    }

    onProgress?.('Almacenando configuración local...');

    // Paso 2: Guardar configuración en AsyncStorage (o memoria local del dispositivo)
    const terminalConfig: TerminalConfig = {
      comercioID: enrollResponse.comercio_id,
      sucursalID: enrollResponse.sucursal_id,
      numeroTerminal: enrollResponse.numero_terminal,
      idHardware: enrollRequest.idHardware,
      aliasNombre: enrollResponse.alias_nombre,
      pinAccesoHash: enrollResponse.pin_acceso_hash,
      rol: 'POS_CAJERO', // Por defecto, puede cambiar si es OPERADOR_STOCK o ADMIN
      enrolledAt: enrollResponse.timestamp,
      lastSync: enrollResponse.timestamp,
    };

    // Guardar en AsyncStorage (React Native) o localStorage (Web)
    await saveTerminalConfig(terminalConfig);

    onProgress?.('Sincronizando datos locales...');

    // Paso 3: Sincronizar datasets con WatermelonDB
    await syncDatasetsToLocal(database, enrollResponse.datasets);

    onProgress?.('✅ Enrolamiento completado');

    return { success: true, config: terminalConfig };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, config: null as any, error: errorMessage };
  }
}

/**
 * Guardar configuración del terminal (AsyncStorage en Mobile, localStorage en Web)
 */
async function saveTerminalConfig(config: TerminalConfig): Promise<void> {
  const configJSON = JSON.stringify(config);

  // Detectar si es React Native o Web
  if (typeof AsyncStorage !== 'undefined') {
    // React Native
    await AsyncStorage.setItem('terminal_config', configJSON);
  } else if (typeof localStorage !== 'undefined') {
    // Web
    localStorage.setItem('terminal_config', configJSON);
  } else {
    throw new Error('No storage available');
  }
}

/**
 * Cargar configuración del terminal
 */
export async function loadTerminalConfig(): Promise<TerminalConfig | null> {
  try {
    let configJSON: string | null = null;

    if (typeof AsyncStorage !== 'undefined') {
      configJSON = await AsyncStorage.getItem('terminal_config');
    } else if (typeof localStorage !== 'undefined') {
      configJSON = localStorage.getItem('terminal_config');
    }

    return configJSON ? JSON.parse(configJSON) : null;
  } catch (error) {
    console.error('Failed to load terminal config:', error);
    return null;
  }
}

/**
 * Sincronizar datasets descargados a WatermelonDB local
 */
async function syncDatasetsToLocal(
  database: Database,
  datasets: EnrollResponse['datasets']
): Promise<void> {
  const { productos, precios_sucursal, medios_pago, promociones_local } = datasets;

  await database.write(async () => {
    // Sincronizar productos
    const productosCollection = database.get('productos');
    for (const p of productos) {
      const existing = await productosCollection
        .query()
        .where('id', p.id)
        .fetch()
        .catch(() => []);

      if (existing.length > 0) {
        await existing[0].update(record => {
          record.codigo_barras = p.codigo_barras;
          record.nombre = p.nombre;
          record.marca = p.marca;
          record.categoria = p.categoria;
          record.descripcion = p.descripcion;
          record.ultima_actualizacion = p.ultima_actualizacion;
        });
      } else {
        await productosCollection.create(record => {
          record._raw.id = p.id;
          record.codigo_barras = p.codigo_barras;
          record.nombre = p.nombre;
          record.marca = p.marca;
          record.categoria = p.categoria;
          record.descripcion = p.descripcion;
          record.ultima_actualizacion = p.ultima_actualizacion;
        });
      }
    }

    // Sincronizar precios_sucursal
    const preciosCollection = database.get('precios_sucursal');
    for (const p of precios_sucursal) {
      const existing = await preciosCollection
        .query()
        .where('id', p.id)
        .fetch()
        .catch(() => []);

      if (existing.length > 0) {
        await existing[0].update(record => {
          record.precio_venta = p.precio_venta;
          record.porcentaje_ganancia = p.porcentaje_ganancia;
          record.ultima_actualizacion = p.ultima_actualizacion;
        });
      } else {
        await preciosCollection.create(record => {
          record._raw.id = p.id;
          record.producto_id = p.producto_id;
          record.sucursal_id = p.sucursal_id;
          record.precio_venta = p.precio_venta;
          record.porcentaje_ganancia = p.porcentaje_ganancia;
          record.ultima_actualizacion = p.ultima_actualizacion;
        });
      }
    }

    // Sincronizar medios_pago
    const mediosCollection = database.get('medios_pago');
    for (const m of medios_pago) {
      const existing = await mediosCollection
        .query()
        .where('id', m.id)
        .fetch()
        .catch(() => []);

      if (existing.length > 0) {
        await existing[0].update(record => {
          record.nombre = m.nombre;
          record.activo = m.activo;
          record.ultima_actualizacion = m.ultima_actualizacion;
        });
      } else {
        await mediosCollection.create(record => {
          record._raw.id = m.id;
          record.comercio_id = m.comercio_id;
          record.nombre = m.nombre;
          record.activo = m.activo;
          record.ultima_actualizacion = m.ultima_actualizacion;
        });
      }
    }

    // Sincronizar promociones_local
    const promosCollection = database.get('promociones_local');
    for (const p of promociones_local) {
      const existing = await promosCollection
        .query()
        .where('id', p.id)
        .fetch()
        .catch(() => []);

      if (existing.length > 0) {
        await existing[0].update(record => {
          record.precio_oferta = p.precio_oferta;
          record.estado = p.estado;
          record.cantidad_restante = p.cantidad_restante;
          record.ultima_actualizacion = p.ultima_actualizacion;
        });
      } else {
        await promosCollection.create(record => {
          record._raw.id = p.id;
          record.producto_id = p.producto_id;
          record.sucursal_id = p.sucursal_id;
          record.precio_oferta = p.precio_oferta;
          record.fecha_inicio = p.fecha_inicio;
          record.fecha_fin = p.fecha_fin;
          record.limite_cantidad = p.limite_cantidad;
          record.cantidad_restante = p.cantidad_restante;
          record.estado = p.estado;
          record.ultima_actualizacion = p.ultima_actualizacion;
        });
      }
    }
  });
}

/**
 * Verificar si el dispositivo ya está enrollado
 */
export async function isDeviceEnrolled(): Promise<boolean> {
  const config = await loadTerminalConfig();
  return config !== null;
}

/**
 * Limpiar enrolamiento (logout completo)
 */
export async function clearEnrollment(): Promise<void> {
  if (typeof AsyncStorage !== 'undefined') {
    await AsyncStorage.removeItem('terminal_config');
  } else if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('terminal_config');
  }
}
