#!/usr/bin/env bash
# Arranca SportV en un servidor local.
# Uso: ./serve.sh [puerto]   (por defecto 8080)

set -e
PORT="${1:-8080}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "SportV  ->  http://localhost:${PORT}"
echo "Sirviendo: ${DIR}"
echo "Ctrl+C para detener."
echo

if command -v python3 >/dev/null 2>&1; then
  exec python3 -m http.server "$PORT" --directory "$DIR"
elif command -v node >/dev/null 2>&1; then
  exec npx --yes serve -l "$PORT" "$DIR"
else
  echo "Necesitas python3 o node instalado." >&2
  exit 1
fi
