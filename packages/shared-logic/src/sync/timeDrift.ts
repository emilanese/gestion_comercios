/**
 * TimeDriftManager: Handshake de sincronización horaria entre cliente y servidor
 * Calcula el Delta Horario para que todos los timestamps usen hora del servidor
 */

export interface TimeDriftResult {
  deltaHorario: number; // ms de diferencia (servidor - cliente)
  latencia: number; // ms de latencia de red
  clientTime: number; // Timestamp del cliente al enviar
  serverTime: number; // Timestamp del servidor
}

export class TimeDriftManager {
  private deltaHorario: number = 0;
  private latencia: number = 0;
  private lastSync: number = 0;

  /**
   * Ejecuta el handshake PING_SYNC/PONG_SYNC
   * @param getServerTime Función que retorna timestamp del servidor (debe retar pong inmediatamente)
   */
  async executeHandshake(
    getServerTime: () => Promise<number>
  ): Promise<TimeDriftResult> {
    try {
      // Paso 1: Cliente marca tiempo exacto
      const t1 = Date.now();

      // Paso 2: Cliente envía PING_SYNC
      const tServer = await getServerTime();

      // Paso 3: Cliente recibe PONG_SYNC y marca tiempo de llegada
      const t2 = Date.now();

      // Paso 4: Calcular latencia y Delta Horario
      this.latencia = (t2 - t1) / 2;
      const tiempoClienteCorregido = t1 + this.latencia;
      this.deltaHorario = tServer - tiempoClienteCorregido;

      this.lastSync = Date.now();

      return {
        deltaHorario: this.deltaHorario,
        latencia: this.latencia,
        clientTime: t1,
        serverTime: tServer
      };
    } catch (error) {
      console.error('[TimeDrift] Error ejecutando handshake:', error);
      throw error;
    }
  }

  /**
   * Obtiene un timestamp corregido con el Delta Horario
   * Uso: `const ts = timeDrift.getTimestamp();` → Hora local + Delta
   */
  getTimestamp(): number {
    return Date.now() + this.deltaHorario;
  }

  /**
   * Obtiene el Delta Horario actual
   */
  getDeltaHorario(): number {
    return this.deltaHorario;
  }

  /**
   * Obtiene la latencia estimada
   */
  getLatencia(): number {
    return this.latencia;
  }

  /**
   * Obtiene el timestamp del último sync
   */
  getLastSync(): number {
    return this.lastSync;
  }

  /**
   * Reinicia el Delta Horario (para testing)
   */
  reset(): void {
    this.deltaHorario = 0;
    this.latencia = 0;
    this.lastSync = 0;
  }
}

// Singleton instance
export const timeDrift = new TimeDriftManager();
