/**
 * POS Terminal — Pantalla principal del punto de venta
 * Flujo: Búsqueda de productos → Carrito → Pago → Ticket
 */
import { useState, useEffect, useCallback } from 'react';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { t } from '@comercios/shared-logic';

// ─── Tipos locales ─────────────────────────────────────────────────────────

interface Producto {
  productoID: string;
  nombre: string;
  marca: string;
  ean: string;
  precioVenta: number;
  precioOferta?: number;
  stock: number;
  promocion?: { nombre: string; descuentoPorcentaje: number } | null;
}

interface CartItem {
  producto: Producto;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

type PasoTicket = 'carrito' | 'pago' | 'confirmado';

// Los nombres se resuelven en render desde el diccionario i18n
const MEDIOS_PAGO = [
  { id: 'efectivo',      key: 'pos.cash',     icono: '💵' },
  { id: 'debito',        key: 'pos.debit',    icono: '💳' },
  { id: 'credito',       key: 'pos.credit',   icono: '💳' },
  { id: 'transferencia', key: 'pos.transfer', icono: '🏦' },
  { id: 'qr',            key: 'pos.qr',       icono: '📱' },
];

// ─── Componente ──────────────────────────────────────────────────────────────

const POS: NextPage = () => {
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [productos, setProductos] = useState<Producto[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [carrito, setCarrito] = useState<CartItem[]>([]);
  const [paso, setPaso] = useState<PasoTicket>('carrito');
  const [medioPago, setMedioPago] = useState('efectivo');
  const [montoEntregado, setMontoEntregado] = useState('');
  const [ticketID, setTicketID] = useState('');
  const [wsStatus, setWsStatus] = useState<'online' | 'offline'>('offline');

  const jwt = typeof window !== 'undefined' ? localStorage.getItem('jwt') ?? '' : '';
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

  // ── WebSocket de estado ─────────────────────────────────────────────────
  useEffect(() => {
    if (!jwt) return;
    const wsUrl = apiUrl.replace('http', 'ws') + `/ws?token=${jwt}`;
    let ws: WebSocket;
    let retryTimeout: ReturnType<typeof setTimeout>;

    const connect = () => {
      ws = new WebSocket(wsUrl);
      ws.onopen  = () => setWsStatus('online');
      ws.onclose = () => {
        setWsStatus('offline');
        retryTimeout = setTimeout(connect, 3000);
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'STOCK_UPDATE' || msg.type === 'PRECIO_UPDATE') {
            // Re-buscar para actualizar precios si hay query activa
            if (query) buscarProductos(query);
          }
        } catch {}
      };
    };
    connect();
    return () => { ws?.close(); clearTimeout(retryTimeout); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jwt]);

  // ── Búsqueda de productos ───────────────────────────────────────────────
  const buscarProductos = useCallback(async (q: string) => {
    if (q.length < 2) { setProductos([]); return; }
    setBuscando(true);
    try {
      const sucursalID = localStorage.getItem('sucursal_id') ?? '';
      const res = await fetch(
        `${apiUrl}/products/search?q=${encodeURIComponent(q)}&sucursal_id=${sucursalID}`,
        { headers: { Authorization: `Bearer ${jwt}` } }
      );
      const data = await res.json();
      if (data.success) setProductos(data.products ?? []);
    } catch {
      console.error('[POS] Error buscando productos');
    } finally {
      setBuscando(false);
    }
  }, [apiUrl, jwt]);

  useEffect(() => {
    const timer = setTimeout(() => buscarProductos(query), 300);
    return () => clearTimeout(timer);
  }, [query, buscarProductos]);

  // ── Carrito ─────────────────────────────────────────────────────────────
  const agregarAlCarrito = (producto: Producto) => {
    setCarrito((prev) => {
      const idx = prev.findIndex((i) => i.producto.productoID === producto.productoID);
      const precio = producto.precioOferta ?? producto.precioVenta;
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx].cantidad += 1;
        updated[idx].subtotal = updated[idx].cantidad * precio;
        return updated;
      }
      return [...prev, { producto, cantidad: 1, precioUnitario: precio, subtotal: precio }];
    });
    setQuery('');
    setProductos([]);
  };

  const cambiarCantidad = (idx: number, delta: number) => {
    setCarrito((prev) => {
      const updated = [...prev];
      updated[idx].cantidad += delta;
      if (updated[idx].cantidad <= 0) return updated.filter((_, i) => i !== idx);
      updated[idx].subtotal = updated[idx].cantidad * updated[idx].precioUnitario;
      return updated;
    });
  };

  const totalCarrito = carrito.reduce((sum, i) => sum + i.subtotal, 0);
  const vuelto = Number(montoEntregado) - totalCarrito;

  // ── Confirmar pago ──────────────────────────────────────────────────────
  const confirmarPago = async () => {
    const id = `TKT-${Date.now()}`;
    setTicketID(id);
    setPaso('confirmado');
    // TODO: Llamar a /tickets/confirm y sincronizar con WatermelonDB
  };

  const nuevaVenta = () => {
    setCarrito([]);
    setPaso('carrito');
    setMontoEntregado('');
    setTicketID('');
    setQuery('');
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Header */}
      <header className="bg-blue-700 text-white px-4 py-3 flex items-center justify-between shadow">
        <h1 className="text-xl font-bold">{t('pos.title')} Terminal</h1>
        <div className="flex items-center gap-3">
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${wsStatus === 'online' ? 'bg-green-500' : 'bg-red-400'}`}>
            {wsStatus === 'online' ? t('common.online') : t('common.offline')}
          </span>
          <button onClick={() => router.push('/backoffice')} className="text-sm underline">
            {t('backoffice.dashboard')}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Columna izquierda: búsqueda ─────────────────────────────── */}
        <div className="w-1/2 flex flex-col p-4 gap-3 border-r border-slate-200">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('pos.search_placeholder')}
            className="w-full px-4 py-3 border border-slate-300 rounded-xl text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />

          {buscando && <p className="text-slate-400 text-center">{t('common.searching')}</p>}

          <div className="flex-1 overflow-y-auto space-y-2">
            {productos.map((p) => (
              <button
                key={p.productoID}
                onClick={() => agregarAlCarrito(p)}
                className="w-full bg-white rounded-xl p-3 text-left hover:bg-blue-50 border border-slate-200 transition"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-slate-800">{p.nombre}</p>
                    <p className="text-xs text-slate-400">{p.marca} · EAN: {p.ean}</p>
                    {p.promocion && (
                      <span className="text-xs bg-orange-100 text-orange-700 rounded px-1">
                        🏷 {p.promocion.nombre}
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    {p.precioOferta ? (
                      <>
                        <p className="text-green-600 font-bold">${p.precioOferta.toFixed(2)}</p>
                        <p className="text-xs line-through text-slate-400">${p.precioVenta.toFixed(2)}</p>
                      </>
                    ) : (
                      <p className="font-bold text-slate-800">${p.precioVenta.toFixed(2)}</p>
                    )}
                     <p className="text-xs text-slate-400">{t('pos.stock_label', { count: p.stock })}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Columna derecha: carrito + pago ──────────────────────────── */}
        <div className="w-1/2 flex flex-col p-4">
          {paso === 'carrito' && (
            <>
              <h2 className="text-lg font-semibold text-slate-700 mb-3">🛒 {t('pos.payment_method', 'Carrito')}</h2>
              <div className="flex-1 overflow-y-auto space-y-2">
                {carrito.length === 0 && (
                  <p className="text-slate-400 text-center mt-8">{t('pos.cart_empty')}</p>
                )}
                {carrito.map((item, idx) => (
                  <div key={item.producto.productoID} className="bg-white rounded-xl p-3 flex items-center gap-3 border border-slate-200">
                    <div className="flex-1">
                      <p className="font-medium text-slate-800 text-sm">{item.producto.nombre}</p>
                      <p className="text-xs text-slate-400">${item.precioUnitario.toFixed(2)} c/u</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => cambiarCantidad(idx, -1)} className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 font-bold text-lg leading-none">−</button>
                      <span className="w-6 text-center font-semibold">{item.cantidad}</span>
                      <button onClick={() => cambiarCantidad(idx, +1)} className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 font-bold text-lg leading-none">+</button>
                    </div>
                    <p className="w-20 text-right font-bold text-blue-700">${item.subtotal.toFixed(2)}</p>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-200 pt-3 mt-3">
                  <div className="flex justify-between text-xl font-bold text-slate-800 mb-4">
                    <span>{t('pos.total')}</span>
                  <span>${totalCarrito.toFixed(2)}</span>
                </div>
                  <button
                    onClick={() => setPaso('pago')}
                    disabled={carrito.length === 0}
                    className="w-full bg-green-600 hover:bg-green-700 disabled:bg-slate-300 text-white font-bold py-3 rounded-xl text-lg transition"
                  >
                    {t('pos.checkout')}
                  </button>
              </div>
            </>
          )}

          {paso === 'pago' && (
            <>
              <h2 className="text-lg font-semibold text-slate-700 mb-3">💳 {t('pos.payment_method')}</h2>
              <p className="text-3xl font-bold text-slate-800 mb-4">{t('pos.total')} ${totalCarrito.toFixed(2)}</p>

              <div className="grid grid-cols-2 gap-2 mb-4">
                {MEDIOS_PAGO.map((mp) => (
                  <button
                    key={mp.id}
                    onClick={() => setMedioPago(mp.id)}
                    className={`p-3 rounded-xl border-2 text-left transition ${medioPago === mp.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white'}`}
                  >
                    <span className="text-xl">{mp.icono}</span>
                    <p className="text-sm font-medium mt-1">{t(mp.key)}</p>
                  </button>
                ))}
              </div>

              {medioPago === 'efectivo' && (
                <div className="mb-4">
                  <label className="text-sm text-slate-600 mb-1 block">{t('pos.amount_tendered')}</label>
                  <input
                    type="number"
                    value={montoEntregado}
                    onChange={(e) => setMontoEntregado(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg text-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                  />
                  {Number(montoEntregado) >= totalCarrito && (
                    <p className="text-green-600 font-bold mt-2">{t('pos.change_label', { amount: vuelto.toFixed(2) })}</p>
                  )}
                </div>
              )}

              <div className="flex gap-3 mt-auto">
                <button onClick={() => setPaso('carrito')} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-3 rounded-xl transition">
                  {t('pos.back_to_sale')}
                </button>
                <button
                  onClick={confirmarPago}
                  disabled={medioPago === 'efectivo' && Number(montoEntregado) < totalCarrito}
                  className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-slate-300 text-white font-bold py-3 rounded-xl transition"
                >
                  {t('pos.confirm_sale')}
                </button>
              </div>
            </>
          )}

          {paso === 'confirmado' && (
            <div className="flex flex-col items-center justify-center flex-1 gap-4">
              <div className="text-6xl">✅</div>
              <h2 className="text-2xl font-bold text-green-700">{t('pos.sale_confirmed')}</h2>
              <p className="text-slate-500">{t('common.ticket_label')} <span className="font-mono font-bold">{ticketID}</span></p>
              <p className="text-3xl font-bold text-slate-800">${totalCarrito.toFixed(2)}</p>
              {medioPago === 'efectivo' && vuelto > 0 && (
                <p className="text-xl text-green-600 font-semibold">{t('pos.change_label', { amount: vuelto.toFixed(2) })}</p>
              )}
              <button
                onClick={nuevaVenta}
                className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl text-lg"
              >
                {t('pos.new_sale')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default POS;
