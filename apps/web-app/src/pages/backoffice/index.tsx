/**
 * Backoffice — Dashboard del gestor/admin del comercio
 * Muestra: ventas del día, turnos activos, stock bajo, promociones
 */
import { useState, useEffect } from 'react';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';

interface StatCard {
  titulo: string;
  valor: string;
  icono: string;
  color: string;
}

const Backoffice: NextPage = () => {
  const router = useRouter();
  const [stats, setStats] = useState<StatCard[]>([]);
  const [wsStatus, setWsStatus] = useState<'online' | 'offline'>('offline');

  const jwt   = typeof window !== 'undefined' ? localStorage.getItem('jwt') ?? '' : '';
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

  // ── WebSocket ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!jwt) { router.replace('/login'); return; }
    const wsUrl = apiUrl.replace('http', 'ws') + `/ws?token=${jwt}`;
    let ws: WebSocket;
    let retry: ReturnType<typeof setTimeout>;

    const connect = () => {
      ws = new WebSocket(wsUrl);
      ws.onopen  = () => setWsStatus('online');
      ws.onclose = () => { setWsStatus('offline'); retry = setTimeout(connect, 4000); };
    };
    connect();
    return () => { ws?.close(); clearTimeout(retry); };
  }, [jwt, apiUrl, router]);

  // ── Stats mock (TODO: obtener del backend) ────────────────────────────────
  useEffect(() => {
    setStats([
      { titulo: 'Ventas hoy',      valor: '$0',  icono: '💰', color: 'bg-green-100 text-green-800' },
      { titulo: 'Tickets hoy',     valor: '0',   icono: '🧾', color: 'bg-blue-100 text-blue-800'  },
      { titulo: 'Turnos abiertos', valor: '0',   icono: '🔓', color: 'bg-orange-100 text-orange-800' },
      { titulo: 'Stock bajo',      valor: '0',   icono: '⚠️', color: 'bg-red-100 text-red-800'    },
    ]);
  }, []);

  const logout = () => {
    localStorage.clear();
    router.push('/login');
  };

  const navItems = [
    { href: '/pos',                    label: '🏪 POS Terminal'   },
    { href: '/backoffice/productos',   label: '📦 Productos'      },
    { href: '/backoffice/promociones', label: '🏷 Promociones'    },
    { href: '/backoffice/turnos',      label: '🔓 Turnos'         },
    { href: '/backoffice/reportes',    label: '📊 Reportes'       },
    { href: '/backoffice/dispositivos',label: '📱 Dispositivos'   },
  ];

  return (
    <div className="min-h-screen bg-slate-100 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-slate-800 text-white flex flex-col">
        <div className="px-4 py-5 border-b border-slate-700">
          <h2 className="font-bold text-lg">Gestión Comercios</h2>
          <p className="text-xs text-slate-400 mt-1">Panel de gestión</p>
        </div>

        <nav className="flex-1 px-2 py-4 space-y-1">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-slate-700 transition"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-slate-700">
          <div className={`text-xs mb-3 ${wsStatus === 'online' ? 'text-green-400' : 'text-red-400'}`}>
            {wsStatus === 'online' ? '● En línea' : '○ Sin conexión'}
          </div>
          <button onClick={logout} className="w-full text-xs text-slate-400 hover:text-white transition">
            Cerrar sesión →
          </button>
        </div>
      </aside>

      {/* Contenido */}
      <main className="flex-1 p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-sm text-slate-500">{new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {stats.map((s) => (
            <div key={s.titulo} className={`rounded-2xl p-5 ${s.color}`}>
              <p className="text-3xl mb-2">{s.icono}</p>
              <p className="text-2xl font-bold">{s.valor}</p>
              <p className="text-sm font-medium opacity-75">{s.titulo}</p>
            </div>
          ))}
        </div>

        {/* Accesos rápidos */}
        <h2 className="text-lg font-semibold text-slate-700 mb-3">Accesos rápidos</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            { href: '/pos',                    label: 'Abrir POS',          icono: '🏪', desc: 'Ir al terminal de ventas' },
            { href: '/backoffice/productos',   label: 'Gestionar Productos', icono: '📦', desc: 'Precios, stock, catálogo' },
            { href: '/backoffice/promociones', label: 'Crear Promoción',     icono: '🏷', desc: 'Descuentos y ofertas' },
            { href: '/backoffice/turnos',      label: 'Ver Turnos',          icono: '🔓', desc: 'Apertura y cierre de caja' },
            { href: '/backoffice/reportes',    label: 'Ver Reportes',        icono: '📊', desc: 'Ventas, stock, métricas' },
            { href: '/backoffice/dispositivos',label: 'Dispositivos',        icono: '📱', desc: 'Gestionar dispositivos POS' },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="bg-white rounded-2xl p-5 hover:shadow-md transition border border-slate-200 block"
            >
              <p className="text-3xl mb-2">{item.icono}</p>
              <p className="font-semibold text-slate-800">{item.label}</p>
              <p className="text-xs text-slate-400 mt-1">{item.desc}</p>
            </a>
          ))}
        </div>
      </main>
    </div>
  );
};

export default Backoffice;
