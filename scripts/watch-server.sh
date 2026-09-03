#!/usr/bin/env bash
set -euo pipefail

signature() {
  find server -type f -printf '%T@ %p\n' | sort
}

last_signature="$(signature)"

while true; do
  node server/index.js &
  child_pid=$!

  while kill -0 "$child_pid" 2>/dev/null; do
    sleep 1
    next_signature="$(signature)"
    if [[ "$next_signature" != "$last_signature" ]]; then
      last_signature="$next_signature"
      kill "$child_pid" 2>/dev/null || true
      wait "$child_pid" 2>/dev/null || true
      break
    fi
  done

  if ! kill -0 "$child_pid" 2>/dev/null; then
    wait "$child_pid" 2>/dev/null || true
  fi
done
