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

Ubuntu can restrict unprivileged user namespaces. JARVIS then needs a compatible, root-owned Chromium sandbox helper.

A packaged `chrome-sandbox` file takes precedence over `CHROME_DEVEL_SANDBOX`. An environment setting alone does not correct an unconfigured packaged helper.

The installer links the runtime's `chrome-sandbox` to a validated system helper. It checks API compatibility, ownership, permissions, and parent folders.

The launcher checks its configured helper before it starts Electron. An invalid helper causes a nonzero exit and an error message.

The error includes the installer command and diagnostic log path. A desktop dialog or notification appears when an available system utility supports it.

If an older installation reports a SUID helper failure, use `bash install.sh` again. The update preserves local data and replaces the packaged helper correctly.

If no compatible helper exists, installation stops. An administrator must provide supported Chromium sandbox facilities before installation can continue.

Do not make user-writable application files setuid. Do not change AppArmor policy or disable the sandbox to suppress the error.

A test started from an IDE can inherit different security permissions. A successful IDE test does not establish that a normal desktop launch works.

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

## A microphone message does not send

1. Make sure that a conversation is open.
2. Examine the Codex connection status.
3. Examine the audio API key status in **Settings → Voice**.
4. Select **Automatic** microphone mode for sending after a pause.
5. Start a recording.
6. Examine the input level while you speak.
7. Read any displayed transcription error.

A recording with no detected speech is canceled after eight seconds. It is not uploaded. A quiet microphone can require a different input device or system input level.

The pause timer starts after speech is detected. **Pause before sending** defaults to 1.2 seconds. The maximum recording time is 60 seconds.

**Ctrl+Space** uses manual push-to-talk behavior. After release, review the transcript and select **Send**, unless **Send manual transcripts automatically** is enabled.

A busy conversation or existing draft blocks automatic recording. Send or clear the draft before another automatic message.

A conversation change does not redirect a recording. Examine the conversation that was selected when recording started.

If another task starts or a draft changes during transcription, the transcript is kept for review. It is not sent automatically again.

The audio API key and Codex sign-in are separate requirements. A successful Codex sign-in does not establish transcription access.

JARVIS does not automatically repeat a failed audio request. The error remains visible so you can decide whether to record again.

## JARVIS replies with speech

1. Open **Settings → Voice**.
2. Turn **Speak assistant responses** off.

Automatic microphone messages always use written replies. This setting also keeps other replies written. The audio provider key is preserved.

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

## Codex cannot create its command sandbox

On this computer, Ubuntu blocks the namespace operations that Codex needs for sandboxed commands from a normal desktop session. Text replies, sign-in, and history still work.

A task can report a bubblewrap error or request permission to run outside the sandbox. Do not treat that request as proof that the command succeeded. JARVIS does not automatically weaken the selected permission mode.

The documented system remedy involves an AppArmor policy change. JARVIS has not made this change. See the [official Codex sandbox documentation](https://learn.chatgpt.com/docs/sandboxing) for the platform requirements.
