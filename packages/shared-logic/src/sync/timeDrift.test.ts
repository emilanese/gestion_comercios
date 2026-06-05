import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TimeDriftManager } from '../sync/timeDrift';

describe('TimeDriftManager - Handshake Time-Drift', () => {
  let timeDrift: TimeDriftManager;

  beforeEach(() => {
    timeDrift = new TimeDriftManager();
  });

  afterEach(() => {
    timeDrift.reset();
  });

  it('debe calcular delta horario correctamente sin latencia', async () => {
    const mockServerTime = Date.now() + 5000; // Servidor 5 segundos adelante

    const result = await timeDrift.executeHandshake(async () => mockServerTime);

    // Delta debe ser aproximadamente 5000ms (±200ms por margen de error)
    expect(result.deltaHorario).toBeGreaterThan(4800);
    expect(result.deltaHorario).toBeLessThan(5200);
  });

  it('debe calcular latencia con simulación de red', async () => {
    const mockServerTime = Date.now() + 1000;

    const result = await timeDrift.executeHandshake(
      async () =>
        new Promise((resolve) => {
          // Simular latencia de 100ms
          setTimeout(() => resolve(mockServerTime), 100);
        })
    );

    // Latencia debe estar cerca de 50ms (100ms / 2)
    expect(result.latencia).toBeGreaterThan(40);
    expect(result.latencia).toBeLessThan(120);
  });

  it('debe manejar grandes diferencias horarias', async () => {
    const mockServerTime = Date.now() + 86400000; // Servidor 24 horas adelante

    const result = await timeDrift.executeHandshake(async () => mockServerTime);

    // Delta debe ser aproximadamente 24h en ms
    expect(result.deltaHorario).toBeGreaterThan(86399000);
    expect(result.deltaHorario).toBeLessThan(86401000);
  });

  it('debe retornar timestamps corregidos', async () => {
    const deltaTest = 5000;
    const mockServerTime = Date.now() + deltaTest;

    await timeDrift.executeHandshake(async () => mockServerTime);

    const clientTime = Date.now();
    const correctedTime = timeDrift.getTimestamp();

    // Timestamp corregido debe ser cliente + delta
    expect(correctedTime - clientTime).toBeGreaterThan(deltaTest - 50);
    expect(correctedTime - clientTime).toBeLessThan(deltaTest + 50);
  });

  it('debe permitir reset del delta', async () => {
    const mockServerTime = Date.now() + 5000;
    await timeDrift.executeHandshake(async () => mockServerTime);

    expect(timeDrift.getDeltaHorario()).not.toBe(0);

    timeDrift.reset();

    expect(timeDrift.getDeltaHorario()).toBe(0);
    expect(timeDrift.getLatencia()).toBe(0);
  });

  it('debe mantener delta consistente entre múltiples llamadas a getTimestamp', async () => {
    const mockServerTime = Date.now() + 3000;
    await timeDrift.executeHandshake(async () => mockServerTime);

    const ts1 = timeDrift.getTimestamp();
    // Esperar 10ms
    await new Promise((resolve) => setTimeout(resolve, 10));
    const ts2 = timeDrift.getTimestamp();

    // La diferencia debe ser aproximadamente 10ms
    expect(ts2 - ts1).toBeGreaterThanOrEqual(8);
    expect(ts2 - ts1).toBeLessThanOrEqual(20);
  });

  it('debe manejar errores del servidor', async () => {
    const errorServer = async () => {
      throw new Error('Server unavailable');
    };

    await expect(timeDrift.executeHandshake(errorServer)).rejects.toThrow();
  });
});
