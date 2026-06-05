import { Database } from '@nozbe/watermelondb';
import { v4 as uuidv4 } from 'uuid';

/**
 * CartItem - Ítem en el carrito de compras
 */
export interface CartItem {
  cartItemID: string; // UUID local
  productoID: string;
  nombre: string;
  marca: string;
  categoria: string;
  ean: string;
  precioUnitario: number;
  precioOferta?: number; // Si hay promoción
  cantidad: number;
  promocionID?: string; // Si aplica
  descuento?: number; // Monto total de descuento
  subtotal: number; // cantidad * (precioOferta || precioUnitario)
  addedAt: number; // timestamp
}

/**
 * Cart - Carrito de compras para turno activo
 */
export interface Cart {
  items: CartItem[];
  total: number; // Suma de subtotales
  descuentoTotal: number; // Suma de descuentos aplicados
  cantidadProductos: number; // Cantidad total de productos
}

/**
 * Cargar carrito desde localStorage (en memoria)
 */
export function loadCartFromStorage(): Cart {
  try {
    const stored = localStorage.getItem('pos_cart');
    if (!stored) {
      return {
        items: [],
        total: 0,
        descuentoTotal: 0,
        cantidadProductos: 0,
      };
    }
    return JSON.parse(stored) as Cart;
  } catch (error) {
    console.warn('[Cart] Error cargando carrito:', error);
    return {
      items: [],
      total: 0,
      descuentoTotal: 0,
      cantidadProductos: 0,
    };
  }
}

/**
 * Guardar carrito en localStorage
 */
export function saveCartToStorage(cart: Cart): void {
  try {
    localStorage.setItem('pos_cart', JSON.stringify(cart));
  } catch (error) {
    console.error('[Cart] Error guardando carrito:', error);
  }
}

/**
 * Calcular totales del carrito
 */
function calculateCartTotals(items: CartItem[]): { total: number; descuentoTotal: number; cantidad: number } {
  let total = 0;
  let descuentoTotal = 0;
  let cantidad = 0;

  for (const item of items) {
    total += item.subtotal;
    descuentoTotal += item.descuento || 0;
    cantidad += item.cantidad;
  }

  return { total, descuentoTotal, cantidad };
}

/**
 * Agregar producto al carrito
 * Si ya existe, incrementa cantidad
 */
export function addToCart(
  producto: {
    productoID: string;
    nombre: string;
    marca: string;
    categoria: string;
    ean: string;
    precioVenta: number;
    precioOferta?: number;
    promocionID?: string;
  },
  cantidad: number = 1,
  currentCart?: Cart
): Cart {
  if (cantidad <= 0) {
    console.warn('[Cart] Cantidad debe ser > 0');
    return currentCart || loadCartFromStorage();
  }

  let cart = currentCart || loadCartFromStorage();

  // Buscar si el producto ya existe en carrito
  const existingIndex = cart.items.findIndex(
    (item) => item.productoID === producto.productoID && !item.promocionID // No duplicar si hay promo diferente
  );

  if (existingIndex >= 0) {
    // Incrementar cantidad
    const existingItem = cart.items[existingIndex];
    existingItem.cantidad += cantidad;
    existingItem.subtotal = existingItem.cantidad * (existingItem.precioOferta || existingItem.precioUnitario);
  } else {
    // Nuevo ítem
    const precioUnitario = producto.precioVenta;
    const precioOferta = producto.precioOferta;
    const tieneDescuento = precioOferta !== undefined && precioOferta < precioUnitario;
    const descuentoPorItem = tieneDescuento ? precioUnitario - precioOferta : 0;

    const newItem: CartItem = {
      cartItemID: uuidv4(),
      productoID: producto.productoID,
      nombre: producto.nombre,
      marca: producto.marca,
      categoria: producto.categoria,
      ean: producto.ean,
      precioUnitario,
      precioOferta: precioOferta,
      cantidad,
      promocionID: producto.promocionID,
      descuento: descuentoPorItem * cantidad,
      subtotal: cantidad * (precioOferta || precioUnitario),
      addedAt: Date.now(),
    };

    cart.items.push(newItem);
  }

  // Recalcular totales
  const { total, descuentoTotal, cantidad: totalCantidad } = calculateCartTotals(cart.items);
  cart.total = total;
  cart.descuentoTotal = descuentoTotal;
  cart.cantidadProductos = totalCantidad;

  saveCartToStorage(cart);
  console.log('[Cart] Producto agregado:', producto.nombre, 'Cant:', cantidad);

  return cart;
}

