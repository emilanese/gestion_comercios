/**
 * POS Screen — Pantalla de punto de venta para el cajero
 * Permite buscar productos por nombre o escanear EAN con la cámara
 */
import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, SafeAreaView, Alert, ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080';

interface Producto {
  productoID: string;
  nombre: string;
  marca: string;
  ean: string;
  precioVenta: number;
  precioOferta?: number;
  stock: number;
  promocion?: { nombre: string } | null;
}

interface CartItem {
  producto: Producto;
  cantidad: number;
  subtotal: number;
}

type Paso = 'venta' | 'pago' | 'confirmado';

const MEDIOS = ['Efectivo','Débito','Crédito','QR','Transferencia'];

export default function POSScreen() {
  const router = useRouter();
  const [query, setQuery]       = useState('');
  const [productos, setProductos] = useState<Producto[]>([]);
  const [buscando, setBuscando]  = useState(false);
  const [carrito, setCarrito]    = useState<CartItem[]>([]);
  const [paso, setPaso]          = useState<Paso>('venta');
  const [medioPago, setMedioPago] = useState('Efectivo');
  const [montoEntregado, setMontoEntregado] = useState('');
  const [ticketID, setTicketID]  = useState('');
  const [jwt, setJwt]            = useState('');
  const [sucursalID, setSucursalID] = useState('');

  useEffect(() => {
    const load = async () => {
      const j = await AsyncStorage.getItem('jwt') ?? '';
      const s = await AsyncStorage.getItem('sucursal_id') ?? '';
      setJwt(j);
      setSucursalID(s);
      if (!j) router.replace('/login');
    };
    load();
  }, [router]);

  const buscar = useCallback(async (q: string) => {
    if (q.length < 2) { setProductos([]); return; }
    setBuscando(true);
    try {
      const res = await fetch(
        `${API_URL}/products/search?q=${encodeURIComponent(q)}&sucursal_id=${sucursalID}`,
        { headers: { Authorization: `Bearer ${jwt}` } }
      );
      const data = await res.json();
      if (data.success) setProductos(data.products ?? []);
    } catch {
      // offline — WatermelonDB sync usaría datos locales
    } finally {
      setBuscando(false);
    }
  }, [jwt, sucursalID]);

  useEffect(() => {
    const t = setTimeout(() => buscar(query), 350);
    return () => clearTimeout(t);
  }, [query, buscar]);

  const agregar = (p: Producto) => {
    setCarrito(prev => {
      const idx = prev.findIndex(i => i.producto.productoID === p.productoID);
      const precio = p.precioOferta ?? p.precioVenta;
      if (idx >= 0) {
        const u = [...prev];
        u[idx].cantidad += 1;
        u[idx].subtotal = u[idx].cantidad * precio;
        return u;
      }
      return [...prev, { producto: p, cantidad: 1, subtotal: precio }];
    });
    setQuery('');
    setProductos([]);
  };

  const cambiarCantidad = (idx: number, delta: number) => {
    setCarrito(prev => {
      const u = [...prev];
      u[idx].cantidad += delta;
      if (u[idx].cantidad <= 0) return u.filter((_, i) => i !== idx);
      u[idx].subtotal = u[idx].cantidad * (u[idx].producto.precioOferta ?? u[idx].producto.precioVenta);
      return u;
    });
  };

  const total  = carrito.reduce((s, i) => s + i.subtotal, 0);
  const vuelto = Number(montoEntregado) - total;

  const confirmar = async () => {
    const id = `TKT-${Date.now()}`;
    setTicketID(id);
    setPaso('confirmado');
    // TODO: guardar en WatermelonDB y sincronizar
  };

  const nuevaVenta = () => {
    setCarrito([]); setPaso('venta');
    setMontoEntregado(''); setTicketID(''); setQuery('');
  };

  const cerrarSesion = async () => {
    await AsyncStorage.removeItem('jwt');
    router.replace('/login');
  };

  if (paso === 'confirmado') {
    return (
      <SafeAreaView style={[styles.root, styles.center]}>
        <Text style={styles.bigEmoji}>✅</Text>
        <Text style={styles.confirmedTitle}>¡Venta confirmada!</Text>
        <Text style={styles.ticketID}>{ticketID}</Text>
        <Text style={styles.totalText}>${total.toFixed(2)}</Text>
        {medioPago === 'Efectivo' && vuelto > 0 && (
          <Text style={styles.vueltoText}>Vuelto: ${vuelto.toFixed(2)}</Text>
        )}
        <TouchableOpacity style={styles.btnPrimary} onPress={nuevaVenta}>
          <Text style={styles.btnPrimaryText}>Nueva Venta</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (paso === 'pago') {
    return (
      <SafeAreaView style={styles.root}>
        <Text style={styles.sectionTitle}>💳 Elegí medio de pago</Text>
        <Text style={styles.totalPago}>${total.toFixed(2)}</Text>

        <View style={styles.mediosGrid}>
          {MEDIOS.map(m => (
            <TouchableOpacity
              key={m}
              style={[styles.medioBtn, medioPago === m && styles.medioBtnActive]}
              onPress={() => setMedioPago(m)}
            >
              <Text style={styles.medioText}>{m}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {medioPago === 'Efectivo' && (
          <View style={styles.efectivoBox}>
            <Text style={styles.label}>Monto entregado</Text>
            <TextInput
              style={styles.montoInput}
              keyboardType="decimal-pad"
              value={montoEntregado}
              onChangeText={setMontoEntregado}
              placeholder="0.00"
              placeholderTextColor="#94a3b8"
            />
            {Number(montoEntregado) >= total && (
              <Text style={styles.vueltoInline}>Vuelto: ${(Number(montoEntregado) - total).toFixed(2)}</Text>
            )}
          </View>
        )}

        <View style={styles.pagoActions}>
          <TouchableOpacity style={styles.btnSecondary} onPress={() => setPaso('venta')}>
            <Text style={styles.btnSecondaryText}>← Volver</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btnPrimary, { flex: 1 }]}
            onPress={confirmar}
            disabled={medioPago === 'Efectivo' && Number(montoEntregado) < total}
          >
            <Text style={styles.btnPrimaryText}>Confirmar ✓</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Paso 'venta'
  return (
    <SafeAreaView style={styles.root}>
      {/* Header compacto */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🏪 POS</Text>
        <TouchableOpacity onPress={cerrarSesion}>
          <Text style={styles.headerLink}>Salir</Text>
        </TouchableOpacity>
      </View>

      {/* Búsqueda */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="🔍 Nombre, marca o EAN..."
          placeholderTextColor="#94a3b8"
          autoCorrect={false}
        />
        {buscando && <ActivityIndicator style={{ marginLeft: 8 }} color="#1d4ed8" />}
      </View>

      {/* Resultados */}
      {productos.length > 0 && (
        <FlatList
          data={productos}
          keyExtractor={p => p.productoID}
          style={styles.resultsList}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item: p }) => (
            <TouchableOpacity style={styles.productoRow} onPress={() => agregar(p)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.productoNombre}>{p.nombre}</Text>
                <Text style={styles.productoMeta}>{p.marca} · {p.ean}</Text>
                {p.promocion && <Text style={styles.promoTag}>🏷 {p.promocion.nombre}</Text>}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.productoPrecio}>${(p.precioOferta ?? p.precioVenta).toFixed(2)}</Text>
                <Text style={styles.productoMeta}>Stock: {p.stock}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Carrito */}
      <FlatList
        data={carrito}
        keyExtractor={i => i.producto.productoID}
        style={styles.cartList}
        ListEmptyComponent={<Text style={styles.emptyCart}>Buscá un producto para agregar</Text>}
        renderItem={({ item, index }) => (
          <View style={styles.cartRow}>
            <Text style={styles.cartNombre} numberOfLines={1}>{item.producto.nombre}</Text>
            <View style={styles.cartQty}>
              <TouchableOpacity onPress={() => cambiarCantidad(index, -1)} style={styles.qtyBtn}>
                <Text style={styles.qtyBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.qtyNum}>{item.cantidad}</Text>
              <TouchableOpacity onPress={() => cambiarCantidad(index, +1)} style={styles.qtyBtn}>
                <Text style={styles.qtyBtnText}>+</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.cartSubtotal}>${item.subtotal.toFixed(2)}</Text>
          </View>
        )}
      />

      {/* Total + cobrar */}
      <View style={styles.footer}>
        <Text style={styles.totalLabel}>Total: <Text style={styles.totalValue}>${total.toFixed(2)}</Text></Text>
        <TouchableOpacity
          style={[styles.btnPrimary, carrito.length === 0 && styles.btnDisabled]}
          disabled={carrito.length === 0}
          onPress={() => setPaso('pago')}
        >
          <Text style={styles.btnPrimaryText}>Cobrar →</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const C = { primary: '#1d4ed8', success: '#16a34a', bg: '#f1f5f9', card: '#fff', text: '#1e293b', muted: '#64748b' };

const styles = StyleSheet.create({
  root:              { flex: 1, backgroundColor: C.bg },
  center:            { justifyContent: 'center', alignItems: 'center', gap: 12, padding: 24 },
  header:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.primary, paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle:       { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  headerLink:        { color: '#bfdbfe', fontSize: 14 },
  searchRow:         { flexDirection: 'row', alignItems: 'center', margin: 12 },
  searchInput:       { flex: 1, backgroundColor: C.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, color: C.text, borderWidth: 1, borderColor: '#e2e8f0' },
  resultsList:       { maxHeight: 200, marginHorizontal: 12, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  productoRow:       { flexDirection: 'row', padding: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  productoNombre:    { fontSize: 15, fontWeight: '600', color: C.text },
  productoMeta:      { fontSize: 12, color: C.muted, marginTop: 2 },
  promoTag:          { fontSize: 11, color: '#d97706', marginTop: 2 },
  productoPrecio:    { fontSize: 15, fontWeight: 'bold', color: C.primary },
  cartList:          { flex: 1, marginHorizontal: 12 },
  emptyCart:         { textAlign: 'center', color: C.muted, marginTop: 32 },
  cartRow:           { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 10, padding: 10, marginBottom: 6, gap: 8 },
  cartNombre:        { flex: 1, fontSize: 13, fontWeight: '500', color: C.text },
  cartQty:           { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn:            { width: 28, height: 28, borderRadius: 14, backgroundColor: '#e2e8f0', justifyContent: 'center', alignItems: 'center' },
  qtyBtnText:        { fontSize: 18, fontWeight: 'bold', color: C.text, lineHeight: 22 },
  qtyNum:            { fontSize: 14, fontWeight: 'bold', color: C.text, width: 24, textAlign: 'center' },
  cartSubtotal:      { fontSize: 14, fontWeight: 'bold', color: C.primary, width: 64, textAlign: 'right' },
  footer:            { padding: 16, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: '#e2e8f0', gap: 12 },
  totalLabel:        { fontSize: 16, color: C.muted },
  totalValue:        { fontSize: 20, fontWeight: 'bold', color: C.text },
  btnPrimary:        { backgroundColor: C.success, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  btnPrimaryText:    { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  btnSecondary:      { backgroundColor: '#e2e8f0', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center' },
  btnSecondaryText:  { color: C.text, fontWeight: '600', fontSize: 16 },
  btnDisabled:       { backgroundColor: '#cbd5e1' },
  sectionTitle:      { fontSize: 20, fontWeight: 'bold', color: C.text, padding: 16 },
  totalPago:         { fontSize: 36, fontWeight: 'bold', color: C.text, paddingHorizontal: 16, marginBottom: 16 },
  mediosGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16 },
  medioBtn:          { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, borderWidth: 2, borderColor: '#e2e8f0', backgroundColor: C.card },
  medioBtnActive:    { borderColor: C.primary, backgroundColor: '#eff6ff' },
  medioText:         { fontSize: 15, fontWeight: '500', color: C.text },
  efectivoBox:       { margin: 16, gap: 8 },
  label:             { fontSize: 14, color: C.muted },
  montoInput:        { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 16, paddingVertical: 12, fontSize: 24, color: C.text },
  vueltoInline:      { fontSize: 16, fontWeight: 'bold', color: C.success },
  pagoActions:       { flexDirection: 'row', gap: 12, padding: 16, marginTop: 'auto' },
  bigEmoji:          { fontSize: 72 },
  confirmedTitle:    { fontSize: 28, fontWeight: 'bold', color: C.success },
  ticketID:          { fontFamily: 'monospace', fontSize: 14, color: C.muted },
  totalText:         { fontSize: 36, fontWeight: 'bold', color: C.text },
  vueltoText:        { fontSize: 20, fontWeight: 'bold', color: C.success },
});
