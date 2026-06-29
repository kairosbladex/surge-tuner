#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "Proxy Tuner requires Node.js >= 20. Please install Node 20+ and run this script again." >&2
  exit 1
fi

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Proxy Tuner requires Node.js >= 20. Current version: $(node -v)" >&2
  exit 1
fi

if [ "${1:-}" = "--check-only" ]; then
  echo "Node $(node -v) OK. No npm install is required."
  exit 0
fi

exec node scripts/quick-start-server.js "$@"
