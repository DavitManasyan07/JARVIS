#!/usr/bin/env bash
# JARVIS-MANAGED installer, version 1
set -Eeuo pipefail
IFS=$'\n\t'
JARVIS_SOURCE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
JARVIS_DATA_BASE=${XDG_DATA_HOME:-"$HOME/.local/share"}
JARVIS_CONFIG_BASE=${XDG_CONFIG_HOME:-"$HOME/.config"}
JARVIS_INSTALL="$JARVIS_DATA_BASE/jarvis"
JARVIS_BIN="$HOME/.local/bin"
JARVIS_DESKTOP="$JARVIS_DATA_BASE/applications/io.jarvis.Desktop.desktop"
JARVIS_STAGE=''
trap 'status=$?; if [[ -n "$JARVIS_STAGE" && -d "$JARVIS_STAGE" ]]; then rm -rf -- "$JARVIS_STAGE"; fi; if ((status)); then printf "JARVIS installation failed (status %s). Existing user data was preserved.\n" "$status" >&2; fi' EXIT
fail() { printf 'JARVIS: %s\n' "$*" >&2; exit 1; }
progress() { printf '\nJARVIS: %s\n' "$*"; }
[[ $(id -u) != 0 ]] || fail 'Run this installer as your normal desktop user, without sudo.'
[[ $(uname -s) == Linux && $(uname -m) == x86_64 ]] || fail 'This release supports Linux x86_64 only.'
[[ -r /etc/os-release ]] || fail 'Cannot identify the Linux distribution.'
# shellcheck source=/dev/null
. /etc/os-release
[[ ${ID:-} == ubuntu && ${VERSION_ID:-} == 24.04 ]] || fail 'Supported installation target: Ubuntu 24.04 x86_64. Other distributions are not tested.'
[[ -f "$JARVIS_SOURCE/package-lock.json" ]] || fail 'The dependency lockfile is missing.'
[[ -f "$JARVIS_SOURCE/package.json" ]] || fail 'The application package is missing.'
for JARVIS_TOOL in curl tar sha256sum stat readlink setsid; do command -v "$JARVIS_TOOL" >/dev/null || fail "Required utility is missing: $JARVIS_TOOL"; done
for JARVIS_MANAGED in "$JARVIS_BIN/jarvis" "$JARVIS_DESKTOP"; do
  if [[ -e "$JARVIS_MANAGED" || -L "$JARVIS_MANAGED" ]]; then
    [[ -f "$JARVIS_MANAGED" ]] && rg_marker=$(head -c 4096 -- "$JARVIS_MANAGED") || fail "Conflicting file: $JARVIS_MANAGED"
    [[ $rg_marker == *JARVIS-MANAGED* || $rg_marker == *X-JARVIS-Managed=true* ]] || fail "Refusing to replace an unrelated file: $JARVIS_MANAGED"
  fi
