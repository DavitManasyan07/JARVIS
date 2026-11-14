# Development

## Architecture

JARVIS uses Electron, React, TypeScript, Vite, Three.js, and SQLite. The packaged Electron runtime supplies `node:sqlite`.

SQLite does not need a separately compiled native npm module. Production tests must still use the packaged Electron runtime.

| Location              | Function                                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/main/`           | Desktop process, validated IPC, filesystem access, Codex transport, persistence, and voice providers |
| `src/renderer/`       | React interface, graphics, Web Audio analysis, and device operation                                  |
| `src/protocol/`       | Generated Codex protocol definitions                                                                 |
| `src/shared.ts`       | Application types and default settings                                                               |
| `scripts/build.mjs`   | Desktop-process and preload bundles                                                                  |
| `scripts/package.mjs` | Production Electron directory package                                                                |
| `tests/`              | Unit, integration, and packaged-interface tests                                                      |
| `assets/`             | Original application icon                                                                            |

The renderer has no Node.js integration. Context isolation and renderer sandboxing remain enabled. A narrow preload bridge exposes validated application operations.

The desktop process validates IPC senders and arguments. It rejects navigation outside the local application. Project contents and message HTML cannot execute renderer scripts.

The filesystem service grants access to the selected project and explicitly opened files. Watchers cover opened explorer directories, with a fixed limit.

The Codex service uses JSON-RPC messages over a managed child's standard input and output. Diagnostics use a separate stream.

Conversation metadata stores backend thread identifiers. Codex thread history remains the source of truth for messages and activity.

## Tested versions

The dependency lockfile gives exact npm versions and integrity values. Application dependencies are pinned in `package.json`.

| Component            | Version used during implementation |
| -------------------- | ---------------------------------- |
| Linux                | Ubuntu 24.04.4 LTS, x86_64         |
| Desktop              | GNOME, X11                         |
| Development Node.js  | 26.13.0                            |
| npm                  | 11.20.0                            |
| Electron             | 45.3.2                             |
| Codex CLI            | 0.169.0-alpha.11.1                 |
| ASD-STE100 reference | Issue 9, January 2025              |

The installed Codex version is a prerelease. Generated protocol types match this version. Compatibility with other protocol versions requires validation.

No reference screenshots were provided as separate image files. The original interface and procedural graphics use the written descriptions.

## Development commands

1. Install the locked packages:

   ```bash
   npm ci
   ```

2. Start the development application:

   ```bash
   npm run dev
   ```

The development command builds the renderer before Electron starts. A separate browser window is not required.

Use these validation commands:

```bash
npm run format:check
npm run typecheck
npm test
npm run package
npm run test:e2e
npm run test:install
```

To apply project formatting, use:

```bash
npm run format
```

The package is written to `build/linux-unpacked/`. The installer copies the package to a staged per-user release.

## Codex protocol

1. Examine the installed Codex version:

   ```bash
   codex --version
   ```

2. Examine protocol-generation options:

   ```bash
   codex app-server generate-ts --help
   ```

3. Generate matching definitions when you intentionally update the integration:

   ```bash
   codex app-server generate-ts --out src/protocol
   ```

4. Review the resulting changes.
5. Repeat protocol and packaged-application tests.

The application initializes the connection before other requests. It supports thread creation, thread resumption, turns, streamed events, approvals, and interruption.

Connection recovery requires a visible user action. Failed mutations are not automatically repeated. Cancellation reports the backend response rather than only hiding streamed output.

Read-only and workspace modes use supported backend sandbox policies. Full access requires confirmation in the application.

## Workspace file format

A workspace is a UTF-8 JSON file. The application validates its format before it opens the project.

The version 1 format is:

```json
{
  "version": 1,
  "project": "/absolute/path/to/project",
  "panels": {
    "explorerWidth": 248,
    "chatWidth": 410,
    "showExplorer": true,
    "showChat": true
  }
}
```

`project` can be `null`. Relative project paths refer to the workspace file's folder. Saved files use the active project's absolute path.

No credentials or file contents belong in a workspace file.

## Voice providers

The provider interface is in `src/main/voice.ts`. OpenAI supplies transcription through `/v1/audio/transcriptions` with `gpt-transcribe`. The optional language field uses the documented `languages[]` parameter.

Speech generation uses Realtime `gpt-realtime-2.1-mini`. Received 24 kHz PCM samples are wrapped in a WAV file for playback.

The deprecated `/audio/speech` path is not used. API access for these models must be available on the separate API account.

Provider requests remain in the desktop process. Credentials do not pass to the renderer. The renderer receives audio data and transcription text.

Capture starts only after an explicit user action. The default transcript path permits correction before a message is sent.

Web Audio analysis uses actual input or playback samples. Generated visualization fixtures remain explicitly labeled as tests.

## Test interpretation

Mock transports and fixture signals are test inputs. They are not production providers or fabricated agent replies.

Authenticated Codex tests require a valid local account and available service. Missing credentials must be reported as a blocked test.

Live microphone and speaker tests were not possible on the specified computer. Device-state and audio-signal fixtures do not verify physical hardware.

For an optional authenticated integration test, use:

```bash
npm run test:live
```

This command uses the real configured Codex service. It can consume account usage. It verifies a real reply, command activity, and thread resumption.

The final handoff records the executed checks and their results. A development build alone does not establish that installation or packaged startup works.

## Configuration and data

The application follows XDG locations. Default locations appear in [Installation](INSTALL.md) and in Privacy settings.

The [runtime configuration example](runtime.example.json) contains no credentials. The installer writes the detected executable path automatically.

The database uses migrations and WAL journaling. Private data is outside the source repository. Configuration examples must not contain credentials.

Never add a real API key to a test fixture, diagnostic log, screenshot, or export. The `.dev/` folder is ignored and is not packaged.
