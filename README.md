# Gestión de Comercios — SaaS POS Multi-sucursal

Sistema completo de Punto de Venta con operación **offline-first** para dispositivos móviles Android/iOS, panel web de backoffice y backend Go. Arquitectura **Turborepo monorepo**.

---

## Arquitectura general

```
gestion_comercios/
├── apps/
│   ├── mobile-app/       → Expo React Native (POS offline-first)
│   ├── web-app/          → Next.js (Backoffice)
│   └── landing/          → Landing page estática (Nginx)
├── backend-go/           → API REST + WebSocket (Go standard library)
├── packages/
│   ├── shared-logic/     → Lógica de negocio compartida (TypeScript)
│   └── ui-theme/         → Tokens de diseño compartidos
├── postgres/             → Migraciones SQL ordenadas (001–010)
└── nginx/                → Reverse proxy + SSL
```

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Mobile POS | Expo SDK 51, React Native, WatermelonDB (SQLite), Expo Router |
| Backoffice | Next.js 14, React 18 |
| Backend | Go 1.22, `net/http` stdlib, `gorilla/websocket` |
| Base de datos | PostgreSQL 15 |
| Cache / OCC | Redis 7 (opcional — CAS versionado) |
| Auth | JWT (HS256), PIN hash SHA-256 |
| Deploy | Docker Compose, Nginx reverse proxy |
| Monorepo | Turborepo |

---

## Estado por fases

### ✅ Fase 1 — Núcleo funcional (completo)

- [x] Autenticación multi-rol: GESTOR, ENCARGADO, CAJERO, DEPOSITO
- [x] Enrolamiento QR de dispositivos POS
- [x] Apertura/cierre de turnos de caja con validación de tickets pendientes
- [x] POS offline-first: WatermelonDB SQLite + queue FIFO con retries
- [x] WebSocket Hub organizado por sucursal (sin estado en Redis)
- [x] OCC (Optimistic Concurrency Control) via CAS Redis para mutaciones
- [x] Autorización remota: CAJERO → ENCARGADO/ADMIN por WebSocket
- [x] Migraciones SQL versionadas (001–010)
- [x] Docker Compose dev + prod

### ✅ Fase 2 — Catálogo y promociones (completo)

- [x] Búsqueda de productos en tiempo real (nombre / marca / categoría / EAN)
- [x] Motor de evaluación de promociones: DESCUENTO_%, PRECIO_FIJO, 2x1, 3x2, COMBO
- [x] Confirmación de tickets con ítems, descuentos y múltiples medios de pago
- [x] Notificación WS `PRECIO_UPDATE` / `PROMO_ACTIVADA` / `PROMO_DESACTIVADA`
- [x] Descuento de stock al confirmar ticket (`stock_sucursal`)
- [x] i18n (español / inglés) en shared-logic
- [x] Permisos por rol (`canVoid`, `canOpenDiscount`, `canManageInventory`, etc.)
- [x] Sincronización de tiempo cliente-servidor (time drift)
- [x] Outbox con retries exponenciales para tickets offline

### ✅ Fase 3 — Backoffice completo + Reportes (completo)

#### Backend Go (nuevos endpoints)
| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/products` | Listar productos con precios y stock real (PostgreSQL) |
| `POST` | `/products` | Crear producto + precio + stock en transacción |
| `PUT` | `/products/:id` | Actualizar precio/stock, opcionalmente replicar a todas las sucursales |
| `DELETE` | `/products/:id` | Soft-delete (activo = FALSE) |
| `GET` | `/products/search?q=` | Búsqueda full-text real (nombre/marca/categoría/EAN) |
| `GET` | `/products/by-barcode?ean=` | Lookup por EAN con promo activa |
| `POST` | `/promotions` | Crear promoción con fechas |
| `PUT` | `/promotions/:id` | Actualizar nombre/descuento/fechas |
| `DELETE` | `/promotions/:id` | Desactivar promoción + WS broadcast |
| `GET` | `/reports/daily?fecha=` | Resumen del día por turno (ventas, tickets) |
| `GET` | `/reports/medios-pago?turno_id=` | Desglose por medio de pago |
| `GET` | `/reports/stock-critico?sucursal_id=` | Productos con stock ≤ stock_mínimo |
| `GET` | `/devices` | Listar dispositivos autorizados del comercio |
| `POST` | `/devices/generate-code` | Generar código de enrolamiento (6h) |

#### Backoffice web (páginas nuevas)
- **`/backoffice/promociones`** — CRUD completo de promociones: crear con búsqueda de producto en vivo, visualizar días restantes, desactivar
- **`/backoffice/dispositivos`** — Panel de dispositivos: ver estado ACTIVO/BLOQUEADO/PENDIENTE, desbloquear remotamente, generar código de enrolamiento

#### Correcciones
- `ticket.go`: descuento de stock migrado a `stock_sucursal.cantidad` (antes apuntaba a tabla inexistente `inventario_sucursal`)
- `product.go`: queries reales a PostgreSQL con JOIN a `precios_sucursal`, `stock_sucursal` y promociones activas (LATERAL JOIN)
- `db/models/index.ts`: interfaces TypeScript de dominio para WatermelonDB (sin conflictos de nombres)

---

## Esquema de base de datos

```
comercios → sucursales → dispositivos_autorizados
                       → turnos → tickets → ticket_items
                                          → ticket_pagos
                       → productos → precios_sucursal
                                   → stock_sucursal
                                   → promociones
                       → auditoria_stock
