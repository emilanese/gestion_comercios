import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type TipoPromocion =
  | 'DESCUENTO_PORCENTAJE'
  | 'PRECIO_FIJO'
  | '2x1'
  | '3x2'
  | 'COMBO';

interface Promo {
  id: string;
  nombre: string;
  tipo: TipoPromocion;
  productoID: string;
  productoNombre?: string;
  descuentoPorcentaje: number;
  precioFijo: number;
  cantidadMinima: number;
  cantidadGratis: number;
  fechaInicio: string;
  fechaFin: string;
  activa: boolean;
}

interface ProductoBuscado {
  productoID: string;
  nombre: string;
  precioVenta: number;
  ean: string;
}

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

function getToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('token') ?? '';
}

function getSucursalID() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('sucursal_id') ?? '';
}

const TIPOS: { value: TipoPromocion; label: string }[] = [
  { value: 'DESCUENTO_PORCENTAJE', label: '% Descuento' },
  { value: 'PRECIO_FIJO',          label: 'Precio Fijo' },
  { value: '2x1',                  label: '2x1' },
  { value: '3x2',                  label: '3x2' },
  { value: 'COMBO',                label: 'Combo' },
];

// ─── Componente principal ─────────────────────────────────────────────────────

export default function PromocionesPage() {
  const router = useRouter();
  const [promos, setPromos] = useState<Promo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [modalAbierto, setModalAbierto] = useState(false);

  // Búsqueda de producto para la promo
  const [busqProd, setBusqProd] = useState('');
  const [productosBuscados, setProductosBuscados] = useState<ProductoBuscado[]>([]);
  const [productoSeleccionado, setProductoSeleccionado] = useState<ProductoBuscado | null>(null);

  // Formulario nueva promo
  const [form, setForm] = useState({
    nombre: '',
    tipo: 'DESCUENTO_PORCENTAJE' as TipoPromocion,
    descuentoPorcentaje: '',
    precioFijo: '',
    cantidadMinima: '1',
    cantidadGratis: '0',
    fechaInicio: new Date().toISOString().slice(0, 10),
    fechaFin: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  });

  const [guardando, setGuardando] = useState(false);
  const [mensajeOk, setMensajeOk] = useState('');

  // ── Cargar promociones ────────────────────────────────────────────────────
  const cargarPromos = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const sid = getSucursalID();
      const res = await fetch(`${API}/promotions/active?sucursal_id=${sid}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.status === 401) { router.push('/login'); return; }
      const data = await res.json();
      setPromos(data.promotions ?? []);
    } catch {
      setError('Error cargando promociones');
    } finally {
      setCargando(false);
    }
  }, [router]);

  useEffect(() => { cargarPromos(); }, [cargarPromos]);

  // ── Búsqueda de producto ──────────────────────────────────────────────────
  useEffect(() => {
    if (busqProd.length < 2) { setProductosBuscados([]); return; }
    const timer = setTimeout(async () => {
      try {
        const sid = getSucursalID();
        const res = await fetch(`${API}/products/search?q=${encodeURIComponent(busqProd)}&sucursal_id=${sid}`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        const data = await res.json();
        setProductosBuscados(data.products ?? []);
      } catch { /* silenciar */ }
    }, 300);
    return () => clearTimeout(timer);
  }, [busqProd]);

  // ── Crear promoción ───────────────────────────────────────────────────────
  const handleCrear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productoSeleccionado) { setError('Seleccioná un producto'); return; }
    if (!form.nombre.trim()) { setError('El nombre es requerido'); return; }

    setGuardando(true);
    setError('');
    try {
      const sid = getSucursalID();
      const body = {
        nombre: form.nombre,
        tipo: form.tipo,
        productoID: productoSeleccionado.productoID,
        sucursalID: sid,
        descuentoPorcentaje: parseFloat(form.descuentoPorcentaje || '0'),
        precioFijo: parseFloat(form.precioFijo || '0'),
        cantidadMinima: parseInt(form.cantidadMinima, 10),
        cantidadGratis: parseInt(form.cantidadGratis, 10),
        fechaInicio: form.fechaInicio,
        fechaFin: form.fechaFin,
      };
      const res = await fetch(`${API}/promotions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? 'Error desconocido');

      setMensajeOk(`✅ Promoción "${form.nombre}" creada`);
      setModalAbierto(false);
      setProductoSeleccionado(null);
      setBusqProd('');
      setForm({
        nombre: '', tipo: 'DESCUENTO_PORCENTAJE',
        descuentoPorcentaje: '', precioFijo: '',
        cantidadMinima: '1', cantidadGratis: '0',
        fechaInicio: new Date().toISOString().slice(0, 10),
        fechaFin: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      });
      cargarPromos();
      setTimeout(() => setMensajeOk(''), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error creando promoción');
    } finally {
      setGuardando(false);
    }
  };

  // ── Desactivar promoción ──────────────────────────────────────────────────
  const handleDesactivar = async (id: string, nombre: string) => {
    if (!confirm(`¿Desactivar la promoción "${nombre}"?`)) return;
    try {
      const res = await fetch(`${API}/promotions/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setMensajeOk(`Promoción "${nombre}" desactivada`);
      cargarPromos();
      setTimeout(() => setMensajeOk(''), 2500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  };

  // ── Formateo ──────────────────────────────────────────────────────────────
  const formatDescuento = (p: Promo) => {
    switch (p.tipo) {
      case 'DESCUENTO_PORCENTAJE': return `${p.descuentoPorcentaje}% off`;
      case 'PRECIO_FIJO': return `$${p.precioFijo.toFixed(2)}`;
      case '2x1': return '2x1';
      case '3x2': return '3x2';
      default: return p.tipo;
    }
  };

  const diasRestantes = (fechaFin: string) => {
    const diff = new Date(fechaFin).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / 86400000));
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <Head><title>Promociones | Backoffice</title></Head>

      <div style={{ padding: '24px', fontFamily: 'sans-serif', maxWidth: 1100, margin: '0 auto' }}>

        {/* Barra superior */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <button onClick={() => router.push('/backoffice')} style={btnSecStyle}>← Volver</button>
            <h1 style={{ margin: '8px 0 4px', fontSize: 24 }}>🎯 Promociones</h1>
            <p style={{ color: '#666', margin: 0, fontSize: 14 }}>
              Gestioná descuentos, 2x1 y precios especiales para tu sucursal
            </p>
          </div>
          <button onClick={() => setModalAbierto(true)} style={btnPrimStyle}>
            + Nueva Promoción
          </button>
        </div>

        {/* Mensajes */}
        {mensajeOk && <div style={alertOkStyle}>{mensajeOk}</div>}
        {error && <div style={alertErrStyle}>{error} <button onClick={() => setError('')} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button></div>}

        {/* Tabla */}
        {cargando ? (
          <p style={{ textAlign: 'center', padding: 40, color: '#888' }}>Cargando...</p>
        ) : promos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#aaa', border: '2px dashed #ddd', borderRadius: 12 }}>
            <div style={{ fontSize: 48 }}>🏷️</div>
            <p style={{ fontSize: 18, marginTop: 12 }}>No hay promociones activas</p>
            <button onClick={() => setModalAbierto(true)} style={{ ...btnPrimStyle, marginTop: 16 }}>
              Crear primera promoción
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#f5f5f5' }}>
                  {['Nombre', 'Tipo', 'Descuento', 'Producto', 'Vigencia', 'Días restantes', 'Acciones'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #e0e0e0', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {promos.map((p, i) => {
                  const dias = diasRestantes(p.fechaFin);
                  return (
                    <tr key={p.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={tdStyle}><strong>{p.nombre}</strong></td>
                      <td style={tdStyle}><span style={badgeStyle}>{TIPOS.find(t => t.value === p.tipo)?.label ?? p.tipo}</span></td>
                      <td style={{ ...tdStyle, fontWeight: 700, color: '#e53935' }}>{formatDescuento(p)}</td>
                      <td style={tdStyle}>{p.productoNombre ?? p.productoID.slice(0, 8) + '…'}</td>
                      <td style={{ ...tdStyle, fontSize: 12, color: '#555' }}>
                        {p.fechaInicio.slice(0, 10)} → {p.fechaFin.slice(0, 10)}
                      </td>
                      <td style={tdStyle}>
                        <span style={{ color: dias <= 3 ? '#e53935' : dias <= 7 ? '#ff9800' : '#43a047', fontWeight: 600 }}>
                          {dias}d
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <button
                          onClick={() => handleDesactivar(p.id, p.nombre)}
                          style={{ ...btnSmallStyle, background: '#ffebee', color: '#c62828' }}
                        >
                          Desactivar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Modal nueva promoción ─────────────────────────────────────── */}
        {modalAbierto && (
          <div style={overlayStyle} onClick={() => setModalAbierto(false)}>
            <div style={modalStyle} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h2 style={{ margin: 0 }}>Nueva Promoción</h2>
                <button onClick={() => setModalAbierto(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#666' }}>✕</button>
              </div>

              <form onSubmit={handleCrear} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* Búsqueda de producto */}
                <label style={labelStyle}>
                  Producto *
                  <input
                    placeholder="Buscar por nombre o EAN…"
                    value={busqProd}
                    onChange={e => { setBusqProd(e.target.value); setProductoSeleccionado(null); }}
                    style={inputStyle}
                  />
                  {productosBuscados.length > 0 && !productoSeleccionado && (
                    <div style={{ border: '1px solid #ddd', borderRadius: 6, marginTop: 2, maxHeight: 160, overflowY: 'auto', background: '#fff', position: 'absolute', zIndex: 10, width: '100%', boxShadow: '0 4px 12px rgba(0,0,0,0.12)' }}>
                      {productosBuscados.map(pr => (
                        <div
                          key={pr.productoID}
                          onClick={() => { setProductoSeleccionado(pr); setBusqProd(pr.nombre); setProductosBuscados([]); }}
                          style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}
                          onMouseOver={e => (e.currentTarget.style.background = '#f5f5f5')}
                          onMouseOut={e => (e.currentTarget.style.background = '#fff')}
                        >
                          <strong>{pr.nombre}</strong>
                          <span style={{ color: '#888', fontSize: 12, marginLeft: 8 }}>EAN: {pr.ean || '—'} | ${pr.precioVenta.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {productoSeleccionado && (
                    <div style={{ marginTop: 4, padding: '4px 8px', background: '#e8f5e9', borderRadius: 4, fontSize: 13, color: '#388e3c' }}>
                      ✓ {productoSeleccionado.nombre} — ${productoSeleccionado.precioVenta.toFixed(2)}
                    </div>
                  )}
                </label>

                {/* Nombre */}
                <label style={labelStyle}>
                  Nombre de la promoción *
                  <input
                    value={form.nombre}
                    onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                    placeholder="Ej: Super oferta mayo"
                    style={inputStyle}
                    required
                  />
                </label>

                {/* Tipo */}
                <label style={labelStyle}>
                  Tipo *
                  <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as TipoPromocion }))} style={inputStyle}>
                    {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </label>

                {/* Campos según tipo */}
                {form.tipo === 'DESCUENTO_PORCENTAJE' && (
                  <label style={labelStyle}>
                    Descuento (%)
                    <input type="number" min={1} max={99} step={0.5}
                      value={form.descuentoPorcentaje}
                      onChange={e => setForm(f => ({ ...f, descuentoPorcentaje: e.target.value }))}
                      style={inputStyle} required />
                  </label>
                )}
                {form.tipo === 'PRECIO_FIJO' && (
                  <label style={labelStyle}>
                    Precio oferta ($)
                    <input type="number" min={0} step={0.01}
                      value={form.precioFijo}
                      onChange={e => setForm(f => ({ ...f, precioFijo: e.target.value }))}
                      style={inputStyle} required />
                  </label>
                )}
                {(form.tipo === '2x1' || form.tipo === '3x2' || form.tipo === 'COMBO') && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <label style={labelStyle}>
                      Cantidad mínima
                      <input type="number" min={1} value={form.cantidadMinima}
                        onChange={e => setForm(f => ({ ...f, cantidadMinima: e.target.value }))}
                        style={inputStyle} />
                    </label>
                    <label style={labelStyle}>
                      Cantidad gratis
                      <input type="number" min={0} value={form.cantidadGratis}
                        onChange={e => setForm(f => ({ ...f, cantidadGratis: e.target.value }))}
                        style={inputStyle} />
                    </label>
                  </div>
                )}

                {/* Fechas */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <label style={labelStyle}>
                    Fecha inicio
                    <input type="date" value={form.fechaInicio}
                      onChange={e => setForm(f => ({ ...f, fechaInicio: e.target.value }))}
                      style={inputStyle} required />
                  </label>
                  <label style={labelStyle}>
                    Fecha fin
                    <input type="date" value={form.fechaFin}
                      onChange={e => setForm(f => ({ ...f, fechaFin: e.target.value }))}
                      style={inputStyle} required />
                  </label>
                </div>

                {error && <div style={{ ...alertErrStyle, marginBottom: 0 }}>{error}</div>}

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                  <button type="button" onClick={() => setModalAbierto(false)} style={btnSecStyle}>Cancelar</button>
                  <button type="submit" disabled={guardando} style={{ ...btnPrimStyle, opacity: guardando ? 0.7 : 1 }}>
                    {guardando ? 'Guardando…' : '✓ Crear Promoción'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const btnPrimStyle: React.CSSProperties = {
  background: '#1976d2', color: '#fff', border: 'none',
  padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14,
};
const btnSecStyle: React.CSSProperties = {
  background: '#f5f5f5', color: '#333', border: '1px solid #ddd',
  padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 14,
};
const btnSmallStyle: React.CSSProperties = {
  border: 'none', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
};
const tdStyle: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid #eee' };
const badgeStyle: React.CSSProperties = {
  background: '#e3f2fd', color: '#1565c0', padding: '2px 8px',
  borderRadius: 12, fontSize: 12, fontWeight: 600,
};
const labelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14,
  fontWeight: 600, color: '#333', position: 'relative',
};
const inputStyle: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid #ddd', borderRadius: 6,
  fontSize: 14, fontWeight: 400,
};
const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};
const modalStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 12, padding: 28,
  width: '90%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto',
  boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
};
const alertOkStyle: React.CSSProperties = {
  background: '#e8f5e9', color: '#2e7d32', padding: '10px 14px',
  borderRadius: 8, marginBottom: 16, fontWeight: 500,
};
const alertErrStyle: React.CSSProperties = {
  background: '#ffebee', color: '#c62828', padding: '10px 14px',
  borderRadius: 8, marginBottom: 16, fontWeight: 500, display: 'flex', alignItems: 'center',
};
