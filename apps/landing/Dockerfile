# ─────────────────────────────────────────────────────────────────────────────
# AVANTI Landing Page — Dockerfile
# HTML/CSS estático servido por Nginx Alpine.
# Imagen final: ~25MB
# ─────────────────────────────────────────────────────────────────────────────

FROM nginx:1.25-alpine

# Copiar el contenido estático
COPY . /usr/share/nginx/html

# Config nginx mínima para SPA (rutas no existentes → index.html)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
