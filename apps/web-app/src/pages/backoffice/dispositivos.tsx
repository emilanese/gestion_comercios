import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Dispositivo {
  id: string;
  nombre: string;
  rol: string;
  sucursalID: string;
  sucursalNombre: string;
  estado: 'ACTIVO' | 'BLOQUEADO' | 'PENDIENTE';
  numeroTerminal: number;
  enrolledAt: number;
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

const ROL_LABELS: Record<string, string> = {
  POS_CAJERO:  '🖥️ Caja',
  POS_ENCARGADO: '👔 Encargado',
  GESTOR:      '🏢 Gestor',
  DEPOSITO:    '📦 Depósito',
};

// ─── Componente principal ─────────────────────────────────────────────────────

export default function DispositivosPage() {
  const router = useRouter();
  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [mensajeOk, setMensajeOk] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'ACTIVO' | 'BLOQUEADO'>('todos');

  // Modal código de enrolamiento
  const [modalEnrolAbierto, setModalEnrolAbierto] = useState(false);
  const [codigoGenerado, setCodigoGenerado] = useState('');
  const [rolNuevo, setRolNuevo] = useState('POS_CAJERO');
  const [generando, setGenerando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  // ── Cargar dispositivos ───────────────────────────────────────────────────
  const cargarDispositivos = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const res = await fetch(`${API}/devices`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.status === 401) { router.push('/login'); return; }
      const data = await res.json();
      setDispositivos(data.devices ?? []);
    } catch {
      setError('Error cargando dispositivos');
    } finally {
      setCargando(false);
    }
  }, [router]);

  useEffect(() => { cargarDispositivos(); }, [cargarDispositivos]);

  // ── Desbloquear dispositivo ───────────────────────────────────────────────
  const handleDesbloquear = async (deviceID: string, nombre: string) => {
    if (!confirm(`¿Desbloquear el dispositivo "${nombre}"?`)) return;
    try {
      const res = await fetch(`${API}/admin/unblock-device`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ device_id: deviceID }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? 'Error desconocido');
      setMensajeOk(`✅ Dispositivo "${nombre}" desbloqueado`);
      cargarDispositivos();
      setTimeout(() => setMensajeOk(''), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desbloqueando dispositivo');
    }
  };

  // ── Generar código de enrolamiento ────────────────────────────────────────
  const handleGenerarCodigo = async () => {
    setGenerando(true);
    setCodigoGenerado('');
    setCopiado(false);
    try {
      const sid = getSucursalID();
      const res = await fetch(`${API}/devices/generate-code`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sucursalID: sid, rol: rolNuevo }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? 'Error generando código');
      setCodigoGenerado(data.token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error generando código');
    } finally {
      setGenerando(false);
    }
  };

  const handleCopiar = async () => {
    try {
      await navigator.clipboard.writeText(codigoGenerado);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch { /* silenciar */ }
  };

  // ── Filtrado ──────────────────────────────────────────────────────────────
  const dispositivosFiltrados = filtro === 'todos'
    ? dispositivos
    : dispositivos.filter(d => d.estado === filtro);

  const contadores = {
    total:     dispositivos.length,
    activos:   dispositivos.filter(d => d.estado === 'ACTIVO').length,
    bloqueados: dispositivos.filter(d => d.estado === 'BLOQUEADO').length,
    pendientes: dispositivos.filter(d => d.estado === 'PENDIENTE').length,
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <Head><title>Dispositivos | Backoffice</title></Head>

      <div style={{ padding: '24px', fontFamily: 'sans-serif', maxWidth: 1100, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <button onClick={() => router.push('/backoffice')} style={btnSecStyle}>← Volver</button>
            <h1 style={{ margin: '8px 0 4px', fontSize: 24 }}>📱 Dispositivos Autorizados</h1>
            <p style={{ color: '#666', margin: 0, fontSize: 14 }}>
              Gestioná los terminales POS y su acceso al sistema
            </p>
          </div>
          <button onClick={() => { setModalEnrolAbierto(true); setCodigoGenerado(''); }} style={btnPrimStyle}>
            + Autorizar dispositivo
          </button>
        </div>

        {/* Mensajes */}
        {mensajeOk && <div style={alertOkStyle}>{mensajeOk}</div>}
        {error && <div style={alertErrStyle}>{error} <button onClick={() => setError('')} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button></div>}

        {/* Tarjetas resumen */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Total', valor: contadores.total, color: '#1976d2', bg: '#e3f2fd' },
            { label: 'Activos', valor: contadores.activos, color: '#388e3c', bg: '#e8f5e9' },
            { label: 'Bloqueados', valor: contadores.bloqueados, color: '#d32f2f', bg: '#ffebee' },
            { label: 'Pendientes', valor: contadores.pendientes, color: '#f57c00', bg: '#fff3e0' },
          ].map(c => (
            <div key={c.label} style={{ background: c.bg, padding: '16px 20px', borderRadius: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: c.color }}>{c.valor}</div>
              <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>{c.label}</div>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {(['todos', 'ACTIVO', 'BLOQUEADO'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              style={{
                ...btnSecStyle,
                background: filtro === f ? '#1976d2' : '#f5f5f5',
                color: filtro === f ? '#fff' : '#333',
                borderColor: filtro === f ? '#1976d2' : '#ddd',
              }}
            >
              {f === 'todos' ? 'Todos' : f === 'ACTIVO' ? '✅ Activos' : '🔒 Bloqueados'}
            </button>
          ))}
          <button onClick={cargarDispositivos} style={{ ...btnSecStyle, marginLeft: 'auto' }}>↻ Actualizar</button>
        </div>

        {/* Lista */}
        {cargando ? (
          <p style={{ textAlign: 'center', padding: 40, color: '#888' }}>Cargando...</p>
        ) : dispositivosFiltrados.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#aaa', border: '2px dashed #ddd', borderRadius: 12 }}>
            <div style={{ fontSize: 48 }}>📱</div>
            <p style={{ fontSize: 18, marginTop: 12 }}>
              {filtro === 'todos' ? 'No hay dispositivos registrados' : `No hay dispositivos ${filtro === 'ACTIVO' ? 'activos' : 'bloqueados'}`}
            </p>
            {filtro === 'todos' && (
              <button onClick={() => setModalEnrolAbierto(true)} style={{ ...btnPrimStyle, marginTop: 16 }}>
                Autorizar primer dispositivo
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {dispositivosFiltrados.map(d => (
              <div key={d.id} style={{
                display: 'flex', alignItems: 'center', gap: 16,
                background: '#fff', border: '1px solid #e0e0e0',
                borderRadius: 10, padding: '14px 18px',
                borderLeft: `4px solid ${d.estado === 'ACTIVO' ? '#4caf50' : d.estado === 'BLOQUEADO' ? '#f44336' : '#ff9800'}`,
              }}>
                {/* Ícono */}
                <div style={{ fontSize: 28 }}>
                  {d.rol === 'DEPOSITO' ? '📦' : d.rol === 'GESTOR' ? '🏢' : '🖥️'}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{d.nombre || `Terminal ${d.numeroTerminal}`}</div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
                    <span style={{ ...badgeStyle, background: '#f3e5f5', color: '#7b1fa2' }}>
                      {ROL_LABELS[d.rol] ?? d.rol}
                    </span>
                    <span style={{ fontSize: 12, color: '#666' }}>📍 {d.sucursalNombre || 'Sin sucursal'}</span>
                    <span style={{ fontSize: 12, color: '#666' }}>🔢 Terminal #{d.numeroTerminal}</span>
                    <span style={{ fontSize: 11, color: '#aaa' }}>
                      Enrollado: {new Date(d.enrolledAt).toLocaleDateString('es-AR')}
                    </span>
                  </div>
                </div>

                {/* Estado + acciones */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                    background: d.estado === 'ACTIVO' ? '#e8f5e9' : d.estado === 'BLOQUEADO' ? '#ffebee' : '#fff3e0',
                    color: d.estado === 'ACTIVO' ? '#2e7d32' : d.estado === 'BLOQUEADO' ? '#c62828' : '#e65100',
                  }}>
                    {d.estado}
                  </span>
                  {d.estado === 'BLOQUEADO' && (
                    <button
                      onClick={() => handleDesbloquear(d.id, d.nombre)}
                      style={{ ...btnSmallStyle, background: '#e8f5e9', color: '#2e7d32' }}
                    >
                      Desbloquear
                    </button>
                  )}
                  <button
                    onClick={() => navigator.clipboard.writeText(d.id).catch(() => {})}
                    title="Copiar ID del dispositivo"
                    style={{ ...btnSmallStyle, background: '#f5f5f5', color: '#555', fontSize: 11 }}
                  >
                    ID
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Modal enrolamiento ─────────────────────────────────────────── */}
        {modalEnrolAbierto && (
          <div style={overlayStyle} onClick={() => setModalEnrolAbierto(false)}>
            <div style={modalStyle} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h2 style={{ margin: 0 }}>📱 Autorizar nuevo dispositivo</h2>
                <button onClick={() => setModalEnrolAbierto(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#666' }}>✕</button>
              </div>

              <p style={{ color: '#666', fontSize: 14, marginTop: 0 }}>
                Generá un código de enrolamiento y escanealo desde la app del dispositivo POS.
                El código expira en <strong>6 horas</strong>.
              </p>

              <label style={{ ...labelStyle, marginBottom: 16 }}>
                Rol del dispositivo
                <select value={rolNuevo} onChange={e => setRolNuevo(e.target.value)} style={inputStyle}>
                  <option value="POS_CAJERO">🖥️ Caja (Cajero)</option>
                  <option value="POS_ENCARGADO">👔 Caja (Encargado)</option>
                  <option value="DEPOSITO">📦 Depósito</option>
                </select>
              </label>

              <button
                onClick={handleGenerarCodigo}
                disabled={generando}
                style={{ ...btnPrimStyle, width: '100%', marginBottom: 16, opacity: generando ? 0.7 : 1 }}
              >
                {generando ? 'Generando…' : '🔑 Generar código de enrolamiento'}
              </button>

              {codigoGenerado && (
                <div style={{ background: '#f5f5f5', borderRadius: 10, padding: 20, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                    Código de enrolamiento
                  </div>
                  <div style={{
                    fontFamily: 'monospace', fontSize: 28, fontWeight: 700,
                    letterSpacing: 4, color: '#1976d2', marginBottom: 16,
                    padding: '12px 0', background: '#fff', borderRadius: 8,
                    border: '2px dashed #90caf9',
                  }}>
                    {codigoGenerado.toUpperCase().match(/.{1,4}/g)?.join('-')}
                  </div>
                  <button onClick={handleCopiar} style={{ ...btnSecStyle, width: '100%' }}>
                    {copiado ? '✓ Copiado!' : '📋 Copiar código'}
                  </button>
                  <p style={{ fontSize: 12, color: '#aaa', marginTop: 12, marginBottom: 0 }}>
                    Ingresá este código en la app del dispositivo POS al enrollar
                  </p>
                </div>
              )}
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
  border: 'none', padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
};
const badgeStyle: React.CSSProperties = {
  background: '#e3f2fd', color: '#1565c0', padding: '2px 8px',
  borderRadius: 12, fontSize: 12, fontWeight: 600,
};
const labelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14, fontWeight: 600, color: '#333',
};
const inputStyle: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14, fontWeight: 400,
};
const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};
const modalStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 12, padding: 28,
  width: '90%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto',
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
