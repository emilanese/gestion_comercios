import { useState } from 'react';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { t } from '@comercios/shared-logic';

const Login: NextPage = () => {
  const router = useRouter();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || t('auth.invalid_credentials'));
        return;
      }

      localStorage.setItem('jwt',         data.token);
      localStorage.setItem('comercio_id', data.comercio_id);
      localStorage.setItem('rol',         data.rol);

      router.push('/backoffice');
    } catch {
      setError(t('errors.network_error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-800">{t('common.app_name')}</h1>
          <p className="text-slate-500 mt-2">{t('auth.subtitle')}</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('auth.email')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="tu@comercio.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('auth.password')}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
          >
            {loading ? t('auth.signing_in') : t('auth.login')}
          </button>
        </form>

        <div className="mt-6 text-center">
          <a href="/pos" className="text-sm text-blue-600 hover:underline">
            {t('auth.cashier_link')}
          </a>
        </div>
      </div>
    </div>
  );
};

export default Login;
