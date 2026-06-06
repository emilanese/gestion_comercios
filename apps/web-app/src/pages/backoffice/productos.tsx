/**
 * Backoffice — ABM de Productos
 * Lista, busca y edita productos del comercio.
 */
import { useState, useEffect, useCallback } from 'react';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { t } from '@comercios/shared-logic';

interface Producto {
  productoID:  string;
  nombre:      string;
  marca:       string;
  ean:         string;
  precioVenta: number;
  precioOferta?: number;
  stock:       number;
  activo:      boolean;
}

const ProductosPage: NextPage = () => {
  const router = useRouter();
  const [productos, setProductos]   = useState<Producto[]>([]);
  const [cargando, setCargando]     = useState(true);
  const [query, setQuery]           = useState('');
  const [error, setError]           = useState('');
  const [editando, setEditando]     = useState<Producto | null>(null);
  const [guardando, setGuardando]   = useState(false);
  const [msgOk, setMsgOk]           = useState('');

  const jwt    = typeof window !== 'undefined' ? localStorage.getItem('jwt')        ?? '' : '';
  const sucID  = typeof window !== 'undefined' ? localStorage.getItem('sucursal_id') ?? '' : '';
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

  useEffect(() => {
    if (!jwt) { router.replace('/login'); return; }
    buscar('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jwt]);

  const buscar = useCallback(async (q: string) => {
    setCargando(true);
    setError('');
    try {
      const url = q
        ? `${apiUrl}/products/search?q=${encodeURIComponent(q)}&sucursal_id=${sucID}`
        : `${apiUrl}/products?sucursal_id=${sucID}&limit=50`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${jwt}` } });
      const data = await res.json();
      if (data.success) setProductos(data.products ?? []);
      else throw new Error(data.error);
    } catch {
      setError('Error cargando productos');
    } finally {
      setCargando(false);
    }
  }, [apiUrl, jwt, sucID]);

  useEffect(() => {
    const timer = setTimeout(() => buscar(query), 400);
    return () => clearTimeout(timer);
  }, [query, buscar]);

  // ── Guardar precio/stock editado ─────────────────────────────────────────
  const guardarEdicion = async () => {
    if (!editando) return;
    setGuardando(true);
    try {
      // PUT /products/:id — a implementar en el backend
      const res = await fetch(`${apiUrl}/products/${editando.productoID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({
          precioVenta:  editando.precioVenta,
          precioOferta: editando.precioOferta ?? null,
          stock:        editando.stock,
        }),
      });
      if (res.ok) {
        setProductos((prev) =>
          prev.map((p) => p.productoID === editando.productoID ? editando : p)
        );
        setMsgOk('Producto actualizado ✅');
        setTimeout(() => setMsgOk(''), 3000);
        setEditando(null);
      } else {
        const data = await res.json();
        setError(data.error ?? 'Error guardando');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-blue-700 text-white px-6 py-4 flex items-center justify-between shadow">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/backoffice')} className="text-blue-200 hover:text-white text-sm">
            ← {t('backoffice.dashboard')}
          </button>
          <h1 className="text-xl font-bold">📦 Productos</h1>
        </div>
        <span className="text-sm text-blue-200">{productos.length} productos cargados</span>
      </header>

      <div className="max-w-5xl mx-auto p-6 space-y-4">
        {/* Buscador */}
        <div className="flex gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('pos.search_placeholder')}
            className="flex-1 px-4 py-3 border border-slate-200 rounded-xl bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">{error}</div>
        )}
        {msgOk && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl">{msgOk}</div>
        )}

        {/* Tabla */}
        <div className="bg-white rounded-2xl shadow border border-slate-200 overflow-hidden">
          {cargando ? (
            <div className="text-center py-12 text-slate-400">Cargando productos...</div>
          ) : productos.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <p className="text-4xl mb-3">📦</p>
              <p>No se encontraron productos</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Nombre</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">EAN</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">Precio</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">Oferta</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">Stock</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {productos.map((p) => (
                  <tr key={p.productoID} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800 text-sm">{p.nombre}</p>
                      <p className="text-xs text-slate-400">{p.marca}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.ean}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-700">
                      ${p.precioVenta.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {p.precioOferta
                        ? <span className="text-green-600 font-semibold">${p.precioOferta.toFixed(2)}</span>
                        : <span className="text-slate-300">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-semibold ${p.stock <= 5 ? 'text-red-600' : 'text-slate-700'}`}>
                        {p.stock}
                        {p.stock <= 5 && ' ⚠️'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setEditando({ ...p })}
                        className="text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1 rounded-lg font-medium transition"
                      >
                        ✏️ Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal de edición */}
      {editando && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 mx-4">
            <h2 className="text-xl font-bold text-slate-800 mb-1">✏️ Editar producto</h2>
            <p className="text-slate-500 text-sm mb-5">{editando.nombre} · {editando.ean}</p>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-600 block mb-1">Precio de venta</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editando.precioVenta}
                  onChange={(e) => setEditando({ ...editando, precioVenta: Number(e.target.value) })}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-600 block mb-1">Precio de oferta (opcional)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editando.precioOferta ?? ''}
                  onChange={(e) => setEditando({ ...editando, precioOferta: e.target.value ? Number(e.target.value) : undefined })}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Sin oferta"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-600 block mb-1">Stock actual</label>
                <input
                  type="number"
                  min="0"
                  value={editando.stock}
                  onChange={(e) => setEditando({ ...editando, stock: Number(e.target.value) })}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditando(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2 rounded-xl transition"
              >
                Cancelar
              </button>
              <button
                onClick={guardarEdicion}
                disabled={guardando}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold py-2 rounded-xl transition"
              >
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductosPage;
