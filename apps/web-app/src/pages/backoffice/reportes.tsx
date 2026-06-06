/**
 * Backoffice — Reportes de ventas
 * Muestra las ventas agrupadas por turno del día seleccionado.
 */
import { useState, useEffect, useCallback } from 'react';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';

interface ResumenTurno {
  turnoID:        string;
  operador:       string;
  terminal:       number;
  estado:         string;
  openedAt:       number;
  totalVentas:    number;
  cantidadTickets: number;
  montoInicial:   number;
  saldoEsperado:  number;
}

interface ResumenDia {
  fecha:          string;
  totalVentas:    number;
  cantidadTickets: number;
  turnos:         ResumenTurno[];
}

function toDateString(d: Date) {
  return d.toISOString().split('T')[0];
}
function formatCurrency(n: number) {
  return `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

const ReportesPage: NextPage = () => {
  const router  = useRouter();
  const today   = toDateString(new Date());
  const [fecha, setFecha]         = useState(today);
  const [resumen, setResumen]     = useState<ResumenDia | null>(null);
  const [cargando, setCargando]   = useState(false);
  const [error, setError]         = useState('');

  const jwt    = typeof window !== 'undefined' ? localStorage.getItem('jwt') ?? '' : '';
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

  useEffect(() => {
    if (!jwt) { router.replace('/login'); }
  }, [jwt, router]);

  const cargarReporte = useCallback(async () => {
    setCargando(true);
    setError('');
    setResumen(null);
    try {
      // GET /reports/daily?fecha=YYYY-MM-DD
      // Este endpoint se implementará en el backend. Por ahora, mostramos un mock útil.
      const res = await fetch(
        `${apiUrl}/reports/daily?fecha=${fecha}`,
        { headers: { Authorization: `Bearer ${jwt}` } }
      );
      if (!res.ok) throw new Error('Error');
      const data = await res.json();
      if (data.success) setResumen(data.resumen);
      else throw new Error(data.error);
    } catch {
      // Endpoint aún no existe → mostrar placeholder
      setResumen({
        fecha,
        totalVentas: 0,
        cantidadTickets: 0,
        turnos: [],
      });
      setError('El endpoint /reports/daily aún no está implementado en el backend. Datos de ejemplo mostrados.');
    } finally {
      setCargando(false);
    }
  }, [fecha, apiUrl, jwt]);

  useEffect(() => { if (jwt) cargarReporte(); }, [jwt, cargarReporte]);

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-blue-700 text-white px-6 py-4 flex items-center justify-between shadow">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/backoffice')} className="text-blue-200 hover:text-white text-sm">
            ← Dashboard
          </button>
          <h1 className="text-xl font-bold">📊 Reportes de Ventas</h1>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Selector de fecha */}
        <div className="bg-white rounded-2xl shadow p-4 flex items-center gap-4 border border-slate-200">
          <label className="text-slate-600 font-medium text-sm">Fecha:</label>
          <input
            type="date"
            value={fecha}
            max={today}
            onChange={(e) => setFecha(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={cargarReporte}
            disabled={cargando}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-medium px-4 py-2 rounded-lg transition"
          >
            {cargando ? 'Cargando...' : 'Ver reporte'}
          </button>
        </div>

        {error && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-xl text-sm">
            ⚠️ {error}
          </div>
        )}

        {resumen && (
          <>
            {/* Resumen del día */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl shadow p-6 border border-slate-200 text-center">
                <p className="text-slate-500 text-sm mb-1">Total ventas del día</p>
                <p className="text-3xl font-bold text-green-700">{formatCurrency(resumen.totalVentas)}</p>
              </div>
              <div className="bg-white rounded-2xl shadow p-6 border border-slate-200 text-center">
                <p className="text-slate-500 text-sm mb-1">Tickets procesados</p>
                <p className="text-3xl font-bold text-blue-700">{resumen.cantidadTickets}</p>
              </div>
            </div>

            {/* Turnos del día */}
            <div className="bg-white rounded-2xl shadow border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="font-bold text-slate-700">Turnos del {resumen.fecha}</h2>
              </div>
              {resumen.turnos.length === 0 ? (
                <div className="px-6 py-12 text-center text-slate-400">
                  <p className="text-3xl mb-2">📋</p>
                  <p>No hay turnos registrados para esta fecha</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500">Operador</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500">Terminal</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500">Apertura</th>
                      <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500">Tickets</th>
                      <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500">Total</th>
                      <th className="text-center px-6 py-3 text-xs font-semibold text-slate-500">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {resumen.turnos.map((turno) => (
                      <tr key={turno.turnoID} className="hover:bg-slate-50">
                        <td className="px-6 py-4 font-medium text-slate-800">{turno.operador}</td>
                        <td className="px-6 py-4 text-slate-600">#{turno.terminal}</td>
                        <td className="px-6 py-4 text-slate-600">{formatTime(turno.openedAt)}</td>
                        <td className="px-6 py-4 text-right text-slate-700">{turno.cantidadTickets}</td>
                        <td className="px-6 py-4 text-right font-bold text-green-700">
                          {formatCurrency(turno.totalVentas)}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${turno.estado === 'ABIERTO' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                            {turno.estado}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ReportesPage;
