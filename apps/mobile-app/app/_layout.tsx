import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { DatabaseProvider } from '../src/database/DatabaseProvider';

/**
 * RootLayout — Layout raíz de la aplicación AVANTI
 *
 * El router de Expo gestiona 5 pantallas principales según el rol del dispositivo:
 *
 *  /enroll    → Enrolamiento por QR (primera vez)
 *  /login     → Ingreso de PIN / credenciales
 *  /pos       → AVANTI POS  — ROL: CAJERO | ADMIN | ENCARGADO
 *  /hub       → AVANTI HUB  — ROL: ADMIN | ENCARGADO
 *  /deposito  → AVANTI Dep. — ROL: DEPOSITO
 *
 * El árbol de pantallas no utilizado por el rol activo se destruye de la
 * memoria activa de React para optimizar RAM en dispositivos de gama baja.
 * (Ver la lógica de routing en /app/index.tsx)
 */
export default function RootLayout() {
  return (
    <DatabaseProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#1d4ed8' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="index"    options={{ headerShown: false }} />
        <Stack.Screen name="enroll"   options={{ title: 'Enrolar Dispositivo', headerShown: false }} />
        <Stack.Screen name="login"    options={{ title: 'AVANTI', headerShown: false }} />

        {/* ── AVANTI POS ─── ROL: CAJERO | ADMIN | ENCARGADO ────────────── */}
        <Stack.Screen name="pos"      options={{ title: '🏪 AVANTI POS', headerShown: false }} />

        {/* ── AVANTI HUB ─── ROL: ADMIN | ENCARGADO ─────────────────────── */}
        <Stack.Screen name="hub"      options={{ title: '⚙️ AVANTI HUB', headerShown: false }} />

        {/* ── AVANTI DEPÓSITO ─── ROL: DEPOSITO ─────────────────────────── */}
        <Stack.Screen name="deposito" options={{ title: '📦 AVANTI Depósito', headerShown: false }} />
      </Stack>
    </DatabaseProvider>
  );
}
