// @ts-nocheck — WatermelonDB queries, not type-checked in web context
import { Database } from '@nozbe/watermelondb';

/**
 * ProductSearchResult - Resultado de búsqueda de producto
 */
export interface ProductSearchResult {
  productoID: string;
  nombre: string;
  marca: string;
  categoria: string;
  ean: string;
  descripcion?: string;
  precioVenta: number;
  stock: number;
  promocionID?: string;
  promocionNombre?: string;
  precioOferta?: number;
}

/**
 * Buscar productos en WatermelonDB
 * Busca en campos: nombre, marca, categoría, EAN
 * Local-first: sin necesidad de backend
 */
export async function searchProducts(
  db: Database,
  query: string,
  sucursalID: string
): Promise<ProductSearchResult[]> {
  try {
    if (!query || query.length < 2) {
      return [];
    }

    const productosTable = db.get('productos');
    const preciosTable = db.get('precios_sucursal');
    const promocionesTable = db.get('promociones_local');

    // Búsqueda local (client-side filtering en WatermelonDB)
    const allProductos = await productosTable.query().fetch();

    // Filtrar por query (nombre, marca, categoría, EAN, descripción)
    const queryLower = query.toLowerCase();
    const matchedProductos = allProductos.filter((p) => {
      const nombre = (p.nombre || '').toLowerCase();
      const marca = (p.marca || '').toLowerCase();
      const categoria = (p.categoria || '').toLowerCase();
      const ean = (p.ean || '').toLowerCase();
      const desc = (p.descripcion || '').toLowerCase();

      return (
        nombre.includes(queryLower) ||
        marca.includes(queryLower) ||
        categoria.includes(queryLower) ||
        ean.includes(queryLower) ||
        desc.includes(queryLower)
      );
    });

    // Obtener precios por sucursal
    const precios = await preciosTable.query().fetch();
    const preciosByProducto = new Map();
    for (const precio of precios) {
      if (precio.sucursal_id === sucursalID) {
        preciosByProducto.set(precio.producto_id, {
          precioVenta: precio.precio_venta,
          stock: precio.stock,
        });
      }
    }

    // Obtener promociones activas
    const promociones = await promocionesTable.query().fetch();
    const promocionesByProducto = new Map();
    const now = Date.now();
    for (const promo of promociones) {
      if (
        promo.estado === 'ACTIVA' &&
        new Date(promo.fecha_inicio).getTime() <= now &&
        new Date(promo.fecha_fin).getTime() >= now
      ) {
        promocionesByProducto.set(promo.producto_id, {
          promocionID: promo.promocion_id,
          nombre: promo.nombre,
          precioOferta: promo.precio_oferta,
        });
      }
    }

    // Mapear resultados
    const results: ProductSearchResult[] = matchedProductos.map((p) => {
      const precioInfo = preciosByProducto.get(p.producto_id) || { precioVenta: p.precio_costo * 1.3, stock: 0 };
      const promoInfo = promocionesByProducto.get(p.producto_id);

      return {
        productoID: p.producto_id,
        nombre: p.nombre,
        marca: p.marca,
        categoria: p.categoria,
        ean: p.ean,
        descripcion: p.descripcion,
        precioVenta: precioInfo.precioVenta,
        stock: precioInfo.stock,
        promocionID: promoInfo?.promocionID,
        promocionNombre: promoInfo?.nombre,
        precioOferta: promoInfo?.precioOferta,
      };
    });

    console.log(`[Search] Búsqueda "${query}" en sucursal ${sucursalID}: ${results.length} resultados`);
    return results;
  } catch (error) {
    console.error('[Search] Error buscando productos:', error);
    return [];
  }
}

/**
 * Buscar producto por EAN/Código de barras
 * Búsqueda exacta y rápida
 */