done
for JARVIS_APPLICATION_DIR in "$JARVIS_DATA_BASE/applications" /usr/local/share/applications /usr/share/applications; do
  for JARVIS_ENTRY in "$JARVIS_APPLICATION_DIR"/*.desktop; do
    [[ -f "$JARVIS_ENTRY" && "$JARVIS_ENTRY" != "$JARVIS_DESKTOP" ]] || continue
    if grep -qi '^Name=JARVIS$' "$JARVIS_ENTRY"; then fail "Another JARVIS desktop entry exists: $JARVIS_ENTRY. Resolve the launcher conflict first."; fi
  done
done
JARVIS_EXISTING=$(command -v jarvis || true)
if [[ -n "$JARVIS_EXISTING" && "$JARVIS_EXISTING" != "$JARVIS_BIN/jarvis" ]]; then fail "Another jarvis command exists: $JARVIS_EXISTING. Resolve the command conflict first."; fi
if [[ -e "$JARVIS_INSTALL/runtime" || -L "$JARVIS_INSTALL/runtime" ]]; then
  [[ -f "$JARVIS_INSTALL/runtime/.jarvis-managed" ]] || fail "Unmanaged runtime already exists: $JARVIS_INSTALL/runtime"
fi
progress 'Check Node.js and locked application dependencies.'
if ! command -v node >/dev/null || ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)' ; then
  progress 'Install a private Node.js 24 runtime from nodejs.org. No administrator access is required.'
  mkdir -p -- "$JARVIS_INSTALL/toolchain"
  JARVIS_NODE_TMP=$(mktemp -d "$JARVIS_INSTALL/toolchain/download.XXXXXX")
  curl --fail --location --proto '=https' --tlsv1.2 'https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt' -o "$JARVIS_NODE_TMP/SHASUMS256.txt"
  JARVIS_NODE_FILE=$(awk '$2 ~ /^node-v24\.[0-9]+\.[0-9]+-linux-x64\.tar\.xz$/ {print $2; exit}' "$JARVIS_NODE_TMP/SHASUMS256.txt")
  [[ -n "$JARVIS_NODE_FILE" ]] || fail 'The official Node.js checksum list has no Linux x64 archive.'
  curl --fail --location --proto '=https' --tlsv1.2 "https://nodejs.org/dist/latest-v24.x/$JARVIS_NODE_FILE" -o "$JARVIS_NODE_TMP/$JARVIS_NODE_FILE"
  (cd -- "$JARVIS_NODE_TMP"; awk -v f="$JARVIS_NODE_FILE" '$2 == f {print}' SHASUMS256.txt | sha256sum --check -)
  tar -xJf "$JARVIS_NODE_TMP/$JARVIS_NODE_FILE" -C "$JARVIS_INSTALL/toolchain"
  JARVIS_NODE_DIR="$JARVIS_INSTALL/toolchain/${JARVIS_NODE_FILE%.tar.xz}"
  printf 'JARVIS-MANAGED private Node.js runtime\n' > "$JARVIS_NODE_DIR/.jarvis-managed-toolchain"
  export PATH="$JARVIS_NODE_DIR/bin:$PATH"
  rm -rf -- "$JARVIS_NODE_TMP"
fi
command -v npm >/dev/null || fail 'Node.js is available, but npm is missing. Install the official Node.js distribution with npm.'
progress 'Install locked npm packages and build the production application.'
(cd -- "$JARVIS_SOURCE"; npm ci --no-audit --no-fund; node node_modules/electron/install.js; npm run typecheck; npm test; npm run package)
JARVIS_MISSING=$(ldd "$JARVIS_SOURCE/build/linux-unpacked/jarvis-bin" | awk '/not found/ {print $1}')
if [[ -n "$JARVIS_MISSING" ]]; then
  printf 'JARVIS requires these missing shared libraries:\n%s\n' "$JARVIS_MISSING"
  printf 'Ubuntu packages: libnss3 libatk1.0-0t64 libatk-bridge2.0-0t64 libgtk-3-0t64 libgbm1 libasound2t64 libxss1.\n'
  printf 'This step uses administrator access only for the named system dependencies.\n'
  read -r -p 'Install these Ubuntu packages with apt? [y/N] ' JARVIS_REPLY
  [[ $JARVIS_REPLY == y || $JARVIS_REPLY == Y ]] || fail 'Required system libraries are not installed.'
  sudo apt-get update
  sudo apt-get install -y libnss3 libatk1.0-0t64 libatk-bridge2.0-0t64 libgtk-3-0t64 libgbm1 libasound2t64 libxss1
  [[ -z $(ldd "$JARVIS_SOURCE/build/linux-unpacked/jarvis-bin" | awk '/not found/ {print $1}') ]] || fail 'Some shared libraries are still missing.'
fi
# A sibling chrome-sandbox takes precedence over CHROME_DEVEL_SANDBOX in Chromium.
# Link the staged sibling to a compatible, trusted helper instead of exporting an
# environment variable that the packaged sibling would shadow.
# shellcheck source=scripts/sandbox-helper.sh
source "$JARVIS_SOURCE/scripts/sandbox-helper.sh"
JARVIS_SANDBOX=''
JARVIS_SANDBOX_API=$("$JARVIS_SOURCE/build/linux-unpacked/chrome-sandbox" --get-api) || fail 'Cannot query the packaged Chromium sandbox helper API.'
[[ "$JARVIS_SANDBOX_API" =~ ^[0-9]+$ ]] || fail 'The packaged Chromium sandbox helper reported an invalid API version.'
for JARVIS_HELPER in /opt/google/chrome/chrome-sandbox /usr/lib/chromium/chrome-sandbox /usr/share/code/chrome-sandbox; do
  if JARVIS_SANDBOX=$(jarvis_trusted_sandbox_helper "$JARVIS_HELPER" "$JARVIS_SANDBOX_API"); then break; fi
  JARVIS_SANDBOX=''
done
if [[ -z "$JARVIS_SANDBOX" ]]; then
  if { [[ -r /proc/sys/kernel/apparmor_restrict_unprivileged_userns ]] && [[ $(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns) == 1 ]]; } || { [[ -r /proc/sys/kernel/unprivileged_userns_clone ]] && [[ $(cat /proc/sys/kernel/unprivileged_userns_clone) == 0 ]]; }; then
    fail 'Ubuntu restricts user namespaces and no trusted compatible Chromium sandbox helper is installed. An administrator must provide a matching root-owned helper. See docs/TROUBLESHOOTING.md. JARVIS will not disable its sandbox.'
  fi
else
  progress "Use the trusted Chromium sandbox helper (API $JARVIS_SANDBOX_API): $JARVIS_SANDBOX"
fi
progress 'Stage the packaged runtime. Existing settings and conversations are preserved.'
mkdir -p -- "$JARVIS_INSTALL/releases" "$JARVIS_CONFIG_BASE/jarvis" "$JARVIS_BIN" "$(dirname -- "$JARVIS_DESKTOP")"
chmod 700 -- "$JARVIS_CONFIG_BASE/jarvis"
JARVIS_STAGE=$(mktemp -d "$JARVIS_INSTALL/releases/release.XXXXXX")
cp -a -- "$JARVIS_SOURCE/build/linux-unpacked/." "$JARVIS_STAGE/"
if [[ -n "$JARVIS_SANDBOX" ]]; then
  rm -f -- "$JARVIS_STAGE/chrome-sandbox"
  ln -s -- "$JARVIS_SANDBOX" "$JARVIS_STAGE/chrome-sandbox"
fi
JARVIS_CODEX=$(command -v codex || true)
node --input-type=module - "$JARVIS_CONFIG_BASE/jarvis/runtime.json" "$JARVIS_CODEX" <<'JS'
import fs from 'node:fs';
const [file, codexPath] = process.argv.slice(2);
const previous = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
if (codexPath) previous.codexPath = codexPath;
fs.writeFileSync(file + '.tmp', JSON.stringify(previous, null, 2) + '\n', {mode:0o600});
fs.renameSync(file + '.tmp', file);
JS
JARVIS_LAUNCHER_TMP=$(mktemp "$JARVIS_BIN/.jarvis.XXXXXX")
{
  printf '#!/usr/bin/env bash\n# JARVIS-MANAGED launcher, version 1\nset -euo pipefail\nunset ELECTRON_RUN_AS_NODE ELECTRON_DISABLE_SANDBOX CHROME_DEVEL_SANDBOX\n'
  printf 'JARVIS_RUNTIME=%q\n' "$JARVIS_INSTALL/runtime"
  printf 'JARVIS_LOG_BASE=%q\n' "${XDG_STATE_HOME:-$HOME/.local/state}/jarvis"
  printf 'JARVIS_SANDBOX_TARGET=%q\n' "$JARVIS_SANDBOX"
  printf 'JARVIS_SANDBOX_API=%q\n' "$JARVIS_SANDBOX_API"
  printf 'JARVIS_INSTALLER=%q\n' "$JARVIS_SOURCE/install.sh"
  declare -f jarvis_trusted_sandbox_helper
  cat <<'LAUNCHER'
umask 077
mkdir -p -- "$JARVIS_LOG_BASE"
# Keep diagnostics bounded. JARVIS itself writes private application diagnostics.
if [[ -f "$JARVIS_LOG_BASE/launcher.log" ]] && (( $(stat -c %s "$JARVIS_LOG_BASE/launcher.log") > 1048576 )); then mv -f -- "$JARVIS_LOG_BASE/launcher.log" "$JARVIS_LOG_BASE/launcher.previous.log"; fi
jarvis_launch_failure() {
  local message=$1 details="Diagnostics: $JARVIS_LOG_BASE/launcher.log"
  printf 'JARVIS could not start: %s\n%s\nRun: bash "%s"\n' "$message" "$details" "$JARVIS_INSTALLER" >&2
  printf 'JARVIS startup validation failed: %s\n' "$message" >>"$JARVIS_LOG_BASE/launcher.log"
  if [[ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]]; then
    if command -v zenity >/dev/null; then
      nohup setsid -f zenity --error --no-markup --title='JARVIS could not start' --text="$message
Run the JARVIS installer again.
$details" </dev/null >/dev/null 2>&1 &
    elif command -v notify-send >/dev/null; then
      notify-send --app-name=JARVIS 'JARVIS could not start' "$message. Run the JARVIS installer again. $details" >/dev/null 2>&1 || true
    fi
  fi
  exit 1
}
if [[ -n "$JARVIS_SANDBOX_TARGET" ]]; then
  if ! [[ -L "$JARVIS_RUNTIME/chrome-sandbox" ]] || ! JARVIS_CURRENT_HELPER=$(jarvis_trusted_sandbox_helper "$JARVIS_RUNTIME/chrome-sandbox" "$JARVIS_SANDBOX_API") || [[ "$JARVIS_CURRENT_HELPER" != "$JARVIS_SANDBOX_TARGET" ]]; then
    jarvis_launch_failure 'The Chromium sandbox helper is missing, unsafe, or incompatible.'
  fi
elif { [[ -r /proc/sys/kernel/apparmor_restrict_unprivileged_userns ]] && [[ $(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns) == 1 ]]; } || { [[ -r /proc/sys/kernel/unprivileged_userns_clone ]] && [[ $(cat /proc/sys/kernel/unprivileged_userns_clone) == 0 ]]; }; then
  jarvis_launch_failure 'This system now restricts user namespaces, and no trusted sandbox helper was configured.'
fi
nohup setsid -f "$JARVIS_RUNTIME/jarvis-bin" --class=io.jarvis.Desktop --name=io.jarvis.Desktop "$@" </dev/null >>"$JARVIS_LOG_BASE/launcher.log" 2>&1 &
LAUNCHER
} > "$JARVIS_LAUNCHER_TMP"
chmod 755 -- "$JARVIS_LAUNCHER_TMP"
JARVIS_DESKTOP_TMP=$(mktemp "$(dirname -- "$JARVIS_DESKTOP")/.jarvis.XXXXXX.desktop")
node --input-type=module - "$JARVIS_DESKTOP_TMP" "$JARVIS_BIN/jarvis" <<'JS'
import fs from 'node:fs';
const [file, launcher] = process.argv.slice(2);
const quoted = launcher.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('`', '\\`').replaceAll('$', '\\$').replaceAll('%', '%%');
fs.writeFileSync(file, `[Desktop Entry]\nType=Application\nVersion=1.0\nName=JARVIS\nComment=Desktop workspace for Codex\nExec="${quoted}" %f\nIcon=io.jarvis.Desktop\nTerminal=false\nCategories=Development;IDE;\nStartupNotify=true\nStartupWMClass=io.jarvis.Desktop\nX-JARVIS-Managed=true\n`);
JS
if command -v desktop-file-validate >/dev/null; then desktop-file-validate "$JARVIS_DESKTOP_TMP"; fi
for JARVIS_SIZE in 16 24 32 48 64 128 256 512; do
  JARVIS_ICON_DIR="$JARVIS_DATA_BASE/icons/hicolor/${JARVIS_SIZE}x${JARVIS_SIZE}/apps"
  mkdir -p -- "$JARVIS_ICON_DIR"
  cp -- "$JARVIS_SOURCE/assets/jarvis-$JARVIS_SIZE.png" "$JARVIS_ICON_DIR/io.jarvis.Desktop.png"
done
mkdir -p -- "$JARVIS_DATA_BASE/icons/hicolor/scalable/apps"
cp -- "$JARVIS_SOURCE/assets/jarvis.svg" "$JARVIS_DATA_BASE/icons/hicolor/scalable/apps/io.jarvis.Desktop.svg"
ln -s -- "releases/$(basename -- "$JARVIS_STAGE")" "$JARVIS_INSTALL/runtime.next.$$"
if [[ -d "$JARVIS_INSTALL/runtime" && ! -L "$JARVIS_INSTALL/runtime" ]]; then mv -- "$JARVIS_INSTALL/runtime" "$JARVIS_INSTALL/releases/previous-$(date +%s)"; fi
mv -Tf -- "$JARVIS_INSTALL/runtime.next.$$" "$JARVIS_INSTALL/runtime"
JARVIS_STAGE=''
mv -f -- "$JARVIS_LAUNCHER_TMP" "$JARVIS_BIN/jarvis"
mv -f -- "$JARVIS_DESKTOP_TMP" "$JARVIS_DESKTOP"
chmod 644 -- "$JARVIS_DESKTOP"
printf 'JARVIS-MANAGED\n' > "$JARVIS_INSTALL/.jarvis-install-managed"
if command -v update-desktop-database >/dev/null; then update-desktop-database "$JARVIS_DATA_BASE/applications"; fi
if command -v gtk-update-icon-cache >/dev/null; then gtk-update-icon-cache -f -t "$JARVIS_DATA_BASE/icons/hicolor" >/dev/null 2>&1 || true; fi
case ":$PATH:" in
  *":$JARVIS_BIN:"*) ;;
  *)
    if ! [[ -f "$HOME/.profile" ]] || ! grep -q '# JARVIS-MANAGED PATH' "$HOME/.profile"; then
      cat >> "$HOME/.profile" <<'PROFILE'

# JARVIS-MANAGED PATH: per-user application launchers
case ":$PATH:" in
  *":$HOME/.local/bin:"*) ;;
  *) export PATH="$HOME/.local/bin:$PATH" ;;
esac
# END JARVIS-MANAGED PATH
PROFILE
    fi
    printf '\nAdded a marked PATH block to ~/.profile. Open a new login terminal, or run: export PATH="$HOME/.local/bin:$PATH"\n'
    ;;
esac
progress "Installed. Launch: $JARVIS_BIN/jarvis"
printf 'Application launcher: JARVIS\nProject command: jarvis /path/to/project\n'
if [[ -z "$JARVIS_CODEX" ]]; then printf 'Codex is not on PATH. Install the official Codex CLI, then rerun this installer. Local application features remain available.\n'; fi
