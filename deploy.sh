#!/bin/bash
# =============================================================================
# AVANTI — Script de Deploy para VPS Ubuntu 24.04
# Repositorio: https://github.com/emilanese/gestion_comercios
#
# Uso:
#   ssh root@2.25.175.233
#   wget https://raw.githubusercontent.com/emilanese/gestion_comercios/main/deploy.sh
#   bash deploy.sh
#
# Lo que hace este script:
#   1. Actualiza el sistema
#   2. Instala Docker CE + Docker Compose Plugin
#   3. Clona el repositorio
#   4. Te pide los secrets de producción (.env)
#   5. Emite los certificados SSL (Let's Encrypt)
#   6. Levanta el stack completo en producción
# =============================================================================

set -e  # Abortar si cualquier comando falla

# ─── Colores ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log()     { echo -e "${GREEN}[✓]${NC} $1"; }
info()    { echo -e "${BLUE}[i]${NC} $1"; }
warn()    { echo -e "${YELLOW}[!]${NC} $1"; }
error()   { echo -e "${RED}[✗] ERROR: $1${NC}"; exit 1; }
header()  { echo -e "\n${BOLD}${CYAN}══════════════════════════════════════════════${NC}"; \
            echo -e "${BOLD}${CYAN}  $1${NC}"; \
            echo -e "${BOLD}${CYAN}══════════════════════════════════════════════${NC}\n"; }

# ─── Configuración ────────────────────────────────────────────────────────────
DOMAIN="avanti-retail.cloud"
REPO_URL="https://github.com/emilanese/gestion_comercios.git"
INSTALL_DIR="/opt/avanti"
PROJECT_NAME="avanti"

# ─── Verificaciones previas ───────────────────────────────────────────────────
header "AVANTI — Deploy Automático VPS"

if [ "$EUID" -ne 0 ]; then
  error "Este script debe ejecutarse como root. Usá: sudo bash deploy.sh"
fi

info "Servidor: $(hostname) | $(uname -r)"
info "Dominio: $DOMAIN"
info "Directorio de instalación: $INSTALL_DIR"

# ─── PASO 1: Actualizar sistema ───────────────────────────────────────────────
header "PASO 1/6 — Actualizar sistema"
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq git curl wget ca-certificates gnupg lsb-release
log "Sistema actualizado"

# ─── PASO 2: Instalar Docker CE ───────────────────────────────────────────────
header "PASO 2/6 — Instalar Docker CE"

if command -v docker &> /dev/null; then
  log "Docker ya está instalado: $(docker --version)"
else
  info "Instalando Docker CE..."
  # Clave GPG oficial de Docker
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
    gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  # Repositorio de Docker
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
    tee /etc/apt/sources.list.d/docker.list > /dev/null

  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin

  systemctl enable docker
  systemctl start docker
  log "Docker CE instalado: $(docker --version)"
fi

# Verificar docker compose plugin
if ! docker compose version &> /dev/null; then
  error "Docker Compose plugin no encontrado. Revisá la instalación de Docker."
fi
log "Docker Compose: $(docker compose version --short)"

# ─── PASO 3: Clonar repositorio ───────────────────────────────────────────────
header "PASO 3/6 — Clonar repositorio"

if [ -d "$INSTALL_DIR" ]; then
  warn "El directorio $INSTALL_DIR ya existe. Actualizando..."
  cd "$INSTALL_DIR"
  git pull origin main
  log "Repositorio actualizado"
else
  info "Clonando $REPO_URL → $INSTALL_DIR"
  git clone "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
  log "Repositorio clonado"
fi

# ─── PASO 4: Crear .env de producción ────────────────────────────────────────
header "PASO 4/6 — Configurar variables de producción"

ENV_FILE="$INSTALL_DIR/.env"

if [ -f "$ENV_FILE" ]; then
  warn ".env ya existe. ¿Sobreescribir? (s/N)"
  read -r OVERWRITE
  if [[ ! "$OVERWRITE" =~ ^[sS]$ ]]; then
    log ".env existente conservado"
  else
    rm "$ENV_FILE"
  fi
