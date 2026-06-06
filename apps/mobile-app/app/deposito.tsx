import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, FlatList, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { t } from '@comercios/shared-logic';

/**
 * DEPOSITO — Pantalla exclusiva para el rol DEPOSITO (Operario logístico)
 * Todos los textos visibles se leen desde los diccionarios de i18n.
 *
 * Lo que NUNCA MUESTRA: precios, costos, márgenes, historial de ventas.
 */

interface RemitoItem {
  id:       string;
  ean:      string;
  nombre:   string;
  cantidad: number;
  tipo:     'INGRESO' | 'EGRESO';
}

export default function Deposito() {
  const router = useRouter();
  const [ean, setEan]           = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [items, setItems]       = useState<RemitoItem[]>([]);
  const [modo, setModo]         = useState<'INGRESO' | 'EGRESO'>('INGRESO');

  const handleLogout = () => {
    Alert.alert(t('auth.logout'), t('auth.logout_confirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.exit'),
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem('jwt');
          await AsyncStorage.removeItem('rol');
          router.replace('/login');
        },
      },
    ]);
  };

  const handleAgregarItem = () => {
    const cantNum = parseInt(cantidad, 10);
    if (!ean.trim()) {
      Alert.alert(t('common.error'), t('deposito.error_ean'));
      return;
    }
    if (isNaN(cantNum) || cantNum <= 0) {
      Alert.alert(t('common.error'), t('deposito.error_qty'));
      return;
    }

    // TODO: buscar nombre del producto por EAN en la DB local (WatermelonDB)
    const nuevoItem: RemitoItem = {
      id:       Date.now().toString(),
      ean:      ean.trim(),
      nombre:   `Producto ${ean.trim()}`,
      cantidad: cantNum,
      tipo:     modo,
    };

    setItems(prev => [nuevoItem, ...prev]);
    setEan('');
    setCantidad('1');
  };

  const handleConfirmarRemito = () => {
    if (items.length === 0) {
      Alert.alert(t('deposito.error_no_items'), t('deposito.error_no_items_detail'));
      return;
    }
    const msg = modo === 'INGRESO'
      ? t('deposito.confirm_receipt_message',  { count: items.length })
      : t('deposito.confirm_disposal_message', { count: items.length });

    Alert.alert(t('deposito.confirm_title'), msg, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.confirm'),
        onPress: () => {
          // TODO: guardar en WatermelonDB + enviar por WS al Backoffice
          Alert.alert(t('deposito.success_title'), t('deposito.success_detail'));
          setItems([]);
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* ── Header ─── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.appName}>{t('deposito.title')}</Text>
          <Text style={styles.subtitle}>{t('deposito.subtitle')}</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>↩</Text>
        </TouchableOpacity>
      </View>

      {/* ── Selector de modo ─── */}
      <View style={styles.modoSelector}>
        <TouchableOpacity
          style={[styles.modoBtn, modo === 'INGRESO' && styles.modoBtnActive]}
          onPress={() => setModo('INGRESO')}
        >
          <Text style={[styles.modoBtnText, modo === 'INGRESO' && styles.modoBtnTextActive]}>
            {t('deposito.mode_receipt')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modoBtn, modo === 'EGRESO' && styles.modoBtnActiveRed]}
          onPress={() => setModo('EGRESO')}
        >
          <Text style={[styles.modoBtnText, modo === 'EGRESO' && styles.modoBtnTextActive]}>
            {t('deposito.mode_disposal')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Ingreso de datos ─── */}
      <View style={styles.inputSection}>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, styles.inputEan]}
            placeholder={t('deposito.ean_placeholder')}
            placeholderTextColor="#94a3b8"
            value={ean}
            onChangeText={setEan}
            keyboardType="numeric"
            returnKeyType="next"
            autoFocus
          />
          <TextInput
            style={[styles.input, styles.inputCantidad]}
            placeholder={t('deposito.qty_placeholder')}
            placeholderTextColor="#94a3b8"
            value={cantidad}
            onChangeText={setCantidad}
            keyboardType="numeric"
            returnKeyType="done"
            onSubmitEditing={handleAgregarItem}
          />
        </View>
        <TouchableOpacity style={styles.agregarBtn} onPress={handleAgregarItem}>
          <Text style={styles.agregarBtnText}>{t('deposito.add_item')}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Lista de items ─── */}
      <FlatList
        data={items}
        keyExtractor={item => item.id}
        style={styles.lista}
        renderItem={({ item }) => (
          <View style={[styles.itemRow, item.tipo === 'EGRESO' && styles.itemRowEgreso]}>
            <View style={styles.itemInfo}>
              <Text style={styles.itemNombre}>{item.nombre}</Text>
              <Text style={styles.itemEan}>EAN: {item.ean}</Text>
            </View>
            <Text style={[styles.itemCantidad, item.tipo === 'EGRESO' && styles.itemCantidadEgreso]}>
              {item.tipo === 'EGRESO' ? '-' : '+'}{item.cantidad}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t('deposito.empty_items')}</Text>
          </View>
        }
      />

      {/* ── Confirmar ─── */}
      {items.length > 0 && (
        <View style={styles.footer}>
          <Text style={styles.footerCount}>
            {t('deposito.receipt_count', { count: items.length })}
          </Text>
          <TouchableOpacity style={styles.confirmarBtn} onPress={handleConfirmarRemito}>
            <Text style={styles.confirmarBtnText}>{t('deposito.confirm_receipt')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#f8fafc' },
  header:             { backgroundColor: '#0f172a', paddingHorizontal: 20, paddingVertical: 14,
                        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  appName:            { fontSize: 17, fontWeight: 'bold', color: '#fff' },
  subtitle:           { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  logoutBtn:          { padding: 6 },
  logoutText:         { fontSize: 20, color: '#94a3b8' },
  modoSelector:       { flexDirection: 'row', margin: 12, borderRadius: 10,
                        backgroundColor: '#e2e8f0', padding: 4 },
  modoBtn:            { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  modoBtnActive:      { backgroundColor: '#22c55e' },
  modoBtnActiveRed:   { backgroundColor: '#ef4444' },
  modoBtnText:        { fontWeight: '600', color: '#64748b' },
  modoBtnTextActive:  { color: '#fff' },
  inputSection:       { paddingHorizontal: 12, marginBottom: 8 },
  inputRow:           { flexDirection: 'row', gap: 8, marginBottom: 8 },
  input:              { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1',
                        borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
                        fontSize: 15, color: '#1e293b' },
  inputEan:           { flex: 1 },
  inputCantidad:      { width: 80 },
  agregarBtn:         { backgroundColor: '#1d4ed8', borderRadius: 10, paddingVertical: 12,
                        alignItems: 'center' },
  agregarBtnText:     { color: '#fff', fontWeight: '700', fontSize: 15 },
  lista:              { flex: 1, paddingHorizontal: 12 },
  itemRow:            { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8,
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                        borderLeftWidth: 4, borderLeftColor: '#22c55e' },
  itemRowEgreso:      { borderLeftColor: '#ef4444' },
  itemInfo:           { flex: 1 },
  itemNombre:         { fontSize: 15, fontWeight: '600', color: '#1e293b' },
  itemEan:            { fontSize: 12, color: '#64748b', marginTop: 2 },
  itemCantidad:       { fontSize: 22, fontWeight: '800', color: '#22c55e' },
  itemCantidadEgreso: { color: '#ef4444' },
  emptyContainer:     { flex: 1, alignItems: 'center', marginTop: 60 },
  emptyText:          { fontSize: 15, color: '#94a3b8', textAlign: 'center' },
  footer:             { padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  footerCount:        { fontSize: 13, color: '#64748b', marginBottom: 8, textAlign: 'center' },
  confirmarBtn:       { backgroundColor: '#059669', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  confirmarBtnText:   { color: '#fff', fontWeight: '700', fontSize: 16 },
});
