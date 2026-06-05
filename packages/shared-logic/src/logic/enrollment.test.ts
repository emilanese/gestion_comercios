/**
 * Tests para Enrolamiento de Dispositivo
 * Valida: token validation, dataset download, idempotencia
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { enrollDevice, loadTerminalConfig, clearEnrollment, isDeviceEnrolled } from './enrollment';

describe('Device Enrollment', () => {
  beforeEach(() => {
    // Limpiar localStorage antes de cada test
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  it('should successfully enroll device with valid token', async () => {
    // Mock fetch para simular respuesta del servidor
    const mockResponse = {
      success: true,
      device_id: 'dev_test_001',
      alias_nombre: 'Caja 1',
      pin_acceso_hash: 'hash_pin_123',
      comercio_id: 'com_001',
      sucursal_id: 'suc_001',
      numero_terminal: 1,
      datasets: {
        productos: [
          {
            id: 'prod_001',
            codigo_barras: '7798012345678',
            nombre: 'Producto Test',
            marca: 'Marca Test',
            categoria: 'Bebidas',
            descripcion: '',
            ultima_actualizacion: Date.now(),
          },
        ],
        precios_sucursal: [
          {
            id: 'precio_001',
            producto_id: 'prod_001',
            sucursal_id: 'suc_001',
            precio_venta: 100,
            porcentaje_ganancia: 20,
            ultima_actualizacion: Date.now(),
          },
        ],
        medios_pago: [
          {
            id: 'medio_001',
            comercio_id: 'com_001',
            nombre: 'Efectivo',
            activo: true,
            ultima_actualizacion: Date.now(),
          },
        ],
        promociones_local: [],
      },
      timestamp: Date.now(),
    };

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      })
    ) as any;

    // Mock database
    const mockDatabase = {
      write: vi.fn((callback: any) => callback()),
      get: vi.fn((tableName: string) => ({
        query: () => ({
          where: () => ({
            fetch: () => [],
          }),
        }),
        create: vi.fn(),
      })),
    } as any;

    const result = await enrollDevice(
      'http://localhost:8080',
      {
        tokenEnrolamiento: 'token_test_123',
        idHardware: 'hw_test_001',
        plataforma: 'web',
      },
      mockDatabase
    );

    expect(result.success).toBe(true);
    expect(result.config).toBeDefined();
    expect(result.config?.aliasNombre).toBe('Caja 1');
    expect(result.config?.numeroTerminal).toBe(1);
  });

  it('should handle enrollment error with invalid token', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'enrollment token not found' }),
      })
    ) as any;

    const mockDatabase = {} as any;

    const result = await enrollDevice(
      'http://localhost:8080',
      {
        tokenEnrolamiento: 'invalid_token',
        idHardware: 'hw_test_001',
        plataforma: 'web',
      },
      mockDatabase
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should persist terminal config to localStorage', async () => {
    const mockResponse = {
      success: true,
      device_id: 'dev_test_001',
      alias_nombre: 'Caja 1',
      pin_acceso_hash: 'hash_pin_123',
      comercio_id: 'com_001',
      sucursal_id: 'suc_001',
      numero_terminal: 1,
      datasets: {
        productos: [],
        precios_sucursal: [],
        medios_pago: [],
        promociones_local: [],
      },
      timestamp: Date.now(),
    };

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      })
    ) as any;

    const mockDatabase = {
      write: vi.fn((callback: any) => callback()),
      get: vi.fn(() => ({
        query: () => ({
          where: () => ({
            fetch: () => [],
          }),
        }),
        create: vi.fn(),
      })),
    } as any;

    await enrollDevice(
      'http://localhost:8080',
      {
        tokenEnrolamiento: 'token_test_123',
        idHardware: 'hw_test_001',
        plataforma: 'web',
      },
      mockDatabase
    );

    const config = await loadTerminalConfig();
    expect(config).toBeDefined();
    expect(config?.aliasNombre).toBe('Caja 1');
    expect(config?.numeroTerminal).toBe(1);
  });

  it('should detect if device is already enrolled', async () => {
    // Simular que no está enrollado
    let enrolled = await isDeviceEnrolled();
    expect(enrolled).toBe(false);

    // Simular enrolamiento guardando config
    const mockConfig = {
      comercioID: 'com_001',
      sucursalID: 'suc_001',
      numeroTerminal: 1,
      idHardware: 'hw_test_001',
      aliasNombre: 'Caja 1',
      pinAccesoHash: 'hash',
      rol: 'POS_CAJERO' as const,
      enrolledAt: Date.now(),
      lastSync: Date.now(),
    };

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('terminal_config', JSON.stringify(mockConfig));
    }

    // Verificar que ahora sí está enrollado
    enrolled = await isDeviceEnrolled();
    expect(enrolled).toBe(true);

    // Limpiar enrolamiento
    await clearEnrollment();
    enrolled = await isDeviceEnrolled();
    expect(enrolled).toBe(false);
  });

  it('should validate token format', async () => {
    const mockDatabase = {} as any;

    // Token vacío
    const result = await enrollDevice(
      'http://localhost:8080',
      {
        tokenEnrolamiento: '',
        idHardware: 'hw_test_001',
        plataforma: 'web',
      },
      mockDatabase
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should handle network errors gracefully', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('Network error'))) as any;

    const mockDatabase = {} as any;

    const result = await enrollDevice(
      'http://localhost:8080',
      {
        tokenEnrolamiento: 'token_test_123',
        idHardware: 'hw_test_001',
        plataforma: 'web',
      },
      mockDatabase
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Network error');
  });

  it('should download all required datasets', async () => {
    const mockResponse = {
      success: true,
      device_id: 'dev_test_001',
      alias_nombre: 'Caja 1',
      pin_acceso_hash: 'hash_pin_123',
      comercio_id: 'com_001',
      sucursal_id: 'suc_001',
      numero_terminal: 1,
      datasets: {
        productos: [
          {
            id: 'prod_001',
            codigo_barras: '123456',
            nombre: 'Producto 1',
            marca: 'Marca',
            categoria: 'Bebidas',
            descripcion: '',
            ultima_actualizacion: Date.now(),
          },
          {
            id: 'prod_002',
            codigo_barras: '789012',
            nombre: 'Producto 2',
            marca: 'Marca',
            categoria: 'Alimentos',
            descripcion: '',
            ultima_actualizacion: Date.now(),
          },
        ],
        precios_sucursal: [
          {
            id: 'precio_001',
            producto_id: 'prod_001',
            sucursal_id: 'suc_001',
            precio_venta: 100,
            porcentaje_ganancia: 20,
            ultima_actualizacion: Date.now(),
          },
        ],
        medios_pago: [
          {
            id: 'medio_001',
            comercio_id: 'com_001',
            nombre: 'Efectivo',
            activo: true,
            ultima_actualizacion: Date.now(),
          },
          {
            id: 'medio_002',
            comercio_id: 'com_001',
            nombre: 'Tarjeta',
            activo: true,
            ultima_actualizacion: Date.now(),
          },
        ],
        promociones_local: [
          {
            id: 'promo_001',
            producto_id: 'prod_001',
            sucursal_id: 'suc_001',
            precio_oferta: 80,
            fecha_inicio: Date.now(),
            fecha_fin: null,
            limite_cantidad: 100,
            cantidad_restante: 50,
            estado: 'ACTIVA',
            ultima_actualizacion: Date.now(),
          },
        ],
      },
      timestamp: Date.now(),
    };

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      })
    ) as any;

    const mockDatabase = {
      write: vi.fn((callback: any) => callback()),
      get: vi.fn(() => ({
        query: () => ({
          where: () => ({
            fetch: () => [],
          }),
        }),
        create: vi.fn(),
      })),
    } as any;

    const result = await enrollDevice(
      'http://localhost:8080',
      {
        tokenEnrolamiento: 'token_test_123',
        idHardware: 'hw_test_001',
        plataforma: 'web',
      },
      mockDatabase
    );

    expect(result.success).toBe(true);
    expect(result.config?.comercioID).toBe('com_001');
    // Verificar que se llamó a database.write para sincronizar datos
    expect(mockDatabase.write).toHaveBeenCalled();
  });
});