/**
 * Actualizar cantidad de ítem en carrito
 */
export function updateCartItemQty(cartItemID: string, newQuantity: number, currentCart?: Cart): Cart {
  let cart = currentCart || loadCartFromStorage();

  const itemIndex = cart.items.findIndex((item) => item.cartItemID === cartItemID);
  if (itemIndex < 0) {
    console.warn('[Cart] Ítem no encontrado:', cartItemID);
    return cart;
  }

  const item = cart.items[itemIndex];

  if (newQuantity <= 0) {
    // Remover ítem
    cart.items.splice(itemIndex, 1);
    console.log('[Cart] Ítem removido:', item.nombre);
  } else {
    // Actualizar cantidad
    item.cantidad = newQuantity;
    item.subtotal = newQuantity * (item.precioOferta || item.precioUnitario);
    const descuentoPorUnidad = (item.precioUnitario - (item.precioOferta || item.precioUnitario));
    item.descuento = descuentoPorUnidad * newQuantity;
    console.log('[Cart] Cantidad actualizada:', item.nombre, '→', newQuantity);
  }

  // Recalcular totales
  const { total, descuentoTotal, cantidad } = calculateCartTotals(cart.items);
  cart.total = total;
  cart.descuentoTotal = descuentoTotal;
  cart.cantidadProductos = cantidad;

  saveCartToStorage(cart);
  return cart;
}

/**
 * Remover ítem del carrito
 */
export function removeFromCart(cartItemID: string, currentCart?: Cart): Cart {
  return updateCartItemQty(cartItemID, 0, currentCart);
}

/**
 * Vaciar carrito completo
 */
export function clearCart(): Cart {
  const emptyCart: Cart = {
    items: [],
    total: 0,
    descuentoTotal: 0,
    cantidadProductos: 0,
  };
  saveCartToStorage(emptyCart);
  console.log('[Cart] Carrito vaciado');
  return emptyCart;
}

/**
 * Obtener carrito actual
 */
export function getCart(): Cart {
  return loadCartFromStorage();
}

/**
 * Calcular cambio (para pagos en efectivo)
 */
export function calculateChange(totalVenta: number, montoPagado: number): number {
  const cambio = montoPagado - totalVenta;
  return cambio >= 0 ? cambio : 0;
}

/**
 * Validar carrito antes de pago
 */
export function validateCart(cart: Cart): { valid: boolean; error?: string } {
  if (cart.items.length === 0) {
    return {
      valid: false,
      error: 'El carrito está vacío',
    };
  }

  if (cart.total <= 0) {
    return {
      valid: false,
      error: 'Total inválido',
    };
  }

  // Verificar que todas las cantidades sean válidas
  for (const item of cart.items) {
    if (item.cantidad <= 0) {
      return {
        valid: false,
        error: `Cantidad inválida en ${item.nombre}`,
      };
    }
  }

  return { valid: true };
}

/**
 * Convertir carrito a formato para ticket
 */
export function cartToTicketItems(cart: Cart): Array<{
  productoID: string;
  nombre: string;
  marca: string;
  cantidad: number;
  precioUnitario: number;
  precioOferta?: number;
  subtotal: number;
  promocionID?: string;
  descuento?: number;
}> {
  return cart.items.map((item) => ({
    productoID: item.productoID,
    nombre: item.nombre,
    marca: item.marca,
    cantidad: item.cantidad,
    precioUnitario: item.precioUnitario,
    precioOferta: item.precioOferta,
    subtotal: item.subtotal,
    promocionID: item.promocionID,
    descuento: item.descuento,
  }));
}

/**
 * Aplicar cupón/código de descuento (future)
 */
export function applyCoupon(code: string, currentCart?: Cart): { success: boolean; message: string; newTotal?: number } {
  // TODO: Validar código con backend
  // TODO: Recalcular totales con descuento
  return {
    success: false,
    message: 'Funcionalidad de cupones aún no disponible',
  };
}
