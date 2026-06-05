# 📌 REGLAS DE ORO DE DESARROLLO Y ARQUITECTURA

Este documento establece las directrices obligatorias de diseño, estructura, código limpio y buenas prácticas para la construcción del SaaS Local-First de Gestión de Comercios. El agente de desarrollo debe cumplir al 100% con estas reglas. No se aceptará código que quiebre estas definiciones.

---

## 🚀 1. STACK TECNOLÓGICO Y ESTRUCTURA MONOREPO

El proyecto se administra obligatoriamente bajo una arquitectura de **Monorepo** utilizando **Turborepo** o **Nx** con TypeScript estricto.

### Estructura de Carpetas del Cliente:
```text
mi-comercio-saas/
├── apps/
│   ├── mobile-app/            # React Native + Expo (POS Táctil y App Depósito)
│   └── web-app/               # React + Next.js (POS Escritorio y Backoffice Horizontal)
├── packages/
│   ├── shared-logic/          # CEREBRO: WatermelonDB, Handshakes, i18n, WebSockets
│   └── ui-theme/              # Tokens de diseño compartidos y config de Tailwind CSS