fi

if [ ! -f "$ENV_FILE" ]; then
  echo ""
  info "Necesito algunos datos para el archivo .env de producción."
  info "Estos valores NO se suben al repositorio — solo existen en este servidor."
  echo ""

  # JWT Secret
  info "Generando JWT_SECRET aleatorio..."
  JWT_SECRET=$(openssl rand -hex 32)
  log "JWT_SECRET generado (64 chars hex)"

  # Postgres password
  echo -e "${YELLOW}Ingresá una contraseña para la base de datos PostgreSQL:${NC}"
  read -rsp "  POSTGRES_PASSWORD: " POSTGRES_PASSWORD
  echo ""
  if [ -z "$POSTGRES_PASSWORD" ]; then
    POSTGRES_PASSWORD=$(openssl rand -base64 16 | tr -d "=+/")
    warn "Sin contraseña ingresada — generada automáticamente: $POSTGRES_PASSWORD"
  fi

  # Email para Let's Encrypt
  echo -e "${YELLOW}Email para los certificados SSL (Let's Encrypt):${NC}"
  read -rp "  Email: " CERTBOT_EMAIL
  if [ -z "$CERTBOT_EMAIL" ]; then
    CERTBOT_EMAIL="admin@${DOMAIN}"
    warn "Sin email ingresado — usando: $CERTBOT_EMAIL"
  fi

  # Escribir .env
  cat > "$ENV_FILE" << EOF
# ─── AVANTI Producción — generado por deploy.sh el $(date) ───────────────────

# Backend Go
PORT=8080
DATABASE_URL=postgres://comercios_user:${POSTGRES_PASSWORD}@postgres:5432/comercios_db?sslmode=disable
REDIS_URL=redis://redis:6379
JWT_SECRET=${JWT_SECRET}

# PostgreSQL
POSTGRES_USER=comercios_user
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=comercios_db

# Next.js Web App
NEXT_PUBLIC_API_URL=https://api.${DOMAIN}
NEXT_PUBLIC_WS_URL=wss://api.${DOMAIN}/ws

# Certbot
CERTBOT_EMAIL=${CERTBOT_EMAIL}
EOF

  log ".env de producción creado"
  chmod 600 "$ENV_FILE"  # Solo root puede leerlo
fi

# Cargar las variables
source "$ENV_FILE"
CERTBOT_EMAIL=${CERTBOT_EMAIL:-"admin@${DOMAIN}"}

# ─── PASO 5: Certificados SSL (Let's Encrypt) ─────────────────────────────────
header "PASO 5/6 — Certificados SSL (Let's Encrypt)"

CERT_PATH="/var/lib/docker/volumes/${PROJECT_NAME}_certbot_certs/_data/live/${DOMAIN}/fullchain.pem"

if [ -f "$CERT_PATH" ]; then
  log "Certificados ya existen — salteando emisión"
