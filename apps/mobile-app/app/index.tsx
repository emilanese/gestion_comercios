import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Decodificación de JWT (solo payload, sin verificar firma) ────────────────
// La verificación real ocurre en el backend. Acá solo leemos el rol para rutear.
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    // base64url → base64 → JSON
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ─── Routing por rol ──────────────────────────────────────────────────────────
//
//  CAJERO              → /pos      (POS de mostrador, ultra-light)
//  ADMIN | ENCARGADO   → /hub      (Dashboard de gestión)
//  DEPOSITO            → /deposito (Pantalla logística pura)
//  Sin JWT             → /login
//  Sin deviceID        → /enroll

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    const checkAndRoute = async () => {
      const deviceID = await AsyncStorage.getItem('device_id');
      const jwt      = await AsyncStorage.getItem('jwt');

      if (!deviceID) {
        router.replace('/enroll');
        return;
      }

      if (!jwt) {
        router.replace('/login');
        return;
      }

      // Decodificar el rol del JWT para rutear al módulo correcto
      const payload = decodeJwtPayload(jwt);
      const rol = (payload?.rol as string) ?? '';

      switch (rol) {
        case 'CAJERO':
          router.replace('/pos');
          break;
        case 'ADMIN':
        case 'ENCARGADO':
          router.replace('/hub');
          break;
        case 'DEPOSITO':
          router.replace('/deposito');
          break;
        default:
          // Rol desconocido o token expirado → volver a login
          await AsyncStorage.removeItem('jwt');
          router.replace('/login');
      }
    };

    checkAndRoute();
  }, [router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#1d4ed8" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f1f5f9' },
});
