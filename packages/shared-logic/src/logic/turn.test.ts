import { describe, it, expect, beforeEach } from 'vitest';
import {
  openTurn,
  closeTurn,
  loadActiveTurn,
  validateNoActiveTurn,
  generateTurnoID,
  validateTurnIsOpen,
  incrementTurnTicketCount,
  updateTurnExpectedBalance,
  lockTurnClosure,
  unlockTurnClosure,
  getActiveTurn,
  initTurnStorage,
} from './turn';
import { SessionConfig, StorageAdapter } from './authentication';

// ─── Mock StorageAdapter ──────────────────────────────────────────────────────

function createMockStorage(): StorageAdapter {
  const store = new Map<string, string>();
  return {
    setItem: (key: string, value: string) => { store.set(key, value); },
    getItem: (key: string) => store.get(key) ?? null,
    removeItem: (key: string) => { store.delete(key); },
  };
}

const mockSession: SessionConfig = {
  deviceId: 'DEV_TEST_001',
  commercioId: 'COM_001',
  sucursalId: 'SUC_001',
  numeroTerminal: 1,
  aliasNombre: 'Caja 1',
  operadorActual: 'Juan Carlos',
  rol: 'POS_CAJERO',
  pinAccesoHash: 'fake_hash',
  sessionToken: 'TOKEN_123',
  loginTimestamp: Date.now(),
  lastActivityTimestamp: Date.now(),
  turnoActivo: false,
};

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Cada test arranca con un storage limpio
  initTurnStorage(createMockStorage());
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('generateTurnoID', () => {
  it('genera ID con formato YYYYMMDD_T01_0005', () => {
    const id = generateTurnoID(1, 5);
    expect(id).toMatch(/^\d{8}_T01_0005$/);
  });

  it('incluye la fecha actual', () => {
    const today = new Date();
    const prefix =
      String(today.getFullYear()) +
      String(today.getMonth() + 1).padStart(2, '0') +
      String(today.getDate()).padStart(2, '0');
    expect(generateTurnoID(1, 1).startsWith(prefix)).toBe(true);
  });

  it('rellena terminal y secuencia con ceros', () => {
    expect(generateTurnoID(1, 1)).toMatch(/_T01_0001$/);
    expect(generateTurnoID(10, 123)).toMatch(/_T10_0123$/);
  });
});

describe('validateNoActiveTurn', () => {
  it('retorna true si no hay turno activo', async () => {
    expect(await validateNoActiveTurn()).toBe(true);
  });

  it('retorna false si ya hay un turno abierto', async () => {
    await openTurn(1000, mockSession);
    expect(await validateNoActiveTurn()).toBe(false);
  });
});

describe('openTurn', () => {
  it('abre turno exitosamente', async () => {
    const result = await openTurn(1000, mockSession);
    expect(result.success).toBe(true);
    expect(result.turnoID).toBeDefined();
    expect(result.turnConfig).toBeDefined();
  });

  it('persiste el turno en storage', async () => {
    await openTurn(1000, mockSession);
    const loaded = await loadActiveTurn();
    expect(loaded).not.toBeNull();
    expect(loaded?.estadoTurno).toBe('ABIERTO');
  });

  it('retorna error si ya hay turno abierto', async () => {
    await openTurn(1000, mockSession);
    const second = await openTurn(500, mockSession);
    expect(second.success).toBe(false);
    expect(second.error).toContain('Ya hay un turno abierto');
  });

  it('retorna error si monto inicial es negativo', async () => {
    const result = await openTurn(-100, mockSession);
    expect(result.success).toBe(false);
    expect(result.error).toContain('no puede ser negativo');
  });

  it('crea TurnConfig con datos correctos', async () => {
    const result = await openTurn(2500.50, mockSession);
    expect(result.turnConfig).toMatchObject({
      deviceID: mockSession.deviceId,
      comercioID: mockSession.commercioId,
      sucursalID: mockSession.sucursalId,
      numeroTerminal: mockSession.numeroTerminal,
      operadorNombre: mockSession.operadorActual,
      montoInicial: 2500.50,
      estadoTurno: 'ABIERTO',
      saldoEsperado: 2500.50,
      cierreBloqueado: false,
      ticketCount: 0,
    });
  });

  it('registra openedAt con timestamp cercano al actual', async () => {
    const before = Date.now();
    const result = await openTurn(1000, mockSession);
    const after = Date.now();
    expect(result.turnConfig?.openedAt).toBeGreaterThanOrEqual(before);
    expect(result.turnConfig?.openedAt).toBeLessThanOrEqual(after);
  });
});

