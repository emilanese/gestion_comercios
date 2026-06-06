/**
 * DatabaseProvider — envuelve toda la app con el contexto de WatermelonDB.
 * Importar en apps/mobile-app/app/_layout.tsx.
 */
import React from 'react';
import { database, DatabaseContext } from './index';

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  return (
    <DatabaseContext.Provider value={database}>
      {children}
    </DatabaseContext.Provider>
  );
}
