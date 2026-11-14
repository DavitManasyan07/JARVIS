#!/usr/bin/env bash
# Select an already installed Chromium helper. This script never installs SUID files.
# Chromium's documented --get-api query performs no sandbox or system changes.
jarvis_trusted_sandbox_helper() {
  local candidate=$1 expected_api=$2 canonical metadata directory directory_mode actual_api
  canonical=$(readlink -e -- "$candidate") || return 1
  [[ -f "$canonical" && -x "$canonical" ]] || return 1
  metadata=$(stat -c '%u:%g:%a' -- "$canonical") || return 1
  [[ "$metadata" == '0:0:4755' ]] || return 1
  directory=$(dirname -- "$canonical")
  while :; do
    [[ $(stat -c '%u' -- "$directory") == 0 ]] || return 1
    directory_mode=$(stat -c '%a' -- "$directory") || return 1
    (( (8#$directory_mode & 8#22) == 0 )) || return 1
    [[ "$directory" != / ]] || break
    directory=$(dirname -- "$directory")
  done
  actual_api=$("$canonical" --get-api 2>/dev/null) || return 1
  [[ "$actual_api" =~ ^[0-9]+$ && "$actual_api" == "$expected_api" ]] || return 1
  printf '%s\n' "$canonical"
}
