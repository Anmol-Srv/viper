#!/usr/bin/env bash
# Stand up the full Viper platform on a fresh-ish Ubuntu staging server. Idempotent.
# Run ON the server (or via ssh): SERVER_IP=<public-ip> bash infra/deploy-staging.sh
set -euo pipefail
SERVER_IP="${SERVER_IP:?set SERVER_IP=<public ip>}"
REPO_DIR="${REPO_DIR:-/opt/viper}"
ENV_FILE="$REPO_DIR/.env.staging"

echo "== 1/6 docker =="
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh

echo "== 2/6 repo =="
if [ -d "$REPO_DIR/.git" ]; then git -C "$REPO_DIR" pull -q; else
  git clone -q https://github.com/Anmol-Srv/viper.git "$REPO_DIR"; fi

echo "== 3/6 coolify (native — no colima workarounds needed) =="
if [ -f /data/coolify/source/docker-compose.yml ]; then echo "   already installed"; else
  curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash; fi

echo "== 4/6 registry =="
docker ps --format '{{.Names}}' | grep -q '^viper-registry$' || \
  docker run -d --restart always -p 5000:5000 --name viper-registry registry:2

echo "== 5/6 env =="
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<EOF
SERVER_IP=$SERVER_IP
AUTH_JWT_SECRET=$(openssl rand -hex 32)
AUTH_ADMIN_KEY=$(openssl rand -hex 24)
AUTH_PLATFORM_ADMIN=enggv2@airtribe.live
# REQUIRED before 'up': real mail transport (auth exits without one in production)
SMTP_URL=
MAIL_FROM=
# Filled by step 6 (Coolify onboarding + token):
COOLIFY_TOKEN=
COOLIFY_SERVER_UUID=
COOLIFY_PROJECT_UUID=
# Optional (db module provisioning):
INSFORGE_USER_API_KEY=
INSFORGE_ORG_ID=
EOF
  chmod 600 "$ENV_FILE"
  echo "   wrote $ENV_FILE — FILL SMTP_URL (+ Coolify token after onboarding), then re-run step 6"
fi

echo "== 6/6 core services =="
if grep -q "^SMTP_URL=.\+" "$ENV_FILE" && grep -q "^COOLIFY_TOKEN=.\+" "$ENV_FILE"; then
  docker compose --env-file "$ENV_FILE" -f "$REPO_DIR/infra/staging-compose.yml" up -d --build
  echo ""
  echo "DONE: portal http://$SERVER_IP:3400 · coolify http://$SERVER_IP:8000 · apps http://<sub>.$SERVER_IP.sslip.io"
else
  echo "   SKIPPED (fill SMTP_URL and COOLIFY_TOKEN in $ENV_FILE first, then re-run this script)"
  echo "   Coolify onboarding: open http://$SERVER_IP:8000 → register → localhost server validates natively."
  echo "   Then mint the API token headlessly:"
  echo "     docker exec coolify php /var/www/html/artisan tinker --execute='\$u=App\Models\User::orderBy(\"id\")->first(); session([\"currentTeam\"=>\$u->teams()->first()]); echo \$u->createToken(\"viper-portal\",[\"*\"])->plainTextToken;'"
  echo "     docker exec coolify-db psql -U coolify -c \"update instance_settings set is_api_enabled=true;\""
  echo "     server/project uuids: docker exec coolify-db psql -U coolify -t -c 'select uuid from servers; select uuid from projects;'"
fi
