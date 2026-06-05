import { useEffect } from 'react';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';

// Página raíz: redirige según rol
const Home: NextPage = () => {
  const router = useRouter();

  useEffect(() => {
    const jwt = localStorage.getItem('jwt');
    const rol = localStorage.getItem('rol');
    if (!jwt) {
      router.replace('/login');
    } else if (rol === 'GESTOR' || rol === 'ADMIN_STOCK') {
      router.replace('/backoffice');
    } else {
      router.replace('/pos');
    }
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-slate-400">Redirigiendo...</p>
    </div>
  );
};

export default Home;