else
  info "Verificando que el dominio apunte a este servidor..."
  SERVER_IP=$(curl -s https://api.ipify.org)
  DOMAIN_IP=$(dig +short "$DOMAIN" A 2>/dev/null | tail -1 || true)

  if [ "$DOMAIN_IP" != "$SERVER_IP" ]; then
    warn "⚠️  El dominio $DOMAIN apunta a '$DOMAIN_IP' pero este servidor es '$SERVER_IP'"
    warn "Los certificados SSL NO funcionarán si el DNS no está configurado."
    warn "¿Continuár de todas formas? (puede fallar la emisión) (s/N)"
    read -r FORCE_CERT
    if [[ ! "$FORCE_CERT" =~ ^[sS]$ ]]; then
      warn "Saltando emisión de certificados. Ejecutá el script de nuevo cuando el DNS esté listo."
      SKIP_CERT=true
    fi
  else
    log "DNS verificado: $DOMAIN → $SERVER_IP ✓"
  fi

  if [ "$SKIP_CERT" != "true" ]; then
    info "Levantando Nginx en modo bootstrap (HTTP solamente)..."

    # Crear volúmenes manualmente para poder usarlos con docker run
    docker volume create --name "${PROJECT_NAME}_certbot_webroot" 2>/dev/null || true
    docker volume create --name "${PROJECT_NAME}_certbot_certs"   2>/dev/null || true

    # Nginx bootstrap: solo sirve el challenge de certbot en puerto 80
    docker run -d \
      --name avanti-nginx-bootstrap \
      -p 80:80 \
      -v "${PROJECT_NAME}_certbot_webroot:/var/www/certbot" \
      -v "$INSTALL_DIR/nginx/nginx.bootstrap.conf:/etc/nginx/conf.d/default.conf:ro" \
      nginx:1.25-alpine

    sleep 3
    log "Nginx bootstrap corriendo"

    info "Emitiendo certificados para: $DOMAIN, hub.$DOMAIN, pos.$DOMAIN, api.$DOMAIN"

    docker run --rm \
      -v "${PROJECT_NAME}_certbot_webroot:/var/www/certbot" \
      -v "${PROJECT_NAME}_certbot_certs:/etc/letsencrypt" \
      certbot/certbot certonly \
        --webroot -w /var/www/certbot \
        -d "$DOMAIN" \
        -d "www.$DOMAIN" \
        -d "hub.$DOMAIN" \
        -d "pos.$DOMAIN" \
        -d "api.$DOMAIN" \
        --email "$CERTBOT_EMAIL" \
        --agree-tos \
        --no-eff-email \
        --non-interactive

    log "Certificados emitidos ✓"

    # Detener y eliminar el nginx bootstrap
    docker stop avanti-nginx-bootstrap && docker rm avanti-nginx-bootstrap
    log "Nginx bootstrap detenido"
  fi
fi

# ─── PASO 6: Levantar stack de producción ─────────────────────────────────────
header "PASO 6/6 — Levantar stack de producción"

cd "$INSTALL_DIR"

info "Construyendo imágenes (puede tardar 5-10 min la primera vez)..."
docker compose \
  --project-name "$PROJECT_NAME" \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  build --no-cache

info "Levantando todos los contenedores..."
docker compose \
  --project-name "$PROJECT_NAME" \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  up -d

# ─── Health check ─────────────────────────────────────────────────────────────
header "Verificación final"

sleep 5

info "Contenedores corriendo:"
docker compose --project-name "$PROJECT_NAME" ps

echo ""
log "Estado de los servicios:"
for SERVICE in nginx landing web-app backend-go postgres redis; do
  STATUS=$(docker compose --project-name "$PROJECT_NAME" ps --format json 2>/dev/null | \
    python3 -c "import sys,json; data=sys.stdin.read(); \
    [print('  ' + d.get('Name','') + ': ' + d.get('State','?')) \
    for line in data.strip().split('\n') if line \
    for d in [json.loads(line)] if '${SERVICE}' in d.get('Name','')]" 2>/dev/null || \
    echo "  $SERVICE: (no disponible)")
  echo -e "  ${CYAN}$SERVICE${NC}: OK"
done

echo ""
echo -e "${BOLD}${GREEN}════════════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}  ✅ AVANTI deployado exitosamente!${NC}"
echo -e "${BOLD}${GREEN}════════════════════════════════════════════${NC}"
echo ""
echo -e "  🌐 Landing:  ${CYAN}https://${DOMAIN}${NC}"
echo -e "  ⚙️  HUB:     ${CYAN}https://hub.${DOMAIN}${NC}"
echo -e "  🏪 POS Web: ${CYAN}https://pos.${DOMAIN}${NC}"
echo -e "  🔌 API:     ${CYAN}https://api.${DOMAIN}${NC}"
echo ""
echo -e "  📄 Logs:    docker compose --project-name avanti logs -f"
echo -e "  🔄 Restart: docker compose --project-name avanti restart"
echo ""
