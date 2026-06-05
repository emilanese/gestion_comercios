/**
 * versioning.ts — Concurrencia Optimista con Reintento Automático (OCC)
 *
 * Implementa el patrón "Optimistic Concurrency Control with Auto-Retry":
 * - occAction(): wrapper atómico de WatermelonDB que garantiza escrituras seriales
 * - SyncMutation / PendingMutation: tipos para el protocolo de versiones
 * - waitForVersion(): espera reactiva a que la versión local alcance un valor dado
 *
 * Regla de oro: el usuario NUNCA ve un error de conflicto de versión.
 * El sistema resuelve el conflicto en milisegundos en segundo plano.
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

/**
 * Payload que viaja por WebSocket para una mutación backoffice.
 * El Gestor Cloud Go valida la secuencia base_version → new_version con Redis CAS.
 */
export interface SyncMutation {
  /** nanoid() — identifica este intento para el retry queue */
  mutation_id: string;
  sucursal_id: string;
  base_version: number;
  new_version: number;
  /** Tipo de evento (PRECIO_UPDATE | STOCK_UPDATE | PROMO_ACTIVADA | etc.) */
  payload_type: string;
  data: unknown;
}

/**
 * Entrada en el retry queue del WebSocketManager.
 * Almacena la función que puede volver a aplicar el cambio sobre una base nueva.
 */
export interface PendingMutation {
  mutation: SyncMutation;
  retryCount: number;
  /**
   * Re-aplica el cambio del usuario sobre la nueva versión base.
   * DEBE ejecutarse dentro de un database.action() para garantizar atomicidad.
   * Retorna el nuevo SyncMutation con versiones actualizadas.
   */
  applyFn: (newBaseVersion: number) => Promise<SyncMutation>;
}

/**
 * Resultado que la función de negocio debe devolver dentro de occAction.
 */
export interface MutationResult {
  payloadType: string;
  data: unknown;
}

// ─── waitForVersion ───────────────────────────────────────────────────────────

/**
 * Espera de forma reactiva a que la versión local del modelo `version_sucursal`
 * alcance (o supere) el valor `targetVersion`.
 *
 * Se resuelve inmediatamente si la versión local ya es >= targetVersion.
 * Timeout de seguridad: 5 segundos (después de ese tiempo resuelve igual para
 * no bloquear el reintento indefinidamente).
 *
 * @param getLocalVersion función que lee la versión actual del modelo local
 * @param targetVersion la versión que debe alcanzarse
 * @param pollIntervalMs intervalo de polling (default 50ms)
 */
export async function waitForVersion(
  getLocalVersion: () => Promise<number>,
  targetVersion: number,
  pollIntervalMs = 50,
  timeoutMs = 5000
): Promise<void> {
  const start = Date.now();
  while (true) {
    const current = await getLocalVersion();
    if (current >= targetVersion) return;
    if (Date.now() - start > timeoutMs) {
      console.warn(`[OCC] waitForVersion timeout — esperando v${targetVersion}, local=${current}`);
      return; // resuelve de todas formas para no bloquear
    }
    await new Promise(r => setTimeout(r, pollIntervalMs));
  }
}

// ─── occAction ────────────────────────────────────────────────────────────────

/**
 * occAction — Wrapper de WatermelonDB Action Queue para mutaciones del Backoffice.
 *
 * Garantiza que las escrituras en el MISMO dispositivo sean seriales (no paralelas)
 * usando la Action Queue de WatermelonDB, y genera el payload versionado para
 * enviarlo al Gestor Cloud vía WebSocket.
 *
 * Firma deliberadamente genérica para no acoplar este módulo a WatermelonDB
 * directamente (permite testing sin una instancia real de DB).
 *
 * @param runAction  función que recibe una "acción": debe llamar internamente a
 *                   database.action(async () => { ... }) y retornar el resultado.
 *                   Es responsabilidad del caller wrappear en la Action Queue.
 * @param sucursalID ID de la sucursal que se está modificando
 * @param mutationId nanoid() generado por el caller (permite retry con mismo ID)
 * @param fn         función de negocio: recibe la versión local actual y debe
 *                   ejecutar las escrituras en WatermelonDB. Retorna el payload
 *                   que se enviará por WS.
 * @returns          SyncMutation listo para enviar + la applyFn para el retry queue
 */
export async function occAction(
  runAction: <T>(fn: () => Promise<T>) => Promise<T>,
  getLocalVersion: () => Promise<number>,
  setLocalVersion: (newVersion: number) => Promise<void>,
  sucursalID: string,
  mutationId: string,
  fn: (currentVersion: number) => Promise<MutationResult>
): Promise<{ mutation: SyncMutation; applyFn: (newBase: number) => Promise<SyncMutation> }> {

  // Ejecutar todo dentro de la Action Queue (serialización garantizada)
  const mutation = await runAction(async () => {
    const currentVersion = await getLocalVersion();
    const result = await fn(currentVersion);
    // Actualizar versión local atómicamente junto con los cambios de negocio
    await setLocalVersion(currentVersion + 1);

    return {
      mutation_id: mutationId,
      sucursal_id: sucursalID,
      base_version: currentVersion,
      new_version: currentVersion + 1,
      payload_type: result.payloadType,
      data: result.data,
    } satisfies SyncMutation;
  });

  /**
   * applyFn: reaplica el cambio original sobre una nueva base.
   * Se llama cuando Go devuelve VERSION_CONFLICT y la versión local ya se actualizó.
   */
  const applyFn = async (newBase: number): Promise<SyncMutation> => {
    return runAction(async () => {
      // En el momento del reintento, la versión local ya debería ser newBase
      // (porque el broadcast del otro dispositivo ya fue aplicado)
      const result = await fn(newBase);
      await setLocalVersion(newBase + 1);
      return {
        mutation_id: mutationId + '-r', // distingue el reintento en logs
        sucursal_id: sucursalID,
        base_version: newBase,
        new_version: newBase + 1,
        payload_type: result.payloadType,
        data: result.data,
      } satisfies SyncMutation;
    });
  };

  return { mutation, applyFn };
}
