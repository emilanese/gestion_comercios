import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  searchProducts,
  searchProductByEAN,
  getProductsByCategory,
  getBrands,
  getCategories,
  ProductSearchResult,
} from './search';

// Mock Database
class MockProductosCollection {
  private data = [
    {
      producto_id: 'PROD_001',
      nombre: 'Leche Entera 1L',
      marca: 'La Serenísima',
      categoria: 'Lácteos',
      ean: '7790000001234',
      descripcion: 'Leche fresca de la mejor calidad',
      precio_costo: 1.5,
    },
    {
      producto_id: 'PROD_002',
      nombre: 'Pan de Sándwich',
      marca: 'Bimbo',
      categoria: 'Panificados',
      ean: '7790000001235',
      descripcion: 'Pan fresco diariamente',
      precio_costo: 0.4,
    },
    {
      producto_id: 'PROD_003',
      nombre: 'Yogur Entero',
      marca: 'Sancor',
      categoria: 'Lácteos',
      ean: '7790000001236',
      descripcion: 'Yogur cremoso',
      precio_costo: 0.8,
    },
    {
      producto_id: 'PROD_004',
      nombre: 'Queso Fresco 500g',
      marca: 'Sancor',
      categoria: 'Lácteos',
      ean: '7790000001237',
      descripcion: 'Queso de excelente calidad',
      precio_costo: 3.0,
    },
  ];

  async query() {
    return { async fetch() { return this.data; } };
  }
}

class MockPreciosCollection {
  private data = [
    {
      precio_id: '1',
      producto_id: 'PROD_001',
      sucursal_id: 'SUC_001',
      precio_venta: 2.5,
      stock: 100,
    },
    {
      precio_id: '2',
      producto_id: 'PROD_002',
      sucursal_id: 'SUC_001',
      precio_venta: 1.2,
      stock: 50,
    },
    {
      precio_id: '3',
      producto_id: 'PROD_003',
      sucursal_id: 'SUC_001',
      precio_venta: 1.8,
      stock: 75,
    },
    {
      precio_id: '4',
      producto_id: 'PROD_004',
      sucursal_id: 'SUC_001',
      precio_venta: 8.5,
      stock: 20,
    },
  ];

  async query() {
    return { async fetch() { return this.data; } };
  }
}

class MockPromocionesCollection {
  private data = [
    {
      promocion_id: 'PROMO_001',
      producto_id: 'PROD_002',
      nombre: '2x1 Panes',
      estado: 'ACTIVA',
      fecha_inicio: new Date(Date.now() - 86400000).toISOString(),
      fecha_fin: new Date(Date.now() + 86400000).toISOString(),
      precio_oferta: 0.6,
    },
    {
      promocion_id: 'PROMO_002',
      producto_id: 'PROD_001',
      nombre: 'Leche con descuento',
      estado: 'ACTIVA',
      fecha_inicio: new Date(Date.now() - 86400000).toISOString(),
      fecha_fin: new Date(Date.now() + 86400000).toISOString(),
      precio_oferta: 2.0,
    },
  ];

  async query() {
    return { async fetch() { return this.data; } };
  }
}

const mockDB = {
  get: (tableName: string) => {
    if (tableName === 'productos') return new MockProductosCollection();
    if (tableName === 'precios_sucursal') return new MockPreciosCollection();
    if (tableName === 'promociones_local') return new MockPromocionesCollection();
  },
} as any;

