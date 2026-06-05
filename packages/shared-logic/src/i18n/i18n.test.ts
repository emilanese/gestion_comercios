import { describe, it, expect, beforeEach } from 'vitest';
import { i18n, getTranslation, setLanguage } from '../i18n/i18n';

describe('i18n - Internacionalización y Fallback', () => {
  beforeEach(() => {
    // Resetear a idioma por defecto
    i18n.setLocale('es');
  });

  it('debe traducir claves existentes en español', () => {
    setLanguage('es');
    expect(getTranslation('common.app_name')).toBe('Mi Comercio SaaS');
    expect(getTranslation('pos.cash')).toBe('Efectivo');
  });

  it('debe usar valor por defecto para claves no encontradas', () => {
    setLanguage('es');
    expect(getTranslation('non.existent.key', 'Valor por defecto')).toBe(
      'Valor por defecto'
    );
  });

  it('debe retornar la clave si no hay valor por defecto', () => {
    setLanguage('es');
    expect(getTranslation('non.existent.key')).toBe('non.existent.key');
  });

  it('debe soportar sobrescrituras regionales es-AR', () => {
    setLanguage('es-AR');
    // En es-AR, "Cambio" debe estar sobrescrito
    const valor = getTranslation('pos.change');
    expect(valor).toBe('Cambio');
  });

  it('debe hacer fallback a es cuando no encuentra valor en es-AR', () => {
    setLanguage('es-AR');
    // Una clave que no está en es-AR.json debe venir de es.json
    expect(getTranslation('pos.cash')).toBe('Efectivo');
  });

  it('debe permitir cambiar idioma dinámicamente', () => {
    setLanguage('es');
    expect(i18n.getLocale()).toBe('es');

    setLanguage('es-AR');
    expect(i18n.getLocale()).toBe('es-AR');

    setLanguage('es');
    expect(i18n.getLocale()).toBe('es');
  });

  it('debe traducir claves anidadas profundas', () => {
    setLanguage('es');
    expect(getTranslation('backoffice.dashboard')).toBe('Panel de Control');
    expect(getTranslation('inventory.breakage')).toBe('Rotura');
  });

  it('debe manejar claves con caracteres especiales', () => {
    setLanguage('es');
    expect(getTranslation('errors.offline_mode')).toContain('Modo Offline');
  });

  it('debe retornar todas las traducciones disponibles para un idioma', () => {
    setLanguage('es');
    // Verificar que existen múltiples secciones
    expect(getTranslation('common.confirm')).toBe('Confirmar');
    expect(getTranslation('auth.login')).toBe('Iniciar Sesión');
    expect(getTranslation('pos.turn_open')).toBe('Abrir Turno');
    expect(getTranslation('inventory.count')).toBe('Recuento');
    expect(getTranslation('products.product')).toBe('Producto');
  });
});
