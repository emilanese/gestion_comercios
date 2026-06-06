/**
 * LoginScreen Component
 * UI para ingreso local con PIN y selección de operador
 * Diseño limpio, minimalista con autoFocus en PIN
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  loginWithPIN,
  checkPinAttempts,
  SessionConfig,
} from '../logic/authentication';

export interface LoginScreenProps {
  terminalConfig: {
    deviceId: string;
    commercioId: string;
    sucursalId: string;
    numeroTerminal: number;
    aliasNombre: string;
    pinAccesoHash: string;
    rol: 'ADMIN' | 'OPERADOR_STOCK' | 'POS_CAJERO' | 'GERENTE';
  };
  onLoginSuccess: (session: SessionConfig) => void;
  onLoginError?: (error: string) => void;
}

type LoginStep = 'select-operator' | 'enter-pin' | 'processing' | 'error' | 'locked';

export const LoginScreen: React.FC<LoginScreenProps> = ({
  terminalConfig,
  onLoginSuccess,
  onLoginError,
}) => {
  const [step, setStep] = useState<LoginStep>('select-operator');
  const [selectedOperator, setSelectedOperator] = useState('');
  const [pin, setPin] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [attemptDetails, setAttemptDetails] = useState<{
    attemptsRemaining: number;
    isLocked: boolean;
    lockedUntil?: number;
  } | null>(null);

  const pinInputRef = useRef<HTMLInputElement>(null);

  // Verificar bloqueo al cargar
  useEffect(() => {
    const checkLock = async () => {
      const attempts = await checkPinAttempts();
      if (attempts.isLocked) {
        setStep('locked');
        setAttemptDetails(attempts);
      }
    };
    checkLock();
  }, []);

  // Enfocar PIN cuando se selecciona operador
  useEffect(() => {
    if (step === 'enter-pin' && pinInputRef.current) {
      pinInputRef.current.focus();
    }
  }, [step]);

  const handleSelectOperator = () => {
    if (!selectedOperator.trim()) {
      setErrorMessage('Por favor ingresa un nombre de operador');
      return;
    }
    setErrorMessage('');
    setPin('');
    setStep('enter-pin');
  };

  const handlePINSubmit = async () => {
    if (pin.length < 4) {
      setErrorMessage('PIN debe tener al menos 4 dígitos');
      return;
    }

    setStep('processing');
    setErrorMessage('');

    try {
      const result = await loginWithPIN(pin, selectedOperator, terminalConfig);

      if (result.success && result.session) {
        onLoginSuccess(result.session);
      } else {
        setStep('enter-pin');
        setErrorMessage(result.error || 'Error en el login');
        setPin('');

        // Verificar si está bloqueado ahora
        const attempts = await checkPinAttempts();
        if (attempts.isLocked) {
          setStep('locked');
          setAttemptDetails(attempts);
        }

        onLoginError?.(result.error || 'Unknown error');
      }
    } catch (error) {
      setStep('enter-pin');
      const msg = error instanceof Error ? error.message : 'Error desconocido';
      setErrorMessage(msg);
      setPin('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (step === 'select-operator') {
        handleSelectOperator();
      } else if (step === 'enter-pin') {
        handlePINSubmit();
      }
    }
    if (e.key === 'Backspace' && step === 'enter-pin') {
      setPin(pin.slice(0, -1));
    }
  };

  const handlePINKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Solo permitir dígitos
    if (!/[0-9]/.test(e.key) && !['Backspace', 'Enter', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
    }
  };

  // Estilos comunes
  const containerStyle: React.CSSProperties = {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'center',
    alignItems: 'center',
    background: 'linear-gradient(135deg, #f9fafb 0%, #ffffff 100%)',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    padding: '20px',
  };

  const cardStyle: React.CSSProperties = {
    background: '#ffffff',
    borderRadius: '12px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.07)',
    padding: '40px',
    maxWidth: '400px',
    width: '100%',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: '24px',
    fontWeight: 700,
    marginBottom: '8px',
    color: '#000',
  };

  const subtitleStyle: React.CSSProperties = {
    fontSize: '14px',
    color: '#666',
    marginBottom: '30px',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '16px',
    fontFamily: 'inherit',
    boxSizing: 'border-box' as const,
    transition: 'border-color 200ms, box-shadow 200ms',
    marginBottom: '16px',
  };

  const buttonStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 16px',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background-color 200ms, transform 100ms',
    backgroundColor: '#2563eb',
    color: '#fff',
  };

  const pinDisplayStyle: React.CSSProperties = {
    fontSize: '48px',
    fontWeight: 700,
    textAlign: 'center' as const,
    letterSpacing: '12px',
    color: '#2563eb',
    marginBottom: '20px',
    fontFamily: 'monospace',
    minHeight: '60px',
  };

  const errorStyle: React.CSSProperties = {
    background: '#fee2e2',
    color: '#991b1b',
    padding: '12px 14px',
    borderRadius: '8px',
    fontSize: '14px',
    marginBottom: '16px',
    border: '1px solid #fecaca',
  };

  // PASO 1: Seleccionar Operador
  if (step === 'select-operator') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>Acceso POS</h1>
          <p style={subtitleStyle}>Terminal: {terminalConfig.aliasNombre}</p>

          {errorMessage && <div style={errorStyle}>{errorMessage}</div>}

          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: '#374151' }}>
            ¿Quién está en caja?
          </label>
          <input
            type="text"
            placeholder="Ingresa tu nombre"
            value={selectedOperator}
            onChange={(e) => {
              setSelectedOperator(e.target.value);
              setErrorMessage('');
            }}
            onKeyDown={handleKeyDown}
            autoFocus
            style={inputStyle}
          />

          <button
            onClick={handleSelectOperator}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1d4ed8')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#2563eb')}
            style={buttonStyle}
          >
            Continuar
          </button>

          <p style={{ fontSize: '12px', color: '#999', textAlign: 'center', marginTop: '16px' }}>
            Presiona Enter para continuar
          </p>
        </div>
      </div>
    );
  }

  // PASO 2: Ingresar PIN
  if (step === 'enter-pin') {
    const displayPin = '●'.repeat(pin.length);

    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>Ingresa tu PIN</h1>
          <p style={subtitleStyle}>Operador: {selectedOperator}</p>

          {errorMessage && <div style={errorStyle}>{errorMessage}</div>}

          <div style={pinDisplayStyle}>{displayPin || '____'}</div>

          <input
            ref={pinInputRef}
            type="password"
            inputMode="numeric"
            placeholder="0000"
            value={pin}
            onChange={(e) => setPin(e.target.value.slice(0, 6))}
            onKeyDown={(e) => {
              handlePINKeyPress(e);
              if (e.key === 'Enter') handlePINSubmit();
            }}
            style={{
              ...inputStyle,
              textAlign: 'center' as const,
              fontSize: '24px',
              letterSpacing: '8px',
              fontWeight: 700,
            }}
          />

          <button
            onClick={handlePINSubmit}
            disabled={pin.length < 4}
            onMouseEnter={(e) => {
              if (!e.currentTarget.disabled) {
                e.currentTarget.style.backgroundColor = '#1d4ed8';
              }
            }}
            onMouseLeave={(e) => {
              if (!e.currentTarget.disabled) {
                e.currentTarget.style.backgroundColor = '#2563eb';
              }
            }}
            style={{
              ...buttonStyle,
              opacity: pin.length < 4 ? 0.5 : 1,
              cursor: pin.length < 4 ? 'not-allowed' : 'pointer',
            }}
          >
            Acceder
          </button>

          <button
            onClick={() => {
              setStep('select-operator');
              setSelectedOperator('');
              setPin('');
              setErrorMessage('');
            }}
            style={{
              ...buttonStyle,
              backgroundColor: '#f3f4f6',
              color: '#374151',
              marginTop: '8px',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#e5e7eb')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#f3f4f6')}
          >
            Cambiar Operador
          </button>

          <p style={{ fontSize: '12px', color: '#999', textAlign: 'center', marginTop: '16px' }}>
            PIN mínimo 4 dígitos • Presiona Enter para acceder
          </p>
        </div>
      </div>
    );
  }

  // PASO 3: Procesando
  if (step === 'processing') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '20px', animation: 'spin 1s linear infinite' }}>
              ⏳
            </div>
            <p style={{ fontSize: '16px', color: '#374151', marginBottom: '10px' }}>Validando acceso...</p>
            <p style={{ fontSize: '12px', color: '#999' }}>Por favor espera</p>
          </div>
        </div>
        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // PASO 4: Bloqueado
  if (step === 'locked') {
    const minutosRestantes =
      attemptDetails?.lockedUntil ? Math.ceil((attemptDetails.lockedUntil - Date.now()) / 1000 / 60) : 15;

    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px', color: '#dc2626' }}>🔒</div>
            <h2 style={{ ...titleStyle, color: '#dc2626' }}>Dispositivo Bloqueado</h2>
            <p style={subtitleStyle}>
              Se han realizado demasiados intentos fallidos. El dispositivo está bloqueado por seguridad.
            </p>
            <div
              style={{
                ...errorStyle,
                marginBottom: '24px',
              }}
            >
              Intenta de nuevo en {minutosRestantes} minuto{minutosRestantes !== 1 ? 's' : ''}
            </div>

            <button
              onClick={() => window.location.reload()}
              style={{
                ...buttonStyle,
                backgroundColor: '#10b981',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#059669')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#10b981')}
            >
              Reintentar
            </button>

            <p style={{ fontSize: '12px', color: '#999', textAlign: 'center', marginTop: '16px' }}>
              Contacta con el administrador si el problema persiste
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
