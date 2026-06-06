/**
 * Backoffice — Dashboard del gestor/admin del comercio
 * Todos los textos visibles se leen desde los diccionarios de i18n.
 */
import { useState, useEffect } from 'react';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { t } from '@comercios/shared-logic';

interface StatCard {
  key:   string;
  valor: string;
  icono: string;
  color: string;
}

const Backoffice: NextPage = () => {
  const router = useRouter();
  const [stats, setStats]     = useState<StatCard[]>([]);
  const [wsStatus, setWsStatus] = useState<'online' | 'offline'>('offline');

  const jwt    = typeof window !== 'undefined' ? localStorage.getItem('jwt') ?? '' : '';
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

  // ── WebSocket ─────────────────────────────────────────────────────────────
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
      { key: 'sales_today',   valor: '$0', icono: '💰', color: 'bg-green-100 text-green-800'  },
      { key: 'tickets_today', valor: '0',  icono: '🧾', color: 'bg-blue-100 text-blue-800'    },
      { key: 'open_turns',    valor: '0',  icono: '🔓', color: 'bg-orange-100 text-orange-800' },
      { key: 'critical_stock',valor: '0',  icono: '⚠️', color: 'bg-red-100 text-red-800'      },
    ]);
  }, []);

  const logout = () => {
    localStorage.clear();
    router.push('/login');
  };

  // Títulos de stats por clave
  const statTitles: Record<string, string> = {
    sales_today:    t('backoffice.sales_today'),
    tickets_today:  t('backoffice.tickets_today'),
    open_turns:     t('backoffice.open_turns'),
    critical_stock: t('backoffice.critical_stock'),
  };

  const navItems = [
    { href: '/pos',                     label: t('backoffice.nav_pos')        },
    { href: '/backoffice/productos',    label: t('backoffice.nav_products')   },
    { href: '/backoffice/promociones',  label: t('backoffice.nav_promotions') },
    { href: '/backoffice/turnos',       label: t('backoffice.nav_turns')      },
    { href: '/backoffice/reportes',     label: t('backoffice.nav_reports')    },
    { href: '/backoffice/dispositivos', label: t('backoffice.nav_devices')    },
  ];

  const quickLinks = [
    { href: '/pos',                     label: t('backoffice.sc_pos'),          icono: '🏪', desc: t('backoffice.sc_pos_desc')          },
    { href: '/backoffice/productos',    label: t('backoffice.sc_products'),     icono: '📦', desc: t('backoffice.sc_products_desc')     },
    { href: '/backoffice/promociones',  label: t('backoffice.sc_promotions'),   icono: '🏷', desc: t('backoffice.sc_promotions_desc')   },
    { href: '/backoffice/turnos',       label: t('backoffice.sc_turns'),        icono: '🔓', desc: t('backoffice.sc_turns_desc')        },
    { href: '/backoffice/reportes',     label: t('backoffice.sc_reports'),      icono: '📊', desc: t('backoffice.sc_reports_desc')      },
    { href: '/backoffice/dispositivos', label: t('backoffice.sc_devices'),      icono: '📱', desc: t('backoffice.sc_devices_desc')      },
  ];

  return (
    <div className="min-h-screen bg-slate-100 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-slate-800 text-white flex flex-col">
        <div className="px-4 py-5 border-b border-slate-700">
          <h2 className="font-bold text-lg">{t('common.app_name')}</h2>
          <p className="text-xs text-slate-400 mt-1">{t('backoffice.subtitle')}</p>
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
            {wsStatus === 'online' ? t('common.online') : t('common.offline')}
          </div>
          <button onClick={logout} className="w-full text-xs text-slate-400 hover:text-white transition">
            {t('auth.logout')} →
          </button>
        </div>
      </aside>

      {/* Contenido */}
      <main className="flex-1 p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-800">{t('backoffice.dashboard')}</h1>
          <p className="text-sm text-slate-500">
            {new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {stats.map((s) => (
            <div key={s.key} className={`rounded-2xl p-5 ${s.color}`}>
              <p className="text-3xl mb-2">{s.icono}</p>
              <p className="text-2xl font-bold">{s.valor}</p>
              <p className="text-sm font-medium opacity-75">{statTitles[s.key] ?? s.key}</p>
            </div>
          ))}
        </div>

        {/* Accesos rápidos */}
        <h2 className="text-lg font-semibold text-slate-700 mb-3">{t('backoffice.quick_access')}</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {quickLinks.map((item) => (
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
