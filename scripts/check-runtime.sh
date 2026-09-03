#!/usr/bin/env bash
set -euo pipefail

frontend_url="${JARVIS_FRONTEND_URL:-http://127.0.0.1:43117/}"
health_url="${JARVIS_HEALTH_URL:-http://127.0.0.1:43118/api/health}"
attempts="${JARVIS_RUNTIME_CHECK_ATTEMPTS:-30}"

for ((attempt = 1; attempt <= attempts; attempt += 1)); do
  if curl --fail --silent --show-error "$frontend_url" >/dev/null \
    && curl --fail --silent --show-error "$health_url" >/dev/null; then
    printf 'Jarvis runtime is healthy.\nFrontend: %s\nAPI: %s\n' "$frontend_url" "$health_url"
    exit 0
  fi
  sleep 1
done

printf 'Jarvis runtime did not become healthy after %s seconds.\n' "$attempts" >&2
exit 1
