#!/usr/bin/env bash
# Connect Viper -> Coolify headlessly (no dashboard needed after this).
# Mints a Coolify API token + captures the server/project UUIDs and writes them into
# apps/portal/.env.local. The TOKEN is written to that file only — never printed here.
set -uo pipefail
PROFILE="${COOLIFY_VM_PROFILE:-coolify}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/apps/portal/.env.local"

echo "→ Minting Coolify API token (headless)…"
# Coolify's createToken() requires session('currentTeam') (User.php:246) — seed it with the
# user's own team before minting (user 0 owns team 0 "Root Team" on a fresh install).
TOKEN=$(colima ssh -p "$PROFILE" -- sudo docker exec coolify sh -c \
  'php /var/www/html/artisan tinker --execute="\$u = App\Models\User::orderBy(\"id\")->first(); session([\"currentTeam\" => \$u->teams()->first()]); echo \$u->createToken(\"viper-portal\", [\"*\"])->plainTextToken;" 2>/dev/null' \
  | grep -oE "[0-9]+\|[A-Za-z0-9]+" | head -1)
if [ -z "$TOKEN" ]; then echo "✗ Failed to mint token"; exit 1; fi

SERVER_UUID=$(colima ssh -p "$PROFILE" -- sudo docker exec coolify-db psql -U coolify -t -A -c "select uuid from servers where id=0;" 2>/dev/null | tr -d '[:space:]')
PROJECT_UUID=$(colima ssh -p "$PROFILE" -- sudo docker exec coolify-db psql -U coolify -t -A -c "select uuid from projects order by id limit 1;" 2>/dev/null | tr -d '[:space:]')

echo "→ Verifying token against Coolify API…"
VER=$(curl -s --max-time 8 -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/version)
echo "  Coolify API responded: ${VER:-<no response>}"

touch "$ENV_FILE"
set_kv() {
  # NOTE: the token contains "|" (Sanctum id|hash) — use "#" as the sed delimiter, never "|".
  local k="$1" v="$2"
  if grep -q "^$k=" "$ENV_FILE"; then sed -i '' "s#^$k=.*#$k=$v#" "$ENV_FILE"; else echo "$k=$v" >> "$ENV_FILE"; fi
}
set_kv COOLIFY_URL "http://localhost:8000"
set_kv COOLIFY_TOKEN "$TOKEN"
set_kv COOLIFY_SERVER_UUID "${SERVER_UUID:-}"
set_kv COOLIFY_PROJECT_UUID "${PROJECT_UUID:-}"

echo "✓ Wired Viper → Coolify."
echo "  server_uuid  = ${SERVER_UUID:-<none yet>}"
echo "  project_uuid = ${PROJECT_UUID:-<none yet — create a project in onboarding>}"
echo "  token        = written to apps/portal/.env.local (not shown)"
echo "→ Restart the portal to pick it up:  (Viper will do this)"
