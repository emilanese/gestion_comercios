/**
 * Pantalla de enrolamiento del dispositivo
 * Primera vez: el dispositivo se registra escaneando un QR o ingresando un código
 * Una vez enrolado, nunca vuelve a esta pantalla
 */
import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, SafeAreaView, ScrollView
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { t } from '@comercios/shared-logic';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080';

export default function EnrollScreen() {
  const router = useRouter();
  const [codigo, setCodigo]   = useState('');
  const [nombre, setNombre]   = useState('');
  const [loading, setLoading] = useState(false);
  const [modo, setModo]       = useState<'codigo'|'qr'>('codigo');

  const handleEnroll = async () => {
    if (!codigo.trim() || !nombre.trim()) {
      Alert.alert(t('common.required_fields'), t('enroll.required_fields_detail'));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/devices/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enrollment_code: codigo.trim().toUpperCase(),
          device_name:     nombre.trim(),
          device_type:     'MOBILE_POS',
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        Alert.alert(t('enroll.error_title'), data.error ?? t('enroll.error_invalid_code'));
        return;
      }

      await AsyncStorage.setItem('device_id',   data.device_id   ?? '');
      await AsyncStorage.setItem('sucursal_id', data.sucursal_id ?? '');
      await AsyncStorage.setItem('comercio_id', data.comercio_id ?? '');
      await AsyncStorage.setItem('device_name', nombre.trim());

      Alert.alert(
        t('enroll.success_title'),
        t('enroll.success_detail', { name: nombre.trim() }),
        [{ text: t('enroll.continue'), onPress: () => router.replace('/login') }]
      );
    } catch {
      Alert.alert(t('common.no_connection'), t('common.no_connection_detail'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.icon}><Text style={styles.iconEmoji}>📱</Text></View>

        <Text style={styles.title}>{t('enroll.title')}</Text>
        <Text style={styles.subtitle}>{t('enroll.subtitle')}</Text>

        <View style={styles.modos}>
          <TouchableOpacity
            style={[styles.modoBtn, modo === 'codigo' && styles.modoBtnActive]}
            onPress={() => setModo('codigo')}
          >
            <Text style={[styles.modoBtnText, modo === 'codigo' && styles.modoBtnTextActive]}>
              {t('enroll.mode_code')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modoBtn, modo === 'qr' && styles.modoBtnActive]}
            onPress={() => setModo('qr')}
          >
            <Text style={[styles.modoBtnText, modo === 'qr' && styles.modoBtnTextActive]}>
              {t('enroll.mode_qr')}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>{t('enroll.code_label')}</Text>
          <TextInput
            style={styles.input}
            value={codigo}
            onChangeText={setCodigo}
            placeholder={t('enroll.code_placeholder')}
            placeholderTextColor="#94a3b8"
            autoCapitalize="characters"
            autoCorrect={false}
          />

          <Text style={[styles.label, { marginTop: 16 }]}>{t('enroll.device_name_label')}</Text>
          <TextInput
            style={styles.input}
            value={nombre}
            onChangeText={setNombre}
            placeholder={t('enroll.device_name_placeholder')}
            placeholderTextColor="#94a3b8"
            autoCorrect={false}
          />
        </View>

        <TouchableOpacity
          style={[styles.btn, loading && styles.btnLoading]}
          onPress={handleEnroll}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>{t('enroll.submit')}</Text>
          }
        </TouchableOpacity>

        <Text style={styles.hint}>{t('enroll.hint')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:              { flex: 1, backgroundColor: '#f1f5f9' },
  scroll:            { padding: 24, alignItems: 'center' },
  icon:              { width: 80, height: 80, borderRadius: 24, backgroundColor: '#dbeafe', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  iconEmoji:         { fontSize: 40 },
  title:             { fontSize: 26, fontWeight: 'bold', color: '#1e293b', marginBottom: 8, textAlign: 'center' },
  subtitle:          { fontSize: 14, color: '#64748b', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  modos:             { flexDirection: 'row', gap: 10, marginBottom: 24 },
  modoBtn:           { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 2, borderColor: '#e2e8f0', backgroundColor: '#fff', alignItems: 'center' },
  modoBtnActive:     { borderColor: '#1d4ed8', backgroundColor: '#eff6ff' },
  modoBtnText:       { fontSize: 14, color: '#64748b', fontWeight: '500' },
  modoBtnTextActive: { color: '#1d4ed8' },
  form:              { width: '100%', marginBottom: 24 },
  label:             { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 6 },
  input:             { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#1e293b' },
  btn:               { width: '100%', backgroundColor: '#1d4ed8', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 20 },
  btnLoading:        { backgroundColor: '#93c5fd' },
  btnText:           { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  hint:              { fontSize: 12, color: '#94a3b8', textAlign: 'center', lineHeight: 18 },
});
