// @ts-nocheck — uses WatermelonDB + platform-specific APIs, excluded from web-app type checking
/**
 * EnrollmentForm Component
 * Handles QR scanning, server enrollment, and local database sync
 */

import React, { useState } from 'react';
import { Database } from '@nozbe/watermelondb';
import { QRScanner } from './QRScanner';
import {
  enrollDevice,
  EnrollRequest,
  isDeviceEnrolled,
  loadTerminalConfig,
  TerminalConfig,
} from '../logic/enrollment';
import { getDeviceId } from '../utils/device';

export interface EnrollmentFormProps {
  serverUrl: string;
  database: Database;
  onEnrollmentComplete: (config: TerminalConfig) => void;
  onError?: (error: string) => void;
}

type EnrollmentStep = 'scan' | 'manual-entry' | 'processing' | 'success' | 'error';

export const EnrollmentForm: React.FC<EnrollmentFormProps> = ({
  serverUrl,
  database,
  onEnrollmentComplete,
  onError,
}) => {
  const [step, setStep] = useState<EnrollmentStep>('scan');
  const [manualToken, setManualToken] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  // Verificar si ya está enrollado
  React.useEffect(() => {
    const checkEnrollment = async () => {
      if (await isDeviceEnrolled()) {
        const config = await loadTerminalConfig();
        if (config) {
          onEnrollmentComplete(config);
        }
      }
    };
    checkEnrollment();
  }, [onEnrollmentComplete]);

  const handleQRScanned = async (qrData: string) => {
    await performEnrollment(qrData);
  };

  const handleManualSubmit = async () => {
    if (!manualToken.trim()) {
      setErrorMessage('Por favor ingresa el token');
      return;
    }
    await performEnrollment(manualToken.trim());
  };

  const performEnrollment = async (token: string) => {
    try {
      setStep('processing');
      setErrorMessage('');
      setStatusMessage('Iniciando enrolamiento...');

      // Obtener ID del dispositivo
      const idHardware = await getDeviceId();

      // Preparar solicitud
      const enrollRequest: EnrollRequest = {
        tokenEnrolamiento: token,
        idHardware,
        plataforma: typeof window !== 'undefined' ? 'web' : 'mobile',
      };

      // Enviar enrolamiento
      const result = await enrollDevice(serverUrl, enrollRequest, database, setStatusMessage);

      if (result.success && result.config) {
        setStep('success');
        setStatusMessage('✅ Enrolamiento completado exitosamente');
        setTimeout(() => {
          onEnrollmentComplete(result.config);
        }, 1500);
      } else {
        setStep('error');
        setErrorMessage(result.error || 'Error en el enrolamiento');
        onError?.(result.error || 'Unknown error');
      }
    } catch (error) {
      setStep('error');
      const msg = error instanceof Error ? error.message : 'Error desconocido';
      setErrorMessage(msg);
      onError?.(msg);
    }
  };

  return (
    <div
      style={{
        maxWidth: '600px',
        margin: '0 auto',
        padding: '20px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: '30px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '28px', marginBottom: '8px' }}>Enrolamiento de Dispositivo</h1>
        <p style={{ fontSize: '14px', color: '#666' }}>
          Configura este dispositivo para comenzar a usar la app
        </p>
      </div>

      {/* Paso 1: Escanear QR */}
      {step === 'scan' && (
        <div>
          <QRScanner
            onQRScanned={handleQRScanned}
            onError={(err) => {
              setErrorMessage(err);
              setStep('error');
            }}
            title="Escanear Código QR"
            subtitle="Apunta la cámara al código QR de invitación"
            isLoading={false}
          />

          <div style={{ marginTop: '20px', textAlign: 'center' }}>
            <p style={{ fontSize: '14px', color: '#666' }}>¿No tienes QR?</p>
            <button
              onClick={() => setStep('manual-entry')}
              style={{
                padding: '10px 20px',
                marginTop: '10px',
                backgroundColor: '#f0f0f0',
                border: '1px solid #ccc',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              Ingresa el token manualmente
            </button>
          </div>
        </div>
      )}

      {/* Paso 2: Entrada Manual */}
      {step === 'manual-entry' && (
        <div>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              Token de Invitación:
            </label>
            <input
              type="text"
              value={manualToken}
              onChange={(e) => setManualToken(e.target.value)}
              placeholder="Pega el token aquí"
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <button
            onClick={handleManualSubmit}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: '#007AFF',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            Continuar
          </button>

          <button
            onClick={() => setStep('scan')}
            style={{
              width: '100%',
              padding: '12px',
              marginTop: '10px',
              backgroundColor: '#f0f0f0',
              border: '1px solid #ccc',
              borderRadius: '4px',
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            Volver al QR
          </button>
        </div>
      )}

      {/* Paso 3: Procesando */}
      {step === 'processing' && (
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div
            style={{
              fontSize: '48px',
              marginBottom: '20px',
              animation: 'spin 1s linear infinite',
            }}
          >
            ⏳
          </div>
          <p style={{ fontSize: '16px', marginBottom: '10px' }}>{statusMessage}</p>
          <p style={{ fontSize: '12px', color: '#999' }}>
            Por favor espera, esto puede tomar unos segundos...
          </p>
        </div>
      )}

      {/* Paso 4: Éxito */}
      {step === 'success' && (
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>✅</div>
          <h2 style={{ fontSize: '20px', marginBottom: '10px', color: '#008000' }}>
            ¡Enrolamiento Exitoso!
          </h2>
          <p style={{ fontSize: '14px', color: '#666' }}>
            El dispositivo está listo para usar la aplicación.
          </p>
        </div>
      )}

      {/* Paso 5: Error */}
      {step === 'error' && (
        <div style={{ backgroundColor: '#fee', padding: '20px', borderRadius: '4px' }}>
          <h3 style={{ color: '#c00', marginBottom: '10px' }}>Error</h3>
          <p style={{ color: '#800', marginBottom: '20px' }}>{errorMessage}</p>

          <button
            onClick={() => setStep('scan')}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: '#007AFF',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            Intentar de Nuevo
          </button>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
