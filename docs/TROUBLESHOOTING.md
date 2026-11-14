# Troubleshooting

## The jarvis command is not found

1. Use `~/.local/bin/jarvis`.
2. Examine the installer's PATH message.
3. Open a new login terminal.

For the current terminal, use:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

The installer adds only a marked block to `~/.profile`. It preserves existing shell configuration.

## The window does not open

1. Make sure that a desktop session is active.
2. Examine `~/.local/state/jarvis/launcher.log`.
3. Examine the diagnostics location shown in Privacy settings, if the application opens.
4. Use `bash install.sh` again if the packaged files are incomplete.

Do not start JARVIS as root. Do not add `--no-sandbox`.

Ubuntu can restrict unprivileged user namespaces. The installer can use a trusted, root-owned Chromium sandbox helper already present on the computer.

If no helper is available, installation stops with an explanation. A system administrator must provide supported Chromium sandbox facilities.

The installer does not change AppArmor policy or system security settings. A helper from another Chromium build can be incompatible with Electron.

If diagnostics report a helper API mismatch, obtain a compatible system sandbox helper. Do not disable sandboxing to suppress the error.

## Codex is disconnected

1. Open **Settings → Codex**.
2. Examine the runtime version and diagnostic message.
3. Select **Reconnect**.
4. Complete sign-in if the account has expired.

A GUI session can have a different PATH from a terminal. The installer records the installed Codex path in `~/.config/jarvis/runtime.json`.

If that executable moved, use `bash install.sh` again. The script preserves application data and refreshes the executable path.

Unsupported Codex protocol versions can fail during initialization. Use the tested version or validate a newer version before deployment.

## A request fails or reaches a service limit

1. Read the displayed error.
2. Examine the account and model settings.
3. Check your network connection.
4. Send the request again only when you intend to repeat it.

JARVIS does not automatically repeat failed agent mutations. Check files and command activity before you repeat an interrupted task.

A model list comes from Codex. An unavailable model is not replaced silently with an invented model.

## A project is missing

1. Make sure that the folder still exists.
2. Select **File → Open Folder**.
3. Select the current folder location.

A moved folder does not automatically change existing conversation working folders. Create a conversation for the new folder or restore the old location.

## A file cannot be opened or saved

1. Examine the file's access permissions.
2. Make sure that the file is in the selected project.
3. Use **Open File** for a file outside the project.
4. Use **Save As** if the original destination is not writable.

The text editor supports UTF-8 text up to 2 MiB. Binary files and larger files require an external application.

The explorer does not follow a symbolic link outside the project. This restriction prevents an unnoticed change of filesystem scope.

## No microphone is available

Text operation remains available. No permission dialog is necessary at startup.

1. Connect a microphone.
2. Open **Settings → Input**.
3. Select the device.
4. Start a short recording.

If the device does not appear, examine the operating system's Sound settings. Device changes are detected without installation again.

If a device is removed during recording, cancel the recording. Connect or select a device before the next recording.

## There is no speech output

1. Examine **Settings → Voice**.
2. Make sure that a separate audio API key is configured.
3. Make sure that spoken responses are enabled.
4. Connect speakers or headphones.
5. Examine **Settings → Output**.
6. Select a playback test.

A successful network request does not prove that physical speakers produced sound. Examine the operating system's output-device selection and volume.

If output selection is unavailable, JARVIS uses the system default. No installation change is necessary when speakers are connected later.

## The API key cannot be retained

1. Make sure that the desktop secret store is unlocked.
2. Select session-only storage if secure storage is unavailable.
3. Enter the key again.

JARVIS does not fall back to plaintext key persistence. Session-only keys are discarded when the application exits.

## The animation is slow

1. Open **Settings → General**.
2. Select low animation quality.
3. Enable reduced motion if necessary.

Animation is reduced when the window is hidden. If WebGL is unavailable, the application uses a fallback visualization.

## Data recovery

1. Close JARVIS before you copy its database files.
2. Copy the data locations shown in Privacy settings.
3. Keep the copy private.

Reinstallation preserves local data. Removing a local conversation reference does not delete the backend Codex thread.

## Unsupported service forms

Some connected tools request an interactive MCP form. JARVIS shows the request, but it cannot display every external form schema. Decline or cancel an unsupported form. Use a client that supports the required form to continue that operation.
