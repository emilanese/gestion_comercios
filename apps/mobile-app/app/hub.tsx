import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, SafeAreaView, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * HUB — Pantalla principal para ADMIN y ENCARGADO
 *
 * Accesos rápidos a los módulos de gestión:
 *  - Dashboard / métricas de sucursal
 *  - Gestión de stock y alertas
 *  - Ingreso de remitos
 *  - Historial de ventas
 *  - Auditoría de autorizaciones
 *  - Acceso rápido al POS (si es ADMIN o ENCARGADO)
 *
 * La información sensible (costos, márgenes, métricas globales)
 * se muestra SOLO si el rol es ADMIN.
 */

interface HubModule {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  color: string;
  route?: string;
  onlyAdmin?: boolean;
}

const HUB_MODULES: HubModule[] = [
  {
    id: 'pos',
    icon: '🏪',
    title: 'Ir al POS',
    subtitle: 'Abrir mostrador de cobros',
    color: '#1d4ed8',
  },
  {
    id: 'stock',
    icon: '📦',
    title: 'Stock y Alertas',
    subtitle: 'Ver nivel de inventario',
    color: '#059669',
  },
  {
    id: 'ventas',
    icon: '📊',
    title: 'Historial de Ventas',
    subtitle: 'Tickets y resumen del turno',
    color: '#7c3aed',
  },
  {
    id: 'remitos',
    icon: '📋',
    title: 'Ingresar Remito',
    subtitle: 'Registrar mercadería recibida',
    color: '#d97706',
  },
  {
    id: 'metricas',
    icon: '💰',
    title: 'Métricas y Costos',
    subtitle: 'Ganancias y márgenes globales',
    color: '#dc2626',
    onlyAdmin: true,
  },
  {
    id: 'auditoria',
    icon: '🔍',
    title: 'Auditoría',
    subtitle: 'Log de autorizaciones',
    color: '#475569',
  },
];

export default function Hub() {
  const router = useRouter();
  const [rol, setRol] = useState<string>('');
  const [comercioNombre, setComercioNombre] = useState<string>('');

  useEffect(() => {
    const loadSession = async () => {
      const storedRol  = await AsyncStorage.getItem('rol')  ?? '';
      const storedName = await AsyncStorage.getItem('nombre_empresa') ?? 'Tu Comercio';
      setRol(storedRol);
      setComercioNombre(storedName);
    };
    loadSession();
  }, []);

  const handleLogout = async () => {
    Alert.alert('Cerrar sesión', '¿Querés desloguearte?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Salir',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem('jwt');
          await AsyncStorage.removeItem('rol');
          router.replace('/login');
        },
      },
    ]);
  };

  const handleModulePress = (module: HubModule) => {
    if (module.id === 'pos') {
      router.push('/pos');
      return;
    }
    // Módulos en desarrollo
    Alert.alert(
      module.title,
      `${module.subtitle}\n\n(Módulo en desarrollo)`,
      [{ text: 'OK' }]
    );
  };

  const visibleModules = HUB_MODULES.filter(m => !m.onlyAdmin || rol === 'ADMIN');

  return (
    <SafeAreaView style={styles.container}>
      {/* ── Header ─── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.appName}>⚙️ AVANTI HUB</Text>
          <Text style={styles.comercioName}>{comercioNombre}</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={[styles.rolBadge, rol === 'ADMIN' ? styles.rolAdmin : styles.rolEncargado]}>
            <Text style={styles.rolText}>{rol}</Text>
          </View>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>↩</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Módulos ─── */}
      <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
        {visibleModules.map((module) => (
          <TouchableOpacity
            key={module.id}
            style={[styles.moduleCard, { borderLeftColor: module.color }]}
            onPress={() => handleModulePress(module)}
            activeOpacity={0.75}
          >
            <Text style={styles.moduleIcon}>{module.icon}</Text>
            <View style={styles.moduleText}>
              <Text style={styles.moduleTitle}>{module.title}</Text>
              <Text style={styles.moduleSubtitle}>{module.subtitle}</Text>
            </View>
          </TouchableOpacity>
        ))}

        <View style={styles.footer}>
          <Text style={styles.footerText}>AVANTI v1.0 • {rol}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#f1f5f9' },
  header:          { backgroundColor: '#1d4ed8', paddingHorizontal: 20, paddingVertical: 16,
                     flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  appName:         { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  comercioName:    { fontSize: 13, color: '#bfdbfe', marginTop: 2 },
  headerRight:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rolBadge:        { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  rolAdmin:        { backgroundColor: '#fbbf24' },
  rolEncargado:    { backgroundColor: '#34d399' },
  rolText:         { fontSize: 11, fontWeight: '700', color: '#1e293b' },
  logoutBtn:       { padding: 6 },
  logoutText:      { fontSize: 20, color: '#93c5fd' },
  grid:            { padding: 16, gap: 12, paddingBottom: 40 },
  moduleCard:      { backgroundColor: '#fff', borderRadius: 12, padding: 16,
                     flexDirection: 'row', alignItems: 'center', gap: 14,
                     borderLeftWidth: 4,
                     shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4,
                     elevation: 2 },
  moduleIcon:      { fontSize: 32 },
  moduleText:      { flex: 1 },
  moduleTitle:     { fontSize: 16, fontWeight: '700', color: '#1e293b' },
  moduleSubtitle:  { fontSize: 13, color: '#64748b', marginTop: 2 },
  footer:          { alignItems: 'center', marginTop: 8 },
  footerText:      { fontSize: 11, color: '#94a3b8' },
});
