import esMessages  from './locales/es.json';
import esARMessages from './locales/es-AR.json';
import enMessages   from './locales/en.json';

export type Locale = 'es' | 'es-AR' | 'en';
type Messages = typeof esMessages;

/**
 * I18nManager — motor de internacionalización propio para AVANTI.
 *
 * Fallback jerárquico:
 *   es-AR → es   (modismos regionales sobrescriben el español base)
 *   en    → en   (inglés completo, sin fallback a español)
 *
 * Uso:
 *   import { getTranslation, setLanguage } from '@comercios/shared-logic';
 *   getTranslation('auth.start_turn')          // "Iniciar Turno"
 *   getTranslation('pos.change_label', { amount: '50' })  // "Vuelto: $50"
 */
class I18nManager {
  private currentLocale: Locale = 'es';
  // Record<string, unknown> permite que es-AR.json sea un sub-conjunto parcial
  // sin que TypeScript se queje por las claves faltantes.
  private messages: Record<Locale, Record<string, unknown>> = {
    'es':    esMessages,
    'es-AR': { ...esMessages, ...esARMessages },
    'en':    enMessages,
  };

  constructor() {
    this.detectLocale();
  }

  private detectLocale(): void {
    if (typeof navigator !== 'undefined') {
      const lang = (navigator.language ?? 'es').toLowerCase();

      if (lang.startsWith('es-ar')) {
        this.currentLocale = 'es-AR';
      } else if (lang.startsWith('es')) {
        this.currentLocale = 'es';
      } else if (lang.startsWith('en')) {
        this.currentLocale = 'en';
      } else {
        this.currentLocale = 'es'; // Fallback global → español
      }
    }
  }

  /**
   * Obtiene la traducción para una clave dot-notation.
   * Soporta interpolación simple con {{variable}}.
   *
   * @example
   *   t('enroll.success_detail', { name: 'Caja 1' })
   *   // "Este dispositivo quedó registrado como "Caja 1" en la sucursal."
   */
  public t(key: string, vars?: Record<string, string | number>, defaultValue?: string): string {
    const keys  = key.split('.');
    let value: unknown = this.messages[this.currentLocale];

    for (const k of keys) {
      value = (value as Record<string, unknown>)?.[k];
    }

    let result = (typeof value === 'string' ? value : null) ?? defaultValue ?? key;

    // Interpolación de variables: {{varName}}
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
      }
    }

    return result;
  }

  public setLocale(locale: Locale): void {
    if (this.messages[locale] !== undefined) {
      this.currentLocale = locale;
    }
  }

  public getLocale(): Locale {
    return this.currentLocale;
  }
}

export const i18n = new I18nManager();

/** Alias de conveniencia para componentes funcionales */
export function getTranslation(
  key: string,
  varsOrDefault?: Record<string, string | number> | string,
  defaultValue?: string,
): string {
  if (typeof varsOrDefault === 'string') {
    return i18n.t(key, undefined, varsOrDefault);
  }
  return i18n.t(key, varsOrDefault, defaultValue);
}

/** Shorthand más compacto: t('key', { vars }) */
export const t = getTranslation;

export function setLanguage(locale: Locale): void {
  i18n.setLocale(locale);
}
