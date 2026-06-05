# ─────────────────────────────────────────────────────────────────────────────
# AVANTI Web App — Dockerfile de producción
# Multi-stage build: Node.js compila → Nginx sirve los statics
#
# Stage 1 (builder): instala dependencias y hace el build de Next.js
# Stage 2 (runner):  Next.js standalone server (mínimo, sin node_modules completos)
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar manifests primero (cache de capas)
COPY package*.json ./
COPY apps/web-app/package*.json ./apps/web-app/
COPY packages/shared-logic/package*.json ./packages/shared-logic/
COPY packages/ui-theme/package*.json ./packages/ui-theme/
COPY turbo.json ./

# Instalar dependencias del workspace
RUN npm ci --workspace=apps/web-app --workspace=packages/shared-logic --workspace=packages/ui-theme

# Copiar código fuente
COPY apps/web-app ./apps/web-app
COPY packages/shared-logic ./packages/shared-logic
COPY packages/ui-theme ./packages/ui-theme
COPY tsconfig.json ./

# Build Next.js con output standalone (no necesita node_modules en producción)
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build --workspace=apps/web-app

# ── Stage 2: Runner ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Usuario no-root por seguridad
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid  1001 nextjs

# Copiar solo lo necesario del build (standalone minimiza el tamaño)
COPY --from=builder /app/apps/web-app/public            ./public
COPY --from=builder --chown=nextjs:nodejs \
     /app/apps/web-app/.next/standalone                  ./
COPY --from=builder --chown=nextjs:nodejs \
     /app/apps/web-app/.next/static                      ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# next.config.js debe tener output: 'standalone' habilitado
CMD ["node", "server.js"]
