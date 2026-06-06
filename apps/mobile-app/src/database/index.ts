/**
 * Singleton de WatermelonDB para toda la app mobile.
 * El DatabaseProvider está en DatabaseProvider.tsx (necesita JSX).
 */
import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/expo-sqlite';
import { createContext, useContext } from 'react';
import { dbSchema } from './schema';
import { ProductoLocal, OutboxEntry } from './models';

// ── Adapter SQLite (Expo) ─────────────────────────────────────────────────────
const adapter = new SQLiteAdapter({
  schema:   dbSchema,
  dbName:   'comercios_pos',
  jsi:      false,
  onSetUpError: (error: unknown) => {
    console.error('[WatermelonDB] Error al inicializar SQLite:', error);
  },
});

// ── Instancia global ──────────────────────────────────────────────────────────
export const database = new Database({
  adapter,
  modelClasses: [ProductoLocal, OutboxEntry],
});

// ── Context ───────────────────────────────────────────────────────────────────
export const DatabaseContext = createContext<Database>(database);

export function useDatabase(): Database {
  return useContext(DatabaseContext);
}
