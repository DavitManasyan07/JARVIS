#!/usr/bin/env bash
# JARVIS-MANAGED uninstaller, version 1
set -Eeuo pipefail
JARVIS_DATA_BASE=${XDG_DATA_HOME:-"$HOME/.local/share"}
JARVIS_CONFIG_BASE=${XDG_CONFIG_HOME:-"$HOME/.config"}
JARVIS_INSTALL="$JARVIS_DATA_BASE/jarvis"
JARVIS_BIN="$HOME/.local/bin/jarvis"
JARVIS_DESKTOP="$JARVIS_DATA_BASE/applications/io.jarvis.Desktop.desktop"
[[ $(id -u) != 0 ]] || { printf 'Run this script as your normal desktop user.\n' >&2; exit 1; }
[[ ${1:-} == '' || ${1:-} == '--remove-data' ]] || { printf 'Usage: bash uninstall.sh [--remove-data]\n' >&2; exit 2; }
if [[ -e "$JARVIS_BIN" ]]; then
  grep -q '^# JARVIS-MANAGED launcher' "$JARVIS_BIN" || { printf 'Refusing unrelated launcher: %s\n' "$JARVIS_BIN" >&2; exit 1; }
  rm -- "$JARVIS_BIN"
fi
if [[ -e "$JARVIS_DESKTOP" ]]; then
  grep -q '^X-JARVIS-Managed=true$' "$JARVIS_DESKTOP" || { printf 'Refusing unrelated desktop entry: %s\n' "$JARVIS_DESKTOP" >&2; exit 1; }
  rm -- "$JARVIS_DESKTOP"
fi
if [[ -f "$JARVIS_INSTALL/.jarvis-install-managed" ]]; then
  if [[ -L "$JARVIS_INSTALL/runtime" ]]; then rm -- "$JARVIS_INSTALL/runtime"; fi
  if [[ -d "$JARVIS_INSTALL/releases" ]]; then
    for JARVIS_RELEASE in "$JARVIS_INSTALL"/releases/*; do
      [[ -d "$JARVIS_RELEASE" && ! -L "$JARVIS_RELEASE" && -f "$JARVIS_RELEASE/.jarvis-managed" ]] || continue
      grep -q 'io.jarvis.Desktop' "$JARVIS_RELEASE/.jarvis-managed" || continue
      rm -rf -- "$JARVIS_RELEASE"
    done
    rmdir -- "$JARVIS_INSTALL/releases" 2>/dev/null || true
  fi
  if [[ -d "$JARVIS_INSTALL/toolchain" ]]; then
    for JARVIS_TOOLCHAIN in "$JARVIS_INSTALL"/toolchain/node-v24.*-linux-x64; do
      [[ -d "$JARVIS_TOOLCHAIN" && ! -L "$JARVIS_TOOLCHAIN" && -f "$JARVIS_TOOLCHAIN/.jarvis-managed-toolchain" ]] || continue
      rm -rf -- "$JARVIS_TOOLCHAIN"
    done
    rmdir -- "$JARVIS_INSTALL/toolchain" 2>/dev/null || true
  fi
  for JARVIS_SIZE in 16 24 32 48 64 128 256 512; do rm -f -- "$JARVIS_DATA_BASE/icons/hicolor/${JARVIS_SIZE}x${JARVIS_SIZE}/apps/io.jarvis.Desktop.png"; done
  rm -f -- "$JARVIS_DATA_BASE/icons/hicolor/scalable/apps/io.jarvis.Desktop.svg"
fi
# The shared per-user PATH entry is useful for other applications. Preserve it.
if command -v update-desktop-database >/dev/null; then update-desktop-database "$JARVIS_DATA_BASE/applications"; fi
if [[ ${1:-} == '--remove-data' ]]; then
  printf 'This operation removes JARVIS settings, local conversation references, credentials, cache, and diagnostics.\n'
  printf 'It preserves Codex history, your source repository, and opened projects.\n'
  read -r -p 'Enter DELETE JARVIS DATA to continue: ' JARVIS_CONFIRM
  if [[ $JARVIS_CONFIRM == 'DELETE JARVIS DATA' ]]; then
    # Only JARVIS-owned data paths are eligible. Never remove an opened project.
    rm -rf -- "$JARVIS_CONFIG_BASE/jarvis" "${XDG_CACHE_HOME:-$HOME/.cache}/jarvis" "${XDG_STATE_HOME:-$HOME/.local/state}/jarvis"
    for JARVIS_LOCAL_FILE in "$JARVIS_INSTALL/jarvis.sqlite3" "$JARVIS_INSTALL/jarvis.sqlite3-wal" "$JARVIS_INSTALL/jarvis.sqlite3-shm"; do rm -f -- "$JARVIS_LOCAL_FILE"; done
    printf 'JARVIS local data removed. Provider-side history was not changed.\n'
  else
    printf 'Data removal canceled. Your local data is preserved.\n'
  fi
fi
printf 'JARVIS installation removed. User data is preserved unless you explicitly removed it.\n'
