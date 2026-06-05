/**
 * Tests para Login Local (PIN Validation)
 * Valida: validación PIN, bloqueo tras 3 intentos, sesión activa
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  validatePINLocal,
  loginWithPIN,
  checkPinAttempts,
  recordFailedPinAttempt,
  resetPinAttempts,
  loadCurrentSession,
  clearCurrentSession,
  isSessionActive,
} from './authentication';
import crypto from 'crypto';

describe('Authentication - Login Local', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  describe('PIN Validation', () => {
    it('should validate correct PIN', async () => {
      const pin = '1234';
      const pinHash = crypto.createHash('sha256').update(pin).digest('hex');

      const result = await validatePINLocal(pin, pinHash);
      expect(result).toBe(true);
    });

    it('should reject incorrect PIN', async () => {
      const correctPin = '1234';
      const wrongPin = '5678';
      const pinHash = crypto.createHash('sha256').update(correctPin).digest('hex');

      const result = await validatePINLocal(wrongPin, pinHash);
      expect(result).toBe(false);
    });

    it('should handle empty PIN', async () => {
      const pinHash = crypto.createHash('sha256').update('1234').digest('hex');
      const result = await validatePINLocal('', pinHash);
      expect(result).toBe(false);
    });
  });

  describe('PIN Attempts Tracking', () => {
    it('should allow 3 PIN attempts before lockout', async () => {
      let attempts = await checkPinAttempts();
      expect(attempts.attemptsRemaining).toBe(3);
      expect(attempts.isLocked).toBe(false);

      // Primer intento fallido
      await recordFailedPinAttempt();
      attempts = await checkPinAttempts();
      expect(attempts.attemptsRemaining).toBe(2);
      expect(attempts.isLocked).toBe(false);

      // Segundo intento fallido
      await recordFailedPinAttempt();
      attempts = await checkPinAttempts();
      expect(attempts.attemptsRemaining).toBe(1);
      expect(attempts.isLocked).toBe(false);

      // Tercer intento fallido - se bloquea
      await recordFailedPinAttempt();
      attempts = await checkPinAttempts();
      expect(attempts.attemptsRemaining).toBe(0);
      expect(attempts.isLocked).toBe(true);
    });

    it('should reset attempts on successful login', async () => {
      // Simular 2 intentos fallidos
      await recordFailedPinAttempt();
      await recordFailedPinAttempt();

      let attempts = await checkPinAttempts();
      expect(attempts.attemptsRemaining).toBe(1);

      // Resetear
      await resetPinAttempts();

      attempts = await checkPinAttempts();
      expect(attempts.attemptsRemaining).toBe(3);
    });

    it('should persist lockout status', async () => {
      // Llenar 3 intentos fallidos
      for (let i = 0; i < 3; i++) {
        await recordFailedPinAttempt();
      }

      const attempts = await checkPinAttempts();
      expect(attempts.isLocked).toBe(true);
      expect(attempts.lockedUntil).toBeDefined();

      // Verificar persistencia
      const storedData = localStorage.getItem('pin_attempts');
      const data = JSON.parse(storedData || '{}');
      expect(data.attempts).toBe(3);
      expect(data.lockedUntil).toBeLessThan(Date.now() + 15 * 60 * 1000 + 1000); // Con margen
    });
  });

  describe('Login Flow', () => {
    const mockTerminalConfig = {
      deviceId: 'dev_test_001',
      commercioId: 'com_001',
      sucursalId: 'suc_001',
      numeroTerminal: 1,
      aliasNombre: 'Caja 1',
      pinAccesoHash: crypto.createHash('sha256').update('1234').digest('hex'),
      rol: 'POS_CAJERO' as const,
    };

    it('should successfully login with correct PIN and operator name', async () => {
      const result = await loginWithPIN('1234', 'Juan Carlos', mockTerminalConfig);

      expect(result.success).toBe(true);
      expect(result.session).toBeDefined();
      expect(result.session?.operadorActual).toBe('Juan Carlos');
      expect(result.session?.aliasNombre).toBe('Caja 1');
      expect(result.session?.turnoActivo).toBe(false);
      expect(result.session?.sessionToken).toBeDefined();
    });

    it('should fail login with incorrect PIN', async () => {
      const result = await loginWithPIN('0000', 'Juan Carlos', mockTerminalConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain('PIN incorrecto');

      // Verificar que se registró el intento fallido
      const attempts = await checkPinAttempts();
      expect(attempts.attemptsRemaining).toBe(2);
    });

    it('should lock device after 3 failed attempts', async () => {
      // 3 intentos fallidos
      for (let i = 0; i < 3; i++) {
        const result = await loginWithPIN('0000', 'Juan Carlos', mockTerminalConfig);
        expect(result.success).toBe(false);
      }

      // Cuarto intento debe estar bloqueado
      const result = await loginWithPIN('1234', 'Juan Carlos', mockTerminalConfig);
      expect(result.success).toBe(false);
      expect(result.error).toContain('bloqueado');
    });

    it('should require operator name', async () => {
      const result = await loginWithPIN('1234', '', mockTerminalConfig);

      expect(result.success).toBe(false);
      // No debería registrar intento fallido por nombre vacío
      const attempts = await checkPinAttempts();
      expect(attempts.attemptsRemaining).toBe(3);
    });

    it('should save session config after successful login', async () => {
      const result = await loginWithPIN('1234', 'Juan Carlos', mockTerminalConfig);

      expect(result.success).toBe(true);

      const loadedSession = await loadCurrentSession();
      expect(loadedSession).toBeDefined();
      expect(loadedSession?.operadorActual).toBe('Juan Carlos');
      expect(loadedSession?.sessionToken).toBe(result.session?.sessionToken);
    });
  });

  describe('Session Management', () => {
    const mockTerminalConfig = {
      deviceId: 'dev_test_001',
      commercioId: 'com_001',
      sucursalId: 'suc_001',
      numeroTerminal: 1,
      aliasNombre: 'Caja 1',
      pinAccesoHash: crypto.createHash('sha256').update('1234').digest('hex'),
      rol: 'POS_CAJERO' as const,
    };

    it('should load session after login', async () => {
      await loginWithPIN('1234', 'Carlos', mockTerminalConfig);

      const session = await loadCurrentSession();
      expect(session).toBeDefined();
      expect(session?.operadorActual).toBe('Carlos');
    });

    it('should clear session on logout', async () => {
      await loginWithPIN('1234', 'Carlos', mockTerminalConfig);

      let session = await loadCurrentSession();
      expect(session).toBeDefined();

      await clearCurrentSession();

      session = await loadCurrentSession();
      expect(session).toBeNull();
    });

    it('should return false for isSessionActive before turn opening', async () => {
      await loginWithPIN('1234', 'Carlos', mockTerminalConfig);

      const active = await isSessionActive();
      expect(active).toBe(false); // No active turn yet
    });

    it('should return true for isSessionActive after turn opening', async () => {
      const result = await loginWithPIN('1234', 'Carlos', mockTerminalConfig);
      const session = result.session!;

      // Simular apertura de turno
      session.turnoActivo = true;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('session_config', JSON.stringify(session));
      }

      const active = await isSessionActive();
      expect(active).toBe(true);
    });

    it('should contain all required session fields', async () => {
      const result = await loginWithPIN('1234', 'Juan Carlos', mockTerminalConfig);

      const session = result.session!;
      expect(session.deviceId).toBe('dev_test_001');
      expect(session.commercioId).toBe('com_001');
      expect(session.sucursalId).toBe('suc_001');
      expect(session.numeroTerminal).toBe(1);
      expect(session.aliasNombre).toBe('Caja 1');
      expect(session.operadorActual).toBe('Juan Carlos');
      expect(session.rol).toBe('POS_CAJERO');
      expect(session.pinAccesoHash).toBeDefined();
      expect(session.sessionToken).toBeDefined();
      expect(session.loginTimestamp).toBeGreaterThan(0);
      expect(session.lastActivityTimestamp).toBeGreaterThan(0);
    });
  });

  describe('Concurrent Access Handling', () => {
    it('should handle multiple login attempts concurrently', async () => {
      const terminalConfig = {
        deviceId: 'dev_test_001',
        commercioId: 'com_001',
        sucursalId: 'suc_001',
        numeroTerminal: 1,
        aliasNombre: 'Caja 1',
        pinAccesoHash: crypto.createHash('sha256').update('1234').digest('hex'),
        rol: 'POS_CAJERO' as const,
      };

      // Intentos concurrentes con PIN incorrecto
      const promises = [
        loginWithPIN('0000', 'Op1', terminalConfig),
        loginWithPIN('0000', 'Op2', terminalConfig),
        loginWithPIN('0000', 'Op3', terminalConfig),
      ];

      const results = await Promise.all(promises);

      // Todos deberían fallar
      results.forEach((result) => {
        expect(result.success).toBe(false);
      });

      // El dispositivo debe estar bloqueado
      const attempts = await checkPinAttempts();
      expect(attempts.isLocked).toBe(true);
    });
  });
});
