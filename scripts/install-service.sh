#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
service_dir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
service_file="${service_dir}/jarvis-v02.service"
npm_bin="$(command -v npm)"
node_bin_dir="$(dirname "$npm_bin")"

mkdir -p "$service_dir"
sed -e "s|__PROJECT_DIR__|$project_dir|g" -e "s|__NPM_BIN__|$npm_bin|g" -e "s|__NODE_BIN_DIR__|$node_bin_dir|g" "${project_dir}/scripts/jarvis-v02.service.in" > "$service_file"
systemctl --user daemon-reload
systemctl --user enable jarvis-v02.service
systemctl --user restart jarvis-v02.service

echo "Installed and started jarvis-v02.service"
echo "Check it with: systemctl --user status jarvis-v02.service --no-pager"
