#!/usr/bin/env bash
# Viper end-to-end demo: login → create project → zip → install → deploy → live gated URL.
# Run from any machine on the tailnet with node20+, npm, curl, python3, unzip.
#
#   bash scripts/demo.sh                         # against staging, interactive OTP (from email)
#   VIPER_URL=http://localhost:3400 bash scripts/demo.sh    # against a local stack (auto-OTP in dev)
#   EMAIL=you@airtribe.live NAME="Sales Wins" bash scripts/demo.sh
set -euo pipefail

VIPER_URL="${VIPER_URL:-http://100.73.135.40:3400}"
EMAIL="${EMAIL:-anmol.srivastava@airtribe.live}"
NAME="${NAME:-Demo $(date +%H%M)}"
SUB="${SUB:-$(echo "$NAME" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | sed 's/^-*//;s/-*$//')}"
WORK="${WORK:-$HOME/viper-demo/$SUB}"
JAR="$(mktemp)"
say()  { printf "\n\033[1m%s\033[0m\n" "$*"; }
ok()   { printf "  \033[32m✓\033[0m %s\n" "$*"; }
fail() { printf "  \033[31m✗ %s\033[0m\n" "$*"; exit 1; }
json() { python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('$1',''))"; }

say "VIPER DEMO → $VIPER_URL  (project: $NAME / $SUB)"

say "[1/7] Platform health"
curl -sf --max-time 8 "$VIPER_URL/api/health" >/dev/null && ok "portal healthy" || fail "portal unreachable at $VIPER_URL (tailnet up?)"

say "[2/7] Login as $EMAIL (invite-only, @airtribe.live)"
START=$(curl -sf --max-time 15 -X POST "$VIPER_URL/api/auth/start" -H 'content-type: application/json' -d "{\"email\":\"$EMAIL\"}") \
  || fail "login refused — is $EMAIL invited? (platform admin can invite at $VIPER_URL/admin)"
OTP=$(echo "$START" | json devOtp)
if [ -z "$OTP" ]; then
  printf "  📧 a 6-digit code was emailed to %s — enter it: " "$EMAIL"; read -r OTP
fi
curl -sf --max-time 15 -c "$JAR" -X POST "$VIPER_URL/api/auth/verify" -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"otp\":\"$OTP\"}" >/dev/null || fail "OTP rejected"
ok "session established"

say "[3/7] Create project '$NAME' (modules: auth + permissions)"
CREATE=$(curl -sf --max-time 40 -b "$JAR" -X POST "$VIPER_URL/api/projects" -H 'content-type: application/json' \
  -d "{\"name\":\"$NAME\",\"subdomain\":\"$SUB\",\"modules\":[\"permissions\"]}") || fail "create failed (subdomain taken? try SUB=<other>)"
LIVE=$(echo "$CREATE" | json liveUrl); ok "provisioned — will go live at ${LIVE:-<pending>}"

say "[4/7] Download + unpack the scaffold"
rm -rf "$WORK" && mkdir -p "$WORK"
curl -sf --max-time 30 -b "$JAR" "$VIPER_URL/api/download?sub=$SUB" -o "$WORK/$SUB.zip"
unzip -q "$WORK/$SUB.zip" -d "$WORK/app"
ok "zip → $WORK/app  ($(find "$WORK/app" -type f | wc -l | tr -d ' ') files)"
ok "agent context ready: CLAUDE.md ($(head -1 "$WORK/app/CLAUDE.md"))"

say "[5/7] npm install (the longest step — ~1-2 min)"
( cd "$WORK/app" && npm install --no-audit --no-fund >/dev/null 2>&1 ) && ok "installed" || fail "npm install failed (node20+?)"
ok "builder would now run 'npm run dev' + build with AI — demo skips straight to shipping"

say "[6/7] npm run deploy  (builds the image on the server, streams progress)"
( cd "$WORK/app" && npm run deploy ) || fail "deploy failed — see output above"

say "[7/7] Verify the live, gated URL"
sleep 3
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 12 "$LIVE/" || echo 000)
[ "$CODE" = "307" ] || [ "$CODE" = "302" ] || [ "$CODE" = "200" ] || fail "expected auth redirect at $LIVE, got $CODE"
ok "$LIVE answers ($CODE → login wall is ON)"

say "DEMO COMPLETE 🎉"
cat <<EOF
  Dashboard   $VIPER_URL              (invite members at $VIPER_URL/admin)
  Project     $VIPER_URL/projects/$SUB   (members · database · deploys · teardown)
  Live app    $LIVE                   (login = invited @airtribe.live emails, code by mail)
  Local code  $WORK/app               (edit anything → 'npm run deploy' again = same URL, new version)
EOF
rm -f "$JAR"