describe('Product Search', () => {
  describe('searchProducts', () => {
    it('debe buscar por nombre', async () => {
      const results = await searchProducts(mockDB, 'leche', 'SUC_001');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].nombre).toContain('Leche');
    });

    it('debe buscar por marca', async () => {
      const results = await searchProducts(mockDB, 'bimbo', 'SUC_001');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].marca).toBe('Bimbo');
    });

    it('debe buscar por categoría', async () => {
      const results = await searchProducts(mockDB, 'lácteos', 'SUC_001');

      expect(results.length).toBeGreaterThan(0);
      results.forEach((r) => {
        expect(r.categoria.toLowerCase()).toContain('lácteos');
      });
    });

    it('debe buscar por EAN', async () => {
      const results = await searchProducts(mockDB, '7790000001234', 'SUC_001');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].ean).toBe('7790000001234');
    });

    it('debe buscar por descripción', async () => {
      const results = await searchProducts(mockDB, 'fresco', 'SUC_001');

      expect(results.length).toBeGreaterThan(0);
    });

    it('debe retornar resultado vacío para query muy corto', async () => {
      const results = await searchProducts(mockDB, 'a', 'SUC_001');

      expect(results).toHaveLength(0);
    });

    it('debe incluir información de promoción', async () => {
      const results = await searchProducts(mockDB, 'pan', 'SUC_001');

      expect(results.length).toBeGreaterThan(0);
      const panResult = results.find((r) => r.nombre.includes('Pan'));
      expect(panResult?.promocionID).toBe('PROMO_001');
      expect(panResult?.precioOferta).toBe(0.6);
    });

    it('debe incluir precios de sucursal', async () => {
      const results = await searchProducts(mockDB, 'sancor', 'SUC_001');

      expect(results.length).toBeGreaterThan(0);
      results.forEach((r) => {
        expect(r.precioVenta).toBeGreaterThan(0);
        expect(r.stock).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('searchProductByEAN', () => {
    it('debe buscar producto por EAN exacto', async () => {
      const result = await searchProductByEAN(mockDB, '7790000001234', 'SUC_001');

      expect(result).not.toBeNull();
      expect(result?.nombre).toBe('Leche Entera 1L');
      expect(result?.ean).toBe('7790000001234');
    });

    it('debe retornar null si EAN no existe', async () => {
      const result = await searchProductByEAN(mockDB, '9999999999999', 'SUC_001');

      expect(result).toBeNull();
    });

    it('debe retornar null para EAN muy corto', async () => {
      const result = await searchProductByEAN(mockDB, '123', 'SUC_001');

      expect(result).toBeNull();
    });

    it('debe incluir información de promoción', async () => {
      const result = await searchProductByEAN(mockDB, '7790000001235', 'SUC_001');

      expect(result?.promocionID).toBe('PROMO_001');
      expect(result?.precioOferta).toBe(0.6);
    });

    it('debe incluir precio de sucursal', async () => {
      const result = await searchProductByEAN(mockDB, '7790000001234', 'SUC_001');

      expect(result?.precioVenta).toBe(2.5);
      expect(result?.stock).toBe(100);
    });

    it('debe manejar EAN con espacios', async () => {
      const result = await searchProductByEAN(mockDB, '  7790000001234  ', 'SUC_001');

      expect(result?.nombre).toBe('Leche Entera 1L');
    });
  });

  describe('getProductsByCategory', () => {
    it('debe retornar productos por categoría', async () => {
      const results = await getProductsByCategory(mockDB, 'Lácteos', 'SUC_001');

      expect(results.length).toBeGreaterThan(0);
      results.forEach((r) => {
        expect(r.categoria).toBe('Lácteos');
      });
    });

    it('debe respetar limit', async () => {
      const results = await getProductsByCategory(mockDB, 'Lácteos', 'SUC_001', 2);

      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('debe retornar vacío para categoría inexistente', async () => {
      const results = await getProductsByCategory(mockDB, 'NoExiste', 'SUC_001');

      expect(results).toHaveLength(0);
    });
  });

  describe('getBrands', () => {
    it('debe retornar lista de marcas únicas', async () => {
      const brands = await getBrands(mockDB);

      expect(brands.includes('La Serenísima')).toBe(true);
      expect(brands.includes('Bimbo')).toBe(true);
      expect(brands.includes('Sancor')).toBe(true);
    });

    it('debe estar ordenado alfabéticamente', async () => {
      const brands = await getBrands(mockDB);

      const sorted = [...brands].sort();
      expect(brands).toEqual(sorted);
    });
  });

  describe('getCategories', () => {
    it('debe retornar lista de categorías únicas', async () => {
      const categories = await getCategories(mockDB);

      expect(categories.includes('Lácteos')).toBe(true);
      expect(categories.includes('Panificados')).toBe(true);
    });

    it('debe estar ordenado alfabéticamente', async () => {
      const categories = await getCategories(mockDB);

      const sorted = [...categories].sort();
      expect(categories).toEqual(sorted);
    });
  });

  describe('Search performance', () => {
    it('debe buscar rápidamente con múltiples productos', async () => {
      const start = performance.now();
      const results = await searchProducts(mockDB, 'sancor', 'SUC_001');
      const end = performance.now();

      expect(end - start).toBeLessThan(100); // < 100ms
      expect(results.length).toBeGreaterThan(0);
    });
  });
});
