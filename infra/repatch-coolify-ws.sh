#!/usr/bin/env bash
# Re-apply the websocket fix after a Coolify container recreate/upgrade (see SPEC §7).
set -euo pipefail
PROFILE="${COOLIFY_VM_PROFILE:-coolify}"
colima ssh -p "$PROFILE" -- sudo docker exec coolify sh -c '
  sed -i "s/encrypted: true,/encrypted: false,/" /var/www/html/resources/views/layouts/base.blade.php
  php /var/www/html/artisan view:clear'
echo "re-patched (encrypted:false) + view cache cleared"
