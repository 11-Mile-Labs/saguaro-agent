#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DRY_RUN=0
INSTALL_ALL=0
INSTALL_CLAUDE=0
INSTALL_CODEX=0
INSTALL_GEMINI=0
INSTALL_CLI=1
CLI_DIR="${SAGUARO_BIN_DIR:-$HOME/.local/bin}"

usage() {
  cat <<'USAGE'
Usage: ./install.sh [--all] [--claude] [--codex] [--gemini] [--no-cli] [--cli-dir DIR] [--dry-run]

Installs Saguaro into detected harnesses at user scope by default and links the
`saguaro` CLI into ~/.local/bin unless disabled.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --all) INSTALL_ALL=1 ;;
    --claude) INSTALL_CLAUDE=1 ;;
    --codex) INSTALL_CODEX=1 ;;
    --gemini) INSTALL_GEMINI=1 ;;
    --no-cli) INSTALL_CLI=0 ;;
    --cli-dir)
      if [[ $# -lt 2 ]]; then
        echo "--cli-dir requires a directory" >&2
        exit 1
      fi
      CLI_DIR="$2"
      shift
      ;;
    --dry-run) DRY_RUN=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 1 ;;
  esac
  shift
done

if [[ "$INSTALL_ALL" -eq 0 && "$INSTALL_CLAUDE" -eq 0 && "$INSTALL_CODEX" -eq 0 && "$INSTALL_GEMINI" -eq 0 ]]; then
  INSTALL_ALL=1
fi

run() {
  echo "+ $*"
  if [[ "$DRY_RUN" -eq 0 ]]; then
    "$@"
  fi
}

gemini_extension_installed() {
  [[ -f "$HOME/.gemini/extensions/saguaro-agent/gemini-extension.json" ]]
}

legacy_codex_marketplace_installed() {
  [[ -f "${CODEX_HOME:-$HOME/.codex}/config.toml" ]] && grep -q '^\[marketplaces\.saguaro-agent\]' "${CODEX_HOME:-$HOME/.codex}/config.toml"
}

run pnpm --dir "$ROOT" build
run pnpm --dir "$ROOT" plugin:validate

if [[ "$INSTALL_CLI" -eq 1 ]]; then
  run mkdir -p "$CLI_DIR"
  run ln -sf "$ROOT/bin/saguaro.mjs" "$CLI_DIR/saguaro"
  if [[ ":$PATH:" != *":$CLI_DIR:"* ]]; then
    echo "note: $CLI_DIR is not on PATH; add it to your shell profile to use 'saguaro' directly."
  fi
fi

if [[ "$INSTALL_ALL" -eq 1 || "$INSTALL_CLAUDE" -eq 1 ]]; then
  if command -v claude >/dev/null 2>&1; then
    run claude plugin marketplace add "$ROOT/marketplaces/claude" --scope user
    run claude plugin install saguaro-agent@saguaro --scope user
  else
    echo "skip claude: CLI not found"
  fi
fi

if [[ "$INSTALL_ALL" -eq 1 || "$INSTALL_CODEX" -eq 1 ]]; then
  if command -v codex >/dev/null 2>&1; then
    if legacy_codex_marketplace_installed; then
      run codex plugin marketplace remove saguaro-agent
    fi
    run codex plugin marketplace add "$ROOT/marketplaces/codex"
    run node "$ROOT/scripts/sync-codex-plugin-config.mjs"
  else
    echo "skip codex: CLI not found"
  fi
fi

if [[ "$INSTALL_ALL" -eq 1 || "$INSTALL_GEMINI" -eq 1 ]]; then
  if command -v gemini >/dev/null 2>&1; then
    if gemini_extension_installed; then
      run gemini extensions uninstall saguaro-agent
    fi
    run gemini extensions install "$ROOT/marketplaces/gemini/extensions/saguaro-agent"
  else
    echo "skip gemini: CLI not found"
  fi
fi
