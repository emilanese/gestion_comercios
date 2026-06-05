import esMessages from './locales/es.json';
import esARMessages from './locales/es-AR.json';

type Locale = 'es' | 'es-AR' | 'en';
type Messages = typeof esMessages;

class I18nManager {
  private currentLocale: Locale = 'es';
  private messages: Record<Locale, Partial<Messages>> = {
    'es': esMessages,
    'es-AR': { ...esMessages, ...esARMessages },
    'en': esMessages // Fallback to Spanish for now
  };

  constructor() {
    this.detectLocale();
  }

  private detectLocale(): void {
    // Detect from navigator/device settings
    if (typeof navigator !== 'undefined') {
      const browserLang = navigator.language || 'es';
      const lang = browserLang.toLowerCase();
      
      if (lang.startsWith('es-ar')) {
        this.currentLocale = 'es-AR';
      } else if (lang.startsWith('es')) {
        this.currentLocale = 'es';
      } else {
        this.currentLocale = 'es'; // Default fallback
      }
    }
  }

  public getTranslation(key: string, defaultValue?: string): string {
    const keys = key.split('.');
    let value: any = this.messages[this.currentLocale];
    
    for (const k of keys) {
      value = value?.[k];
    }
    
    return value || defaultValue || key;
  }

  public setLocale(locale: Locale): void {
    if (this.messages[locale]) {
      this.currentLocale = locale;
    }
  }

  public getLocale(): Locale {
    return this.currentLocale;
  }
}

export const i18n = new I18nManager();

export function getTranslation(key: string, defaultValue?: string): string {
  return i18n.getTranslation(key, defaultValue);
}

export function setLanguage(locale: Locale): void {
  i18n.setLocale(locale);
}
