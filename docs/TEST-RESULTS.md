# Validation record

Date: 14 November 2026. System: Ubuntu 24.04.4 LTS, x86_64, GNOME, X11.

## Executed checks

- Formatting and TypeScript checks passed.
- 56 unit and integration fixture tests passed.
- The installer fixture passed. It includes paths with spaces, repeat installation, conflicting commands and desktop entries, and data preservation.
- The packaged Electron application started with its Chromium sandbox enabled. The renderer had no Node.js access.
- Packaged interface tests passed for project access, file creation, editing, saving, workspace files, drafts, restart persistence, invalid IPC, and missing projects.
- Interface images were inspected at 1366 × 768 and 1920 × 1080.
- Oversized saved panels fit a smaller 1000 × 720 viewport.
- The installed `jarvis` command opened a relative project path with spaces.
- Repeated launches focused the existing application instance.
- The installed desktop entry activated the existing application.
- A real update with `bash install.sh` passed from `/`. The existing per-user SQLite database had the same SHA-256 checksum after installation.
- Generated audio fixtures verified microphone bar symmetry, inactive input, and cancellation after device disconnection.
- The generated-signal visualization remained labeled as a test.
- Unsafe Markdown and project HTML remained inactive.

## Restart failure and repair

Date: 15 November 2026.

The first validation started from the IDE's inherited security context. It did not establish startup from an independent, unconfined desktop process.

After restart, normal desktop launch failed. Chromium selected the adjacent user-owned `chrome-sandbox` before the configured external helper.

The repaired installation links that adjacent path to the compatible system helper. Both helper API queries returned `1`.

A new launch from an explicitly unconfined process passed. The main process used the normal user account. A sandboxed child had seccomp enabled and `NoNewPrivs` set.

No administrator access or system security changes were necessary. A physical system restart after this repair has not been tested.

Fresh command-line and desktop-entry launches passed in the normal desktop security context after the repair installation. Each test used a new local data directory. The tests checked the visible window, selected project, normal user identity, and active renderer sandbox.

## Real Codex service

The installed runtime was `codex-cli 0.169.0-alpha.11.1`.

The supported app-server connection used the existing local sign-in. The application did not extract or copy authentication tokens.

These checks passed:

- Initialize the local standard-input/output connection.
- Discover available models.
- Stream a real assistant reply.
- Display real command activity in the packaged interface.
- Read the saved thread after an application restart.
- Continue with the same thread identifier.
- Deny a write outside the workspace in workspace mode.
- Deny a write in read-only mode.
- Interrupt a real running turn.
- Archive the test conversations.

The interruption result confirmed the turn status. It did not confirm termination of all background subprocesses.

## Automatic microphone messages

Date: 17 November 2026.

Formatting and TypeScript checks passed. The unit and integration suites passed 68 tests in 11 files. The general packaged suite passed 14 checks.

The packaged microphone suite passed 10 checks from an unconfined desktop security context. It used generated PCM samples, actual MediaRecorder capture, and production IPC.

Speech recognition and Codex used explicit test providers. No physical microphone was captured. No external speech service or real provider key was used.

These checks passed:

- Missing audio credentials prevent capture and upload.
- One microphone click records a generated signal. A silence pause ends capture and sends exactly one transcript.
- A short pause remains in the same recording.
- No-speech timeout and recording cancellation prevent upload.
- Existing drafts prevent automatic recording.
- Conversation changes preserve the original message destination.
- Draft changes during transcription retain both texts for review.
- Canceled transcription ignores a late provider result.
- Ctrl+Space retains manual transcript review.

Automatic microphone replies remained written. The suite recorded zero synthesis requests, including when the general spoken-response setting was enabled.

These results verify application behavior with fixtures. They do not establish physical recording quality, speech-recognition accuracy, or live audio-provider access.

## Limits of the tests

Physical microphone and speaker tests were not performed during initial validation. Audio hardware was unavailable at that time.

Live speech recognition and synthesis have not been verified. Initial validation had no separate OpenAI audio API key. Provider request formats, failures, cancellation, and audio samples were tested with explicit fixtures.

Codex authentication was available. Authenticated Codex tests were not blocked.

The tests did not validate other Linux distributions or other Codex protocol versions. The Codex runtime is a prerelease.

The editor checks project boundaries and selected file targets. Another process with the same Linux user can still change filesystem paths between checks and operations. These checks are not an operating-system sandbox for other processes.

The ASD-STE100 Issue 9 review was a project language review. It was not an independent certification.

Test artifacts are in the ignored `.dev/` folder. They are not included in the installed application or committed to the source repository.

## Codex command restriction in the normal desktop context

A separate real test on 15 November 2026 used the normal desktop security context. Authentication, model discovery, streamed text, and history passed.

The read-only command test failed. Ubuntu blocked namespace operations required by Codex's bubblewrap sandbox. Codex already used the installed `/usr/bin/bwrap`. The test declined the request to run outside the sandbox. The test thread was archived.

The earlier successful command tests inherited the IDE security context. Those results do not establish sandboxed command execution from a normal desktop launch.

The documented system remedy requires an AppArmor policy change. The user prohibited system security changes. No policy was changed, and JARVIS did not weaken the selected Codex permission mode. Text chat and local application features remain available.

The ten voice-flow checks also passed against the installed runtime in the normal desktop security context. Fresh command-line and desktop-entry launches passed after the update.

The installed user preferences select Automatic microphone mode, a 1.2-second pause, and no spoken responses. Other preferences and the audio-key files were preserved. These tests did not use physical microphone input or a paid audio provider.
