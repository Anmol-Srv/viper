#!/usr/bin/env bash
# Set up Coolify on this laptop-as-server. Coolify is Linux-native, so on macOS it runs inside a
# lightweight colima VM (Apple Virtualization). No domain needed — Coolify issues free sslip.io URLs.
# Idempotent: safe to re-run. See infra/README.md.
set -euo pipefail

PROFILE="${COOLIFY_VM_PROFILE:-coolify}"
CPU="${COOLIFY_VM_CPU:-4}"
MEM="${COOLIFY_VM_MEM:-4}"     # GB — Coolify min 2GB; 4 leaves headroom for building small containers
DISK="${COOLIFY_VM_DISK:-40}"  # GB

echo "== 1/4 tooling =="
command -v colima >/dev/null 2>&1 || brew install colima
command -v docker  >/dev/null 2>&1 || brew install docker

echo "== 2/4 colima VM ($PROFILE: ${CPU}cpu ${MEM}GB ${DISK}GB, vz) =="
if colima status -p "$PROFILE" >/dev/null 2>&1; then
  echo "   VM '$PROFILE' already running"
else
  colima start -p "$PROFILE" --cpu "$CPU" --memory "$MEM" --disk "$DISK" --vm-type vz
fi

echo "== 3/4 Coolify (inside the VM) =="
if colima ssh -p "$PROFILE" -- test -f /data/coolify/source/docker-compose.yml >/dev/null 2>&1; then
  echo "   Coolify already installed"
else
  # official installer; detects the VM's docker and wires up Coolify's own compose stack
  colima ssh -p "$PROFILE" -- 'curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash'
fi

echo "== 4/4 access =="
VM_IP="$(colima ssh -p "$PROFILE" -- sh -c 'hostname -I 2>/dev/null || ip -4 addr show | grep -oP "(?<=inet\s)\d+(\.\d+){3}" | grep -v 127.0.0.1 | head -1' | awk '{print $1}')"
echo ""
echo "Coolify dashboard:"
echo "   http://localhost:8000        (colima forwards published ports)"
echo "   http://${VM_IP}:8000         (VM IP, if localhost doesn't forward)"
echo ""
echo "Next (one-time, web UI): create the root @airtribe.live user, then"
echo "Keys & Tokens -> API tokens -> create a token, and put it in apps/portal/.env.local:"
echo "   COOLIFY_URL=http://localhost:8000"
echo "   COOLIFY_TOKEN=<token>"
echo "Then in Coolify: Servers -> localhost -> Validate. Projects give free *.sslip.io URLs."
