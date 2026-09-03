#!/usr/bin/env bash
set -euo pipefail

service_dir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
service_file="${service_dir}/codex-remote-control.service"
codex_bin="$(command -v codex)"
codex_bin_dir="$(dirname "$codex_bin")"
codex_home="${CODEX_HOME:-$HOME/.codex}"

mkdir -p "$service_dir"
sed \
  -e "s|__CODEX_BIN__|$codex_bin|g" \
  -e "s|__CODEX_BIN_DIR__|$codex_bin_dir|g" \
  -e "s|__CODEX_HOME__|$codex_home|g" \
  "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/scripts/codex-remote-control.service.in" > "$service_file"

systemctl --user daemon-reload
systemctl --user enable "$service_file"
systemctl --user restart codex-remote-control.service

echo "Installed and started codex-remote-control.service"
echo "Check it with: systemctl --user status codex-remote-control.service --no-pager"
