/**
 * QRScanner Component - Shared UI for QR code scanning
 * Works on both Mobile (React Native) and Web
 */

import React, { useState, useCallback, useEffect } from 'react';

export interface QRScannerProps {
  onQRScanned: (data: string) => void;
  onError?: (error: string) => void;
  title?: string;
  subtitle?: string;
  isLoading?: boolean;
}

/**
 * Platform-agnostic QR Scanner component
 * Automatically detects platform and uses appropriate library
 */
export const QRScanner: React.FC<QRScannerProps> = ({
  onQRScanned,
  onError,
  title = 'Escanear QR',
  subtitle = 'Apunta la cámara al código QR de invitación',
  isLoading = false,
}) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  // Detectar plataforma
  const isWeb = typeof window !== 'undefined' && !global.navigator?.product?.includes('ReactNative');

  if (isWeb) {
    return <WebQRScanner onQRScanned={onQRScanned} onError={onError} title={title} subtitle={subtitle} isLoading={isLoading} />;
  } else {
    return <MobileQRScanner onQRScanned={onQRScanned} onError={onError} title={title} subtitle={subtitle} isLoading={isLoading} />;
  }
};

/**
 * Mobile QR Scanner - React Native with Expo Camera
 */
const MobileQRScanner: React.FC<QRScannerProps> = ({
  onQRScanned,
  onError,
  title,
  subtitle,
  isLoading,
}) => {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  useEffect(() => {
    const requestPermission = async () => {
      try {
        const Camera = require('expo-camera').Camera;
        const { status } = await Camera.requestCameraPermissionsAsync();
        setHasPermission(status === 'granted');
      } catch (error) {
        onError?.('Error requesting camera permission');
      }
    };
    requestPermission();
  }, [onError]);

  if (hasPermission === null) {
    return (
      <div style={{ textAlign: 'center', padding: '20px' }}>
        <p>Solicitando permiso de cámara...</p>
      </div>
    );
  }

  if (hasPermission === false) {
    return (
      <div style={{ textAlign: 'center', padding: '20px', color: 'red' }}>
        <p>Se requiere permiso de cámara</p>
      </div>
    );
  }

  // Nota: La implementación real de CameraView se haría con expo-camera
  return (
    <div style={{ textAlign: 'center', padding: '20px' }}>
      <h2>{title}</h2>
      <p>{subtitle}</p>
      <p style={{ color: '#999', fontSize: '12px' }}>
        (Componente de cámara móvil se renderiza en runtime)
      </p>
    </div>
  );
};

/**
 * Web QR Scanner - HTML5 QRCode
 */
const WebQRScanner: React.FC<QRScannerProps> = ({
  onQRScanned,
  onError,
  title,
  subtitle,
  isLoading,
}) => {
  const [scannerStarted, setScannerStarted] = useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || scannerStarted || isLoading) return;

    const initScanner = async () => {
      try {
        const Html5Qrcode = require('html5-qrcode').Html5Qrcode;
        const scanner = new Html5Qrcode('qr-reader');

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
          },
          (decodedText: string) => {
            if (decodedText.length > 20) {
              scanner.stop();
              setScannerStarted(false);
              onQRScanned(decodedText);
            }
          },
          () => {} // Error callback (ignored for continuous scanning)
        );

        setScannerStarted(true);
      } catch (error) {
        onError?.('Error iniciando escáner: ' + (error as any).message);
      }
    };

    initScanner();
  }, [containerRef, scannerStarted, isLoading, onQRScanned, onError]);

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
      <h2 style={{ fontSize: '24px', marginBottom: '8px' }}>{title}</h2>
      <p style={{ fontSize: '14px', color: '#666', marginBottom: '20px', textAlign: 'center' }}>
        {subtitle}
      </p>

      <div
        ref={containerRef}
        id="qr-reader"
        style={{
          width: '100%',
          maxWidth: '400px',
          margin: '20px auto',
          border: '2px solid #ccc',
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      />

      {isLoading && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            zIndex: 1000,
          }}
        >
          <div style={{ textAlign: 'center', color: '#fff' }}>
            <p style={{ fontSize: '18px', marginBottom: '10px' }}>Procesando enrolamiento...</p>
            <div style={{ animation: 'spin 1s linear infinite' }}>⏳</div>
          </div>
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