describe('loadActiveTurn', () => {
  it('retorna null si no hay turno abierto', async () => {
    expect(await loadActiveTurn()).toBeNull();
  });

  it('carga el turno abierto', async () => {
    await openTurn(1000, mockSession);
    const active = await loadActiveTurn();
    expect(active?.estadoTurno).toBe('ABIERTO');
  });
});

describe('validateTurnIsOpen', () => {
  it('retorna error si no hay turno abierto', async () => {
    const result = await validateTurnIsOpen();
    expect(result.valid).toBe(false);
    expect(result.error).toContain('No hay turno abierto');
  });

  it('valida turno abierto correctamente', async () => {
    await openTurn(1000, mockSession);
    const result = await validateTurnIsOpen();
    expect(result.valid).toBe(true);
  });

  it('retorna error si cierre bloqueado', async () => {
    await openTurn(1000, mockSession);
    await lockTurnClosure();
    const result = await validateTurnIsOpen();
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Cierre bloqueado');
  });
});

describe('incrementTurnTicketCount', () => {
  it('incrementa el contador de tickets', async () => {
    await openTurn(1000, mockSession);
    await incrementTurnTicketCount();
    await incrementTurnTicketCount();
    const turn = await loadActiveTurn();
    expect(turn?.ticketCount).toBe(2);
  });
});

describe('updateTurnExpectedBalance', () => {
  it('actualiza el saldo esperado', async () => {
    await openTurn(1000, mockSession);
    await updateTurnExpectedBalance(1500);
    const turn = await loadActiveTurn();
    expect(turn?.saldoEsperado).toBe(1500);
  });
});

describe('lockTurnClosure / unlockTurnClosure', () => {
  it('bloquea el cierre del turno', async () => {
    await openTurn(1000, mockSession);
    await lockTurnClosure();
    expect((await loadActiveTurn())?.cierreBloqueado).toBe(true);
  });

  it('desbloquea el cierre del turno', async () => {
    await openTurn(1000, mockSession);
    await lockTurnClosure();
    await unlockTurnClosure();
    expect((await loadActiveTurn())?.cierreBloqueado).toBe(false);
  });
});

describe('closeTurn', () => {
  it('cierra el turno correctamente', async () => {
    await openTurn(1000, mockSession);
    const result = await closeTurn(980);
    expect(result.success).toBe(true);
    expect(result.diferencia).toBeCloseTo(-20);
    // Después del cierre, no debe haber turno activo
    expect(await loadActiveTurn()).toBeNull();
  });

  it('rechaza cierre si cierre bloqueado', async () => {
    await openTurn(1000, mockSession);
    await lockTurnClosure();
    const result = await closeTurn(1000);
    expect(result.success).toBe(false);
    expect(result.error).toContain('tickets pendientes');
  });

  it('retorna error si no hay turno abierto', async () => {
    const result = await closeTurn(500);
    expect(result.success).toBe(false);
    expect(result.error).toContain('No hay turno abierto');
  });
});

describe('getActiveTurn', () => {
  it('retorna el turno activo', async () => {
    const openResult = await openTurn(1000, mockSession);
    const active = await getActiveTurn();
    expect(active?.turnoID).toBe(openResult.turnConfig?.turnoID);
  });

  it('retorna null si no hay turno activo', async () => {
    expect(await getActiveTurn()).toBeNull();
  });
});
