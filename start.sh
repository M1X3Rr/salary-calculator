#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")" && pwd)"
cd "$root"

python -m pip install -r "$root/backend/requirements.txt" -q
npm --prefix "$root/frontend" install

backend_pid=""
frontend_pid=""
cleanup() {
  if [ -n "$backend_pid" ]; then kill "$backend_pid" 2>/dev/null || true; fi
  if [ -n "$frontend_pid" ]; then kill "$frontend_pid" 2>/dev/null || true; fi
}
trap cleanup EXIT INT TERM

(cd "$root/backend" && python -m uvicorn app:app --host 127.0.0.1 --port 8000) &
backend_pid=$!
(cd "$root/frontend" && npm run dev) &
frontend_pid=$!

sleep 3
if command -v xdg-open >/dev/null; then
  xdg-open "http://127.0.0.1:5173" >/dev/null 2>&1 || true
elif command -v open >/dev/null; then
  open "http://127.0.0.1:5173" >/dev/null 2>&1 || true
fi

echo "Backend http://127.0.0.1:8000  |  UI http://127.0.0.1:5173"
wait
