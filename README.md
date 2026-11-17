# JARVIS

JARVIS is a Linux desktop application for Codex. It has a project explorer, a text editor, conversations, and an optional voice connection.

The application uses a local Codex app server. It does not control VS Code. Text operation does not need a microphone or speakers.

## Requirements

- Ubuntu 24.04, x86_64. This is the tested installation target.
- A normal desktop user account and a graphical session.
- Internet access for the first installation and for online services.
- Codex access for agent tasks. Voice needs separate OpenAI API access and billing.

The installer uses Node.js 24 or later. If necessary, it installs a private Node.js 24 runtime. The packaged application contains Electron.

## Installation

1. Open a terminal in the source folder.
2. Use this command:

   ```bash
   bash install.sh
   ```

3. Start the application:

   ```bash
   jarvis
   ```

If the installer changes PATH, open a new login terminal. You can immediately use `~/.local/bin/jarvis`.

You can also select **JARVIS** in the desktop application launcher.

To open a project, use:

```bash
jarvis /path/to/project
```

Relative paths refer to the terminal's current folder. Put quotation marks around paths that contain spaces.

## First start

1. Select **Open Folder**.
2. Select your project folder.
3. Open **Settings**.
4. Select the **Codex** group.
5. Examine the connection status.
6. Complete sign-in if the account is not connected.
7. Create a conversation.
8. Enter a message.
9. Select **Send**.

An existing supported Codex sign-in can be used automatically. JARVIS does not copy the sign-in tokens.

The initial permission mode is **Workspace access**. Agent instructions in the project, including applicable `AGENTS.md` files, remain applicable.

## Microphone messages

The microphone button uses **Automatic** mode by default. A separate OpenAI audio API key is required for transcription.

1. Open a project and a conversation.
2. Configure the audio provider in **Settings → Voice**, if necessary.
3. Select the microphone button.
4. Speak your message.
5. Pause after your last word.

After detected speech, the selected pause ends the recording. The default is 1.2 seconds. JARVIS transcribes and sends without **Enter**.

Automatic microphone replies stay as text. The microphone turns off after each message. Spoken responses are also off by default for other messages.

Hold **Ctrl+Space** for manual recording. Release it to review the transcript. Keep **Send manual transcripts automatically** off for this review.

The microphone button also supports **Manual** mode.

## Operation without audio hardware

Keep spoken responses off. Use the message composer for all conversations. The input waveform stays inactive when no microphone is available.

You can connect audio hardware later. The application detects device changes. Installation is not necessary again.

## Documentation

- [Installation and removal](docs/INSTALL.md)
- [User guide](docs/USER_GUIDE.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Development](docs/DEVELOPMENT.md)
- [Language review](docs/STE-REVIEW.md)
- [Sources and licenses](docs/SOURCES.md)

Documentation uses ASD-STE100 Issue 9 as a writing reference. A complete independent language review has not been done. This documentation has no certification.

JARVIS source code and original graphics use the [MIT License](LICENSE). Third-party components retain their own licenses.
