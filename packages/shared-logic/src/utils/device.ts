/**
 * Device utilities - Platform-agnostic device identification
 */

import { v4 as uuidv4 } from 'uuid';

const DEVICE_ID_STORAGE_KEY = 'device_id_mi_comercio';

/**
 * Obtener o generar ID único del dispositivo
 * En Mobile: usa ID hardware de Expo
 * En Web: genera y persiste UUID en localStorage
 */
export async function getDeviceId(): Promise<string> {
  try {
    // React Native (Expo)
    if (typeof global.navigator?.product?.includes === 'function') {
      try {
        const Constants = require('expo-constants').default;
        if (Constants.sessionId) {
          return Constants.sessionId;
        }
      } catch (e) {
        // Continue to fallback
      }
    }

    // Web - usar localStorage
    if (typeof localStorage !== 'undefined') {
      let deviceId = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
      if (!deviceId) {
        deviceId = `web_${uuidv4()}`;
        localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
      }
      return deviceId;
    }

    // Fallback - generar UUID
    return `device_${uuidv4()}`;
  } catch (error) {
    console.error('Error getting device ID:', error);
    return `device_${uuidv4()}`;
  }
}

/**
 * Obtener información de la plataforma
 */
export function getPlatformInfo(): {
  platform: 'ios' | 'android' | 'web';
  userAgent?: string;
  appVersion?: string;
} {
  try {
    // React Native
    if (typeof global.navigator?.platform === 'string') {
      const platform = global.navigator.platform.toLowerCase();
      if (platform.includes('iphone') || platform.includes('ipad')) {
        return { platform: 'ios' };
      }
      if (platform.includes('android')) {
        return { platform: 'android' };
      }
    }

    // Web
    if (typeof window !== 'undefined') {
      return {
        platform: 'web',
        userAgent: navigator.userAgent,
      };
    }
  } catch (error) {
    console.error('Error getting platform info:', error);
  }

  return { platform: 'web' };
}

/**
 * Generar una firma básica para validación (no criptográfica, solo para debugging)
 */
export function generateDeviceSignature(deviceId: string): string {
  const timestamp = Date.now();
  const signature = `${deviceId}:${timestamp}`;
  return Buffer.from(signature).toString('base64');
}