```

**Migraciones:** `postgres/001_create_comercios.sql` … `postgres/010_create_auditoria.sql`

---

## API principal

### Auth
```
POST /auth/register     → Registrar nuevo comercio (primer usuario)
POST /auth/login        → Login gestor (email + password)
POST /auth/validate-pin → Login cajero (PIN de 4 dígitos)
```

### POS (requieren JWT)
```
POST /devices/enroll            → Enrolamiento de dispositivo (QR)
POST /devices/generate-code     → Generar código de enrolamiento
GET  /devices                   → Listar dispositivos del comercio
POST /turns/open                → Abrir turno de caja
POST /turns/close               → Cerrar turno de caja
GET  /turns/active              → Turno activo del dispositivo
POST /tickets/confirm           → Confirmar ticket de venta
GET  /tickets?turno_id=         → Tickets de un turno
GET  /products/search?q=        → Buscar productos
GET  /products/by-barcode?ean=  → Buscar por código de barras
```

### WebSocket
```
GET /ws?token=<JWT>             → Conexión WS autenticada
```

**Mensajes WS emitidos por el servidor:**
- `CONNECTED` — Bienvenida con timestamp del servidor
- `PRECIO_UPDATE` — Cambio de precio de un producto
- `PROMO_ACTIVADA` / `PROMO_DESACTIVADA` — Cambio de promociones
- `TICKET_CONFIRMED` — Nuevo ticket confirmado en la sucursal
- `TURN_OPENED` / `TURN_CLOSED` — Eventos de turno
- `STOCK_UPDATE` — Actualización de stock
- `AUTH_REQUEST` / `AUTH_ACK` / `AUTH_REJECT` — Autorización remota
- `VERSION_CONFLICT` — Conflicto OCC (se devuelve la versión actual)

---

## Variables de entorno

```bash
# backend-go/.env
DATABASE_URL=postgres://user:password@localhost:5432/comercios_db?sslmode=disable
JWT_SECRET=tu-secreto-seguro-de-produccion
REDIS_URL=redis://localhost:6379          # Opcional — OCC desactivado si no está
PORT=8080

# apps/web-app/.env.local
NEXT_PUBLIC_API_URL=http://localhost:8080
```

Ver `.env.example` para la lista completa.

---

## Desarrollo local

```bash
# 1. Levantar PostgreSQL + Redis
docker compose up -d postgres redis

# 2. Aplicar migraciones
for f in postgres/*.sql; do
  psql "$DATABASE_URL" -f "$f"
done

# 3. Backend Go
cd backend-go && go run main.go

# 4. Backoffice web
cd apps/web-app && npm run dev

# 5. App móvil
cd apps/mobile-app && npx expo start
```

---

## Deploy producción

```bash
# Build + push imágenes
docker compose -f docker-compose.prod.yml build

# Deploy con SSL (Nginx + Certbot)
bash deploy.sh
```

---

## Decisiones de diseño relevantes

| Decisión | Motivo |
|----------|--------|
| Go stdlib `net/http` (sin framework) | Mínimas dependencias, boot rápido |
| WatermelonDB en mobile | Rendimiento nativo SQLite, soporte offline real |
| JWT en headers internos (X-Comercio-ID, etc.) | Evitar re-parsear el token en cada handler |
| OCC via Redis CAS | Sincronización de versiones sin locks de DB |
| LATERAL JOIN para promociones | Obtener la primera promo activa en un solo query |
| Soft-delete en productos (`activo = FALSE`) | Mantener integridad referencial de tickets históricos |
| `stock_sucursal` por sucursal | Soporte multi-sucursal con stocks independientes |
| Outbox con retries exponenciales | Garantía de entrega de tickets offline |

---

## Licencia

Privado — uso interno.
