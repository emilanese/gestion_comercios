# 🏪 Mi Comercio SaaS - Sistema Local-First para Gestión de Comercios

Sistema completo de gestión para comercios minoristas con POS táctil/web, depósito, backoffice y sincronización en tiempo real.

## 🎯 Arquitectura

```
mi-comercio-saas/
├── apps/
│   ├── mobile-app/              # React Native Expo (POS Móvil + Depósito)
│   └── web-app/                 # Next.js (POS Web + Backoffice)
├── packages/
│   ├── shared-logic/            # Core: WatermelonDB, Sync, i18n
│   └── ui-theme/                # Diseño compartido (Tailwind + Radix UI)
├── backend-go/                  # Gestor Cloud (Go + PostgreSQL + Redis)
└── postgres/                    # Migrations SQL

```

## 🚀 Quick Start

### Prerequisitos
- Node.js 18+
- Go 1.21+
- Docker y Docker Compose (para PostgreSQL + Redis)
- PostgreSQL 16+
- Redis 7+

### 1. Instalar dependencias

```bash
npm install
```

### 2. Iniciar infraestructura (Docker)

```bash
docker-compose up -d
```

### 3. Crear tablas en PostgreSQL

```bash
psql -h localhost -U comercios_user -d comercios_db -f postgres/001_create_comercios.sql
psql -h localhost -U comercios_user -d comercios_db -f postgres/002_create_sucursales.sql
psql -h localhost -U comercios_user -d comercios_db -f postgres/003_create_dispositivos_autorizados.sql
psql -h localhost -U comercios_user -d comercios_db -f postgres/004_create_suscripciones.sql
psql -h localhost -U comercios_user -d comercios_db -f postgres/005_create_catalogo_global_ean.sql
```

### 4. Iniciar desarrollo

```bash
# Terminal 1: Monorepo
npm run dev

# Terminal 2: Backend Go
cd backend-go
go run main.go
```

## 📦 Monorepo Turborepo

### Scripts principales

```bash
npm run build          # Build todos los packages/apps
npm run dev            # Dev mode para todos
npm run test           # Ejecutar tests
npm run test:watch     # Tests con watch
npm run lint           # Linting
npm run type-check     # TypeScript strict check
```

## 🗄️ Estructura de Base de Datos

### Local (WatermelonDB - Cliente)
- `productos`: Catálogo de artículos
- `precios_sucursal`: Precios flexibles por sucursal
- `stock_sucursal`: Inventario neto
- `medios_pago`: Métodos de pago configurados
- `historial_tickets_local`: Tickets vendidos
- `ticket_detalles_local`: Items de cada ticket
- `ticket_pagos_local`: Desglose de pagos por método
- `auditoria_stock_local`: Log completo de movimientos
- `historial_precios_costos_local`: Historial de cambios de precios
- `promociones_local`: Ofertas activas/programadas

### Cloud (PostgreSQL - Servidor)
- `comercios`: Multi-tenant SaaS
- `sucursales`: Ubicaciones por comercio
- `dispositivos_autorizados`: Terminales POS autorizadas
- `suscripciones`: Gestión de planes y pagos
- `catalogo_global_ean`: Catálogo EAN centralizado

## 🔄 Sincronización

### Handshake Time-Drift
Todos los timestamps del cliente se corrigen automáticamente al conectar:
```
Delta Horario = Hora_Servidor - (Hora_Cliente + Latencia/2)
Timestamp_Evento = Hora_Local_Actual + Delta Horario
```

### WebSocket Pub/Sub
- Canal por sucursal: `canal_sucursal_{sucursal_id}`
- Canal global: `canal_comercio_{comercio_id}` (sincronización de backends)

## 🧪 Testing

```bash
# Tests con Vitest
npm run test

# Con cobertura
npm run test -- --coverage
```

**Requerimientos:** 95% cobertura en `shared-logic`

## 📚 Documentación

- [Casos de Uso](./casos%20de%20uso.txt)
- [Diagrama de Datos](./der.txt)
- [Reglas de Oro](./golden-rules.md)
- [Blueprint Arquitectónico](./blueprint.txt)

## 🎯 Roadmap (Fases)

### Fase 1: Fundacional ✅
- [x] Scaffold Turborepo + estructura
- [x] WatermelonDB 10 modelos
- [x] Handshake Time-Drift
- [x] i18n (es, es-AR, en)
- [x] Backend Go mínimo
- [x] PostgreSQL 5 tablas
- [x] Tests Handshake + i18n

### Fase 2: POS (próxima)
- Enrolamiento QR
- Login local + PIN
- Venta con escáner dual
- Pago mixto
- Cierre de turno

### Fase 3: Stock
- Ajuste de inventario
- Ingreso de mercadería
- Egreso rápido

### Fase 4: Backoffice
- Alta de promociones
- Ciclo de vida ofertas
- Dashboard
- Suscripciones (Stripe mock)

## ⚙️ Configuración

### Variables de entorno

```bash
# .env
DATABASE_URL=postgres://comercios_user:comercios_pass@localhost:5432/comercios_db
REDIS_URL=redis://localhost:6379
PORT=8080
```

## 🛠️ Desarrollo

### Estructura de código
- **shared-logic** es el NÚCLEO - toda lógica de negocio vive aquí
- **mobile-app** y **web-app** son capas tontas de UI
- **ui-theme** exporta componentes reutilizables
- **backend-go** maneja sincronización centralizada + webhooks

### Reglas estrictas
1. ✅ Forbidding hardcoded strings → usar i18n
2. ✅ No timestamps nativos → usar timeDrift
3. ✅ Idempotencia obligatoria → en stock + pagos
4. ✅ POS no descuenta localmente → lo hace el Backoffice
5. ✅ Tests obligatorios → 95% cobertura

## 📞 Soporte

Para dudas sobre especificaciones, revisar los documentos adjuntos o contactar al equipo.

---

**Estado:** Fase 1 Completada ✅  
**Última actualización:** Junio 3, 2026  
**Próximo milestone:** Fase 2 - POS