export async function searchProductByEAN(
  db: Database,
  ean: string,
  sucursalID: string
): Promise<ProductSearchResult | null> {
  try {
    if (!ean || ean.length < 8) {
      return null;
    }

    const productosTable = db.get('productos');
    const preciosTable = db.get('precios_sucursal');
    const promocionesTable = db.get('promociones_local');

    // Búsqueda por EAN exacto
    const allProductos = await productosTable.query().fetch();
    const producto = allProductos.find((p) => p.ean === ean.trim());

    if (!producto) {
      console.log(`[Search] EAN no encontrado: ${ean}`);
      return null;
    }

    // Obtener precio para sucursal
    const precios = await preciosTable.query().fetch();
    const precioInfo = precios.find((p) => p.producto_id === producto.producto_id && p.sucursal_id === sucursalID);

    if (!precioInfo) {
      console.warn(`[Search] Precio no encontrado para ${producto.nombre} en sucursal ${sucursalID}`);
      return null;
    }

    // Buscar promoción activa
    const promociones = await promocionesTable.query().fetch();
    const now = Date.now();
    const promo = promociones.find(
      (p) =>
        p.producto_id === producto.producto_id &&
        p.estado === 'ACTIVA' &&
        new Date(p.fecha_inicio).getTime() <= now &&
        new Date(p.fecha_fin).getTime() >= now
    );

    const result: ProductSearchResult = {
      productoID: producto.producto_id,
      nombre: producto.nombre,
      marca: producto.marca,
      categoria: producto.categoria,
      ean: producto.ean,
      descripcion: producto.descripcion,
      precioVenta: precioInfo.precio_venta,
      stock: precioInfo.stock,
      promocionID: promo?.promocion_id,
      promocionNombre: promo?.nombre,
      precioOferta: promo?.precio_oferta,
    };

    console.log(`[Search] EAN encontrado: ${result.nombre}`);
    return result;
  } catch (error) {
    console.error('[Search] Error buscando por EAN:', error);
    return null;
  }
}

/**
 * Obtener productos por categoría
 */
export async function getProductsByCategory(
  db: Database,
  categoria: string,
  sucursalID: string,
  limit: number = 50
): Promise<ProductSearchResult[]> {
  try {
    const productosTable = db.get('productos');
    const preciosTable = db.get('precios_sucursal');
    const promocionesTable = db.get('promociones_local');

    // Filtrar por categoría
    const allProductos = await productosTable.query().fetch();
    const matchedProductos = allProductos
      .filter((p) => p.categoria?.toLowerCase() === categoria.toLowerCase())
      .slice(0, limit);

    // Obtener precios
    const precios = await preciosTable.query().fetch();
    const preciosByProducto = new Map();
    for (const precio of precios) {
      if (precio.sucursal_id === sucursalID) {
        preciosByProducto.set(precio.producto_id, {
          precioVenta: precio.precio_venta,
          stock: precio.stock,
        });
      }
    }

    // Obtener promociones
    const promociones = await promocionesTable.query().fetch();
    const promocionesByProducto = new Map();
    const now = Date.now();
    for (const promo of promociones) {
      if (
        promo.estado === 'ACTIVA' &&
        new Date(promo.fecha_inicio).getTime() <= now &&
        new Date(promo.fecha_fin).getTime() >= now
      ) {
        promocionesByProducto.set(promo.producto_id, {
          promocionID: promo.promocion_id,
          nombre: promo.nombre,
          precioOferta: promo.precio_oferta,
        });
      }
    }

    // Mapear
    const results: ProductSearchResult[] = matchedProductos.map((p) => {
      const precioInfo = preciosByProducto.get(p.producto_id) || { precioVenta: 0, stock: 0 };
      const promoInfo = promocionesByProducto.get(p.producto_id);

      return {
        productoID: p.producto_id,
        nombre: p.nombre,
        marca: p.marca,
        categoria: p.categoria,
        ean: p.ean,
        precioVenta: precioInfo.precioVenta,
        stock: precioInfo.stock,
        promocionID: promoInfo?.promocionID,
        promocionNombre: promoInfo?.nombre,
        precioOferta: promoInfo?.precioOferta,
      };
    });

    console.log(`[Search] Categoría ${categoria}: ${results.length} productos`);
    return results;
  } catch (error) {
    console.error('[Search] Error obteniendo categoría:', error);
    return [];
  }
}

/**
 * Obtener marcas disponibles (para filtros)
 */
export async function getBrands(db: Database): Promise<string[]> {
  try {
    const productosTable = db.get('productos');
    const allProductos = await productosTable.query().fetch();

    const brands = new Set<string>();
    for (const p of allProductos) {
      if (p.marca) brands.add(p.marca);
    }

    return Array.from(brands).sort();
  } catch (error) {
    console.error('[Search] Error obteniendo marcas:', error);
    return [];
  }
}

/**
 * Obtener categorías disponibles (para filtros)
 */
export async function getCategories(db: Database): Promise<string[]> {
  try {
    const productosTable = db.get('productos');
    const allProductos = await productosTable.query().fetch();

    const categories = new Set<string>();
    for (const p of allProductos) {
      if (p.categoria) categories.add(p.categoria);
    }

    return Array.from(categories).sort();
  } catch (error) {
    console.error('[Search] Error obteniendo categorías:', error);
    return [];
  }
}
