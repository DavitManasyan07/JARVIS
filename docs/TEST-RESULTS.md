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

## Limits of the tests

Physical microphone and speaker tests were not performed. The specified computer has no audio hardware.

Live speech recognition and synthesis were not performed. A separate OpenAI audio API key was not supplied. Documented provider request formats, failures, cancellation, and audio samples were tested with explicit fixtures.

Codex authentication was available. Authenticated Codex tests were not blocked.

The tests did not validate other Linux distributions or other Codex protocol versions. The Codex runtime is a prerelease.

The editor checks project boundaries and selected file targets. Another process with the same Linux user can still change filesystem paths between checks and operations. These checks are not an operating-system sandbox for other processes.

The ASD-STE100 Issue 9 review was a project language review. It was not an independent certification.

Test artifacts are in the ignored `.dev/` folder. They are not included in the installed application or committed to the source repository.
