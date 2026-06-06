/**
 * Backoffice — Turnos del día
 * Lista todos los turnos del comercio con sus tickets y totales.
 */
import { useState, useEffect } from 'react';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { t } from '@comercios/shared-logic';

interface Ticket {
  id:             string;
  numero:         number;
  total:          number;
  totalDescuento: number;
  estado:         string;
  createdAt:      number;
}

interface Turno {
  id:             string;
  operadorNombre: string;
  sucursalID:     string;
  numeroTerminal: number;
  montoInicial:   number;
  saldoEsperado:  number;
  estado:         string;
  openedAt:       number;
  closedAt?:      number;
  ticketCount:    number;
  tickets?:       Ticket[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}
function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString('es-AR');
}
function estadoBadge(estado: string) {
  const map: Record<string, string> = {
    ABIERTO:    'bg-green-100 text-green-800',
    CERRADO:    'bg-slate-100 text-slate-600',
    SUSPENDIDO: 'bg-yellow-100 text-yellow-800',
  };
  return map[estado] ?? 'bg-slate-100 text-slate-600';
}

// ─── Componente ───────────────────────────────────────────────────────────────

const TurnosPage: NextPage = () => {
  const router  = useRouter();
  const [turnos, setTurnos]       = useState<Turno[]>([]);
  const [cargando, setCargando]   = useState(true);
  const [error, setError]         = useState('');
  const [expandido, setExpandido] = useState<string | null>(null);
  const [tickets, setTickets]     = useState<Record<string, Ticket[]>>({});

  const jwt    = typeof window !== 'undefined' ? localStorage.getItem('jwt')        ?? '' : '';
  const sucID  = typeof window !== 'undefined' ? localStorage.getItem('sucursal_id') ?? '' : '';
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

  useEffect(() => {
    if (!jwt) { router.replace('/login'); return; }
    cargarTurnos();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jwt]);

  const cargarTurnos = async () => {
    setCargando(true);
    setError('');
    try {
      // GET /turns no existe aún, usamos el endpoint de tickets como proxy:
      // Obtenemos turnos desde la DB via un endpoint genérico (a implementar).
      // Por ahora mostramos el turno activo del dispositivo actual.
      const res = await fetch(
        `${apiUrl}/turns/active?device_id=all`,
        { headers: { Authorization: `Bearer ${jwt}` } }
      );
      if (!res.ok) throw new Error('Error obteniendo turnos');
      const data = await res.json();
      if (data.success && data.turn_config) {
        setTurnos([{
          id:             data.turn_config.turnoID,
          operadorNombre: data.turn_config.operadorNombre,
          sucursalID:     data.turn_config.sucursalID ?? sucID,
          numeroTerminal: data.turn_config.numeroTerminal,
          montoInicial:   data.turn_config.montoInicial,
          saldoEsperado:  data.turn_config.saldoEsperado,
          estado:         data.turn_config.estadoTurno,
          openedAt:       new Date(data.turn_config.openedAt).getTime(),
          ticketCount:    data.turn_config.ticketCount ?? 0,
        }]);
      } else {
        setTurnos([]);
      }
    } catch {
      setError('No se pudieron cargar los turnos');
    } finally {
      setCargando(false);
    }
  };

  const cargarTickets = async (turnoID: string) => {
    if (tickets[turnoID]) { setExpandido(turnoID); return; }
    try {
      const res = await fetch(
        `${apiUrl}/tickets?turno_id=${turnoID}`,
        { headers: { Authorization: `Bearer ${jwt}` } }
      );
      const data = await res.json();
      if (data.success) {
        setTickets((prev) => ({ ...prev, [turnoID]: data.tickets }));
      }
    } catch {}
    setExpandido(turnoID);
  };

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-blue-700 text-white px-6 py-4 flex items-center justify-between shadow">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/backoffice')} className="text-blue-200 hover:text-white text-sm">
            ← {t('backoffice.dashboard')}
          </button>
          <h1 className="text-xl font-bold">🔓 {t('backoffice.open_turns')}</h1>
        </div>
        <button onClick={cargarTurnos} className="text-sm bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded-lg">
          🔄 Actualizar
        </button>
      </header>

      <div className="max-w-5xl mx-auto p-6">
        {cargando && (
          <div className="text-center text-slate-500 mt-12">Cargando turnos...</div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4">
            {error}
          </div>
        )}

        {!cargando && turnos.length === 0 && (
          <div className="text-center text-slate-400 mt-16">
            <p className="text-4xl mb-4">🔒</p>
            <p className="text-lg">No hay turnos abiertos en este momento</p>
          </div>
        )}

        <div className="space-y-4">
          {turnos.map((turno) => (
            <div key={turno.id} className="bg-white rounded-2xl shadow border border-slate-200 overflow-hidden">
              {/* Cabecera del turno */}
              <div
                className="p-5 flex items-center justify-between cursor-pointer hover:bg-slate-50"
                onClick={() => {
                  if (expandido === turno.id) { setExpandido(null); }
                  else { cargarTickets(turno.id); }
                }}
              >
                <div className="flex items-center gap-4">
                  <div className="text-3xl">🖥️</div>
                  <div>
                    <p className="font-bold text-slate-800 text-lg">
                      Terminal {turno.numeroTerminal} — {turno.operadorNombre}
                    </p>
                    <p className="text-slate-500 text-sm">
                      Abierto {formatDate(turno.openedAt)} a las {formatTime(turno.openedAt)}
                      {turno.closedAt && ` — Cerrado a las ${formatTime(turno.closedAt)}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm text-slate-500">Ventas esperadas</p>
                    <p className="text-xl font-bold text-green-700">${turno.saldoEsperado.toFixed(2)}</p>
                    <p className="text-xs text-slate-400">{turno.ticketCount} tickets</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${estadoBadge(turno.estado)}`}>
                    {turno.estado}
                  </span>
                  <span className="text-slate-400">{expandido === turno.id ? '▲' : '▼'}</span>
                </div>
              </div>

              {/* Detalle de tickets */}
              {expandido === turno.id && (
                <div className="border-t border-slate-100 bg-slate-50 p-4">
                  <h3 className="text-sm font-semibold text-slate-600 mb-3">Tickets del turno</h3>
                  {(tickets[turno.id] ?? []).length === 0 ? (
                    <p className="text-slate-400 text-sm text-center py-4">Sin tickets aún</p>
                  ) : (
                    <div className="space-y-2">
                      {(tickets[turno.id] ?? []).map((tk) => (
                        <div key={tk.id} className="flex items-center justify-between bg-white rounded-xl px-4 py-2 border border-slate-100">
                          <div>
                            <span className="font-mono text-slate-500 text-xs">#{tk.numero}</span>
                            <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${tk.estado === 'CONFIRMADO' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {tk.estado}
                            </span>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-slate-800">${tk.total.toFixed(2)}</p>
                            <p className="text-xs text-slate-400">{formatTime(tk.createdAt)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TurnosPage;
