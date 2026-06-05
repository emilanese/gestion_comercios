import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  addToCart,
  removeFromCart,
  updateCartItemQty,
  clearCart,
  getCart,
  calculateChange,
  validateCart,
  cartToTicketItems,
  loadCartFromStorage,
  saveCartToStorage,
  Cart,
} from './cart';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

global.localStorage = localStorageMock as any;

describe('Shopping Cart', () => {
  beforeEach(() => {
    clearCart();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('addToCart', () => {
    it('debe agregar primer producto al carrito vacío', () => {
      const product = {
        productoID: 'PROD_001',
        nombre: 'Leche 1L',
        marca: 'La Serenísima',
        categoria: 'Lácteos',
        ean: '7790000001234',
        precioVenta: 2.5,
      };

      const cart = addToCart(product, 2);

      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].nombre).toBe('Leche 1L');
      expect(cart.items[0].cantidad).toBe(2);
      expect(cart.total).toBe(5.0); // 2 * 2.5
      expect(cart.cantidadProductos).toBe(2);
    });

    it('debe incrementar cantidad si producto ya existe', () => {
      const product = {
        productoID: 'PROD_001',
        nombre: 'Pan',
        marca: 'Bimbo',
        categoria: 'Panificados',
        ean: '7790000001235',
        precioVenta: 1.2,
      };

      let cart = addToCart(product, 1);
      expect(cart.cantidadProductos).toBe(1);

      cart = addToCart(product, 2, cart);
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].cantidad).toBe(3);
      expect(cart.cantidadProductos).toBe(3);
    });

    it('debe aplicar promoción si está disponible', () => {
      const product = {
        productoID: 'PROD_002',
        nombre: 'Pan 2x1',
        marca: 'Bimbo',
        categoria: 'Panificados',
        ean: '7790000001236',
        precioVenta: 1.2,
        precioOferta: 0.6,
        promocionID: 'PROMO_001',
      };

      const cart = addToCart(product, 2);

      expect(cart.items[0].precioOferta).toBe(0.6);
      expect(cart.items[0].subtotal).toBe(1.2); // 2 * 0.6
      expect(cart.descuentoTotal).toBeGreaterThan(0);
    });

    it('debe rechazar cantidad <= 0', () => {
      const product = {
        productoID: 'PROD_001',
        nombre: 'Leche',
        marca: 'Marca',
        categoria: 'Cat',
        ean: '123456789',
        precioVenta: 2.5,
      };

      const cart = addToCart(product, 0);
      expect(cart.items).toHaveLength(0);
    });

    it('debe persistir en localStorage', () => {
      const product = {
        productoID: 'PROD_001',
        nombre: 'Producto',
        marca: 'Marca',
        categoria: 'Cat',
        ean: '123456789',
        precioVenta: 10,
      };

      addToCart(product, 1);
      const loaded = loadCartFromStorage();

      expect(loaded.items).toHaveLength(1);
      expect(loaded.items[0].nombre).toBe('Producto');
    });
  });

  describe('updateCartItemQty', () => {
    it('debe actualizar cantidad de ítem', () => {
      const product = {
        productoID: 'PROD_001',
        nombre: 'Leche',
        marca: 'Marca',
        categoria: 'Cat',
        ean: '123456789',
        precioVenta: 2.5,
      };

      let cart = addToCart(product, 1);
      const itemID = cart.items[0].cartItemID;

      cart = updateCartItemQty(itemID, 5, cart);

      expect(cart.items[0].cantidad).toBe(5);
      expect(cart.total).toBe(12.5); // 5 * 2.5
    });

    it('debe remover ítem si cantidad es 0', () => {
      const product = {
        productoID: 'PROD_001',
        nombre: 'Leche',
        marca: 'Marca',
        categoria: 'Cat',
        ean: '123456789',
        precioVenta: 2.5,
      };

      let cart = addToCart(product, 2);
      const itemID = cart.items[0].cartItemID;

      cart = updateCartItemQty(itemID, 0, cart);

      expect(cart.items).toHaveLength(0);
      expect(cart.total).toBe(0);
    });

    it('debe recalcular total correctamente', () => {
      let cart: Cart = {
        items: [],
        total: 0,
        descuentoTotal: 0,
        cantidadProductos: 0,
      };

      const p1 = {
        productoID: 'PROD_001',
        nombre: 'Leche',
        marca: 'M1',
        categoria: 'C1',
        ean: '1',
        precioVenta: 2.5,
      };
      const p2 = {
        productoID: 'PROD_002',
        nombre: 'Pan',
        marca: 'M2',
        categoria: 'C2',
        ean: '2',
        precioVenta: 1.2,
      };

      cart = addToCart(p1, 2, cart);
      cart = addToCart(p2, 3, cart);
      expect(cart.total).toBe(8.6); // (2*2.5) + (3*1.2)

      const item2ID = cart.items[1].cartItemID;
      cart = updateCartItemQty(item2ID, 1, cart);
      expect(cart.total).toBe(6.2); // (2*2.5) + (1*1.2)
    });
  });

  describe('removeFromCart', () => {
    it('debe remover ítem del carrito', () => {
      const product = {
        productoID: 'PROD_001',
        nombre: 'Leche',
        marca: 'Marca',
        categoria: 'Cat',
        ean: '123456789',
        precioVenta: 2.5,
      };

      let cart = addToCart(product, 1);
      const itemID = cart.items[0].cartItemID;

      cart = removeFromCart(itemID, cart);

      expect(cart.items).toHaveLength(0);
      expect(cart.total).toBe(0);
    });
  });

  describe('clearCart', () => {
    it('debe vaciar carrito completamente', () => {
      const product = {
        productoID: 'PROD_001',
        nombre: 'Leche',
        marca: 'Marca',
        categoria: 'Cat',
        ean: '123456789',
        precioVenta: 2.5,
      };

      addToCart(product, 5);
      const cleared = clearCart();

      expect(cleared.items).toHaveLength(0);
      expect(cleared.total).toBe(0);
      expect(cleared.cantidadProductos).toBe(0);
    });
  });

  describe('calculateChange', () => {
    it('debe calcular cambio correctamente', () => {
      const change = calculateChange(10, 20);
      expect(change).toBe(10);
    });

    it('debe retornar 0 si no hay cambio', () => {
      const change = calculateChange(10, 10);
      expect(change).toBe(0);
    });

    it('debe retornar 0 si monto pagado es menor', () => {
      const change = calculateChange(20, 10);
      expect(change).toBe(0);
    });
  });

  describe('validateCart', () => {
    it('debe retornar error si carrito está vacío', () => {
      const cart = clearCart();
      const result = validateCart(cart);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('vacío');
    });

    it('debe ser válido con productos', () => {
      const product = {
        productoID: 'PROD_001',
        nombre: 'Leche',
        marca: 'Marca',
        categoria: 'Cat',
        ean: '123456789',
        precioVenta: 2.5,
      };

      const cart = addToCart(product, 1);
      const result = validateCart(cart);

      expect(result.valid).toBe(true);
    });
  });

  describe('cartToTicketItems', () => {
    it('debe convertir carrito a formato de ticket', () => {
      const product = {
        productoID: 'PROD_001',
        nombre: 'Leche',
        marca: 'La Serenísima',
        categoria: 'Lácteos',
        ean: '123456789',
        precioVenta: 2.5,
        precioOferta: 2.0,
        promocionID: 'PROMO_001',
      };

      const cart = addToCart(product, 2);
      const ticketItems = cartToTicketItems(cart);

      expect(ticketItems).toHaveLength(1);
      expect(ticketItems[0].nombre).toBe('Leche');
      expect(ticketItems[0].cantidad).toBe(2);
      expect(ticketItems[0].precioOferta).toBe(2.0);
      expect(ticketItems[0].subtotal).toBe(4.0);
    });
  });

  describe('Múltiples productos', () => {
    it('debe manejar carrito con múltiples productos', () => {
      let cart: Cart = {
        items: [],
        total: 0,
        descuentoTotal: 0,
        cantidadProductos: 0,
      };

      const products = [
        {
          productoID: 'PROD_001',
          nombre: 'Leche 1L',
          marca: 'La Serenísima',
          categoria: 'Lácteos',
          ean: '7790000001234',
          precioVenta: 2.5,
        },
        {
          productoID: 'PROD_002',
          nombre: 'Pan de Sándwich',
          marca: 'Bimbo',
          categoria: 'Panificados',
          ean: '7790000001235',
          precioVenta: 1.2,
        },
        {
          productoID: 'PROD_003',
          nombre: 'Yogur Entero',
          marca: 'Sancor',
          categoria: 'Lácteos',
          ean: '7790000001236',
          precioVenta: 1.8,
        },
      ];

      for (const p of products) {
        cart = addToCart(p, 2, cart);
      }

      expect(cart.items).toHaveLength(3);
      expect(cart.cantidadProductos).toBe(6); // 2 * 3
      expect(cart.total).toBe(10.0); // (2*2.5) + (2*1.2) + (2*1.8)
    });

    it('debe mantener carrito persistente entre sesiones', () => {
      const product = {
        productoID: 'PROD_001',
        nombre: 'Leche',
        marca: 'Marca',
        categoria: 'Cat',
        ean: '123456789',
        precioVenta: 2.5,
      };

      addToCart(product, 3);

      // Simular "nueva sesión"
      const loaded = loadCartFromStorage();
      expect(loaded.items).toHaveLength(1);
      expect(loaded.items[0].cantidad).toBe(3);
      expect(loaded.total).toBe(7.5);
    });
  });
});
