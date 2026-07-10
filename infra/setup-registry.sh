#!/usr/bin/env bash
# Local Docker registry inside the colima VM — Coolify pulls Viper-built images from it.
set -euo pipefail
CTX="${DOCKER_CONTEXT:-colima-coolify}"
if docker --context "$CTX" ps --format '{{.Names}}' | grep -q '^viper-registry$'; then
  echo "viper-registry already running"
else
  docker --context "$CTX" run -d --restart always -p 5000:5000 --name viper-registry registry:2
fi
docker --context "$CTX" ps --filter name=viper-registry --format '{{.Names}}  {{.Status}}'
