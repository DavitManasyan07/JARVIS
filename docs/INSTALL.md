# Installation

## Supported system

The tested system is Ubuntu 24.04 x86_64 with GNOME and X11. Other distributions and architectures are not supported by the installer.

The installer does not need audio hardware or API credentials. An offline first installation is not supported because npm must obtain locked packages.

## Install the application

1. Obtain the complete source repository.
2. Open a terminal.
3. Use the path to the installer:

   ```bash
   bash /path/to/JARVIS/install.sh
   ```

4. Read the installation result.
5. Open a new login terminal if PATH changed.
6. Use `jarvis` to start the application.

Do not use `sudo bash install.sh`. The application must operate as your normal user.

The script obtains locked npm packages. npm checks their integrity values. Electron's package installer checks the downloaded runtime against its published checksums.

If Node.js is absent or too old, the script obtains a private Node.js 24 runtime. It checks the official SHA-256 checksum.

Missing Ubuntu shared libraries require a separate apt operation. The script identifies this operation and requests authorization first.

JARVIS keeps Chromium's security sandbox enabled. The installer can use an existing, compatible system Chromium sandbox helper.

The helper must belong to root and have mode `4755`. All its parent folders must belong to root and prevent other users from changes.

The installer compares the helper API versions. It replaces the staged runtime's helper with a symbolic link to the validated system helper.

This operation does not need administrator access or change the system helper. Without a compatible helper, restricted systems stop with an installation explanation.

## Connect Codex

1. Open **Settings**.
2. Select **Codex**.
3. Examine the runtime and account status.
4. Select **Reconnect** if the runtime is disconnected.
5. Select **Sign in** if authentication is necessary.
6. Complete the supported browser sign-in procedure.
7. Return to JARVIS.

JARVIS uses the installed `codex` command. The installer records its executable path for desktop sessions with a different PATH.

If Codex is absent, install the official [Codex CLI](https://developers.openai.com/codex/cli/). Then use `bash install.sh` again.

JARVIS does not install a conflicting global Codex package. It does not change existing Codex settings or copy authentication tokens.

## Connect optional voice services

Voice uses a separate OpenAI API key. A Codex or ChatGPT subscription does not automatically provide this API access.

Audio requests can cause separate service charges. A recording goes to OpenAI only after you start recording and request transcription.

1. Open **Settings**.
2. Select **Voice**.
3. Enter an OpenAI API key with audio API access.
4. Select session-only storage or secure storage.
5. Save the key.
6. Select a voice.
7. Connect audio hardware when necessary.
8. Enable spoken responses if you want audio output.

Secure storage requires a working operating-system secret store. JARVIS refuses plaintext persistence when the secret store is unavailable.

Session-only credentials remain in memory until the application exits. Raw microphone recordings are not retained by default.

## Update

1. Close JARVIS.
2. Update the source repository.
3. Use `bash install.sh` again.
4. Start JARVIS.

The script builds a new runtime before it changes the active runtime. A failed build preserves the previous installation.

Updates preserve settings, conversation references, credentials, and projects. Old packaged releases can remain available until removal.

## Remove the application

1. Close JARVIS.
2. Use this command from the source folder:

   ```bash
   bash uninstall.sh
   ```

The script removes JARVIS-managed runtime releases, launcher files, and icons. It preserves local data, the source repository, and projects.

For optional local data removal, use:

```bash
bash uninstall.sh --remove-data
```

The script requires the exact confirmation text `DELETE JARVIS DATA`. Local data removal does not delete Codex history or provider-side data.

The marked PATH entry in `~/.profile` is preserved. Other per-user commands can use this folder.

## Installation locations

| Item                        | Default location                                        |
| --------------------------- | ------------------------------------------------------- |
| Executable launcher         | `~/.local/bin/jarvis`                                   |
| Desktop entry               | `~/.local/share/applications/io.jarvis.Desktop.desktop` |
| Runtime releases            | `~/.local/share/jarvis/releases/`                       |
| Active runtime              | `~/.local/share/jarvis/runtime`                         |
| Icon files                  | `~/.local/share/icons/hicolor/`                         |
| Runtime configuration       | `~/.config/jarvis/runtime.json`                         |
| SQLite database             | `~/.local/share/jarvis/jarvis.sqlite3`                  |
| Electron user configuration | `~/.config/jarvis/electron/`                            |
| Encrypted voice credential  | `~/.config/jarvis/voice-key.enc`                        |
| Diagnostics                 | `~/.local/state/jarvis/diagnostics.log`                 |
| Electron cache              | `~/.cache/jarvis/electron/`                             |

XDG environment variables can change the data, configuration, cache, and state locations. The executable launcher remains in `~/.local/bin`.
