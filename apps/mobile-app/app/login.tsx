/**
 * Pantalla de login por PIN para cajeros
 * El cajero ingresa su PIN de 4-6 dígitos para abrir turno
 */
import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, SafeAreaView
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { t } from '@comercios/shared-logic';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080';

const KEYS = ['1','2','3','4','5','6','7','8','9','⌫','0','OK'];

export default function LoginScreen() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const handleKey = (key: string) => {
    if (key === '⌫') {
      setPin(p => p.slice(0, -1));
    } else if (key === 'OK') {
      handleSubmit();
    } else if (pin.length < 6) {
      setPin(p => p + key);
    }
  };

  const handleSubmit = async () => {
    if (pin.length < 4) {
      Alert.alert(t('auth.pin_invalid'), t('auth.pin_min_length'));
      return;
    }
    setLoading(true);
    try {
      const deviceID = await AsyncStorage.getItem('device_id') ?? '';
      const res = await fetch(`${API_URL}/auth/validate-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceID, pin }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setPin('');
        Alert.alert(t('common.error'), data.error ?? t('auth.pin_incorrect'));
        return;
      }

      await AsyncStorage.setItem('jwt',         data.token             ?? '');
      await AsyncStorage.setItem('sucursal_id', data.sucursal_id       ?? '');
      await AsyncStorage.setItem('operador',    data.operador_nombre   ?? '');
      router.replace('/pos');
    } catch {
      Alert.alert(t('common.no_connection'), t('common.no_connection_detail'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('pos.title')} {t('auth.start_turn')}</Text>
        <Text style={styles.subtitle}>{t('auth.enter_pin')}</Text>
      </View>

      {/* Indicadores de dígitos */}
      <View style={styles.dots}>
        {Array.from({ length: 6 }).map((_, i) => (
          <View key={i} style={[styles.dot, i < pin.length && styles.dotFilled]} />
        ))}
      </View>

      {/* Teclado numérico */}
      <View style={styles.keypad}>
        {KEYS.map((k) => (
          <TouchableOpacity
            key={k}
            style={[styles.key, k === 'OK' && styles.keyOK, k === '⌫' && styles.keyDel]}
            onPress={() => handleKey(k)}
            disabled={loading}
            activeOpacity={0.7}
          >
            <Text style={[styles.keyText, k === 'OK' && styles.keyOKText]}>{k}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:           { flex: 1, backgroundColor: '#1d4ed8', alignItems: 'center', justifyContent: 'center' },
  header:         { marginBottom: 32, alignItems: 'center' },
  title:          { fontSize: 28, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
  subtitle:       { fontSize: 16, color: '#bfdbfe' },
  dots:           { flexDirection: 'row', gap: 12, marginBottom: 40 },
  dot:            { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#93c5fd', backgroundColor: 'transparent' },
  dotFilled:      { backgroundColor: '#fff', borderColor: '#fff' },
  keypad:         { flexDirection: 'row', flexWrap: 'wrap', width: 288, gap: 12 },
  key:            { width: 84, height: 72, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  keyOK:          { backgroundColor: '#16a34a' },
  keyDel:         { backgroundColor: 'rgba(255,255,255,0.08)' },
  keyText:        { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  keyOKText:      { fontSize: 18 },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
});
