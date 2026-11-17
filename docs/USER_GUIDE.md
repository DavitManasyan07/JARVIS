# User guide

## Projects and workspaces

A project is a folder on this computer. It does not have to be a Git repository.

1. Open the **File** menu.
2. Select **Open Folder**.
3. Select the project folder.

The project path is shown in the application. Opening a folder does not execute its scripts or upload its contents.

**New Project/Folder** creates a folder. **Open Recent** gives access to previously opened project folders. **Close Project** closes the explorer's current folder.

A workspace file stores the project path and application layout settings. It does not contain project files or credentials.

1. Select **File → Save Workspace**.
2. Select the destination file.

Use **File → Open Workspace** to restore that configuration. The documented JSON format is in [Development](DEVELOPMENT.md).

## Explorer and files

Select a folder arrow to show its contents. Use the filter field to find names. Use the hidden-file control to show hidden items.

The explorer watches only folders that you open in the explorer. It does not recursively watch the filesystem root.

Select a text file to open the editor. An unsaved-change indicator identifies changed text.

1. Change the text.
2. Select **Save**, or use **Ctrl+S**.

Use **Save As** to select a different destination. The application warns before it replaces an externally changed file.

Supported images open in a preview. Binary files and text files larger than 2 MiB do not open in the text editor.

Use an item's context menu for these operations:

- Create a file or folder.
- Rename an item.
- Copy the path.
- Show the item in the system file manager.
- Move the item to the trash, after confirmation.

A symbolic link cannot bypass the project boundary. Use **Open File** to explicitly select a file outside the project.

## Conversations

Each conversation retains its own project path. A change to the explorer's project does not change an existing conversation's working folder.

1. Open a project.
2. Create a conversation.
3. Enter a message in the composer.
4. Press **Enter** to send the message.

Use **Shift+Enter** for a new line. Drafts remain available when you change conversations.

The conversation list supports title search. Conversation actions include rename, archive, local removal, and export.

A conversation resumes its existing Codex thread. JARVIS does not create a new thread from a copied transcript.

**Archive** archives the backend Codex thread. **Remove locally** removes the JARVIS reference. Neither operation promises permanent provider-side deletion.

Use **Export** to write a local conversation file. Examine exported content before you share it.

Messages support Markdown and code blocks. Code blocks have Copy controls. Raw message HTML is not executed.

Task activity shows real events from Codex. Expand command output or file changes to examine available details.

Use **Latest message** when you scroll away from the current reply. Long histories show a bounded recent section for responsiveness.

## Approvals and Stop

An approval request shows the proposed action. Examine the action before you accept it. Reject the request if the action is not acceptable.

**Stop** requests a Codex turn interruption. It also stops JARVIS-owned recording, speech requests, and playback.

The application reports interruption state separately from confirmed process termination. An interrupted turn can leave backend background processes active.

## Voice input

The microphone is off at startup. Recording starts only after a microphone-button action or the push-to-talk keyboard control.

**Automatic** is the default microphone-button mode. It detects a pause after speech and sends the recognized text without **Enter**.

1. Open a project and a conversation.
2. Connect a microphone.
3. Select the device in **Settings → Input**.
4. Configure the separate audio API key in **Settings → Voice**, if necessary.
5. Select the microphone button.
6. Speak your message.
7. Pause after your last word.

The selected silence pause ends the recording after speech. **Pause before sending** defaults to 1.2 seconds and permits 0.6 to 4 seconds.

JARVIS then requests transcription and sends the transcript. No Enter key action is necessary.

The sent transcript remains visible in the conversation. Automatic microphone messages receive text-only replies. They do not start synthesized speech.

If no speech is detected for eight seconds, recording is canceled. That recording is not uploaded. A recording cannot exceed 60 seconds.

Use **Escape** or the visible cancel control to discard a recording. No continuous recording or wake word is enabled.

The conversation selected when recording starts receives the message. Changing conversations does not redirect it. If no conversation is open, JARVIS creates one in the current project.

Automatic recording requires a configured audio key and an available, signed-in Codex connection. A busy conversation or existing draft must be resolved first.

If a draft changes or the conversation becomes busy during transcription, JARVIS appends the transcript for review. It does not retry sending automatically.

### Review a transcript before sending

**Manual** permits transcript review. Select it under **Settings → Voice → Microphone button** to finish button recordings with a second press.

Keep **Send manual transcripts automatically** off when you need to correct the transcript.

1. Hold **Ctrl+Space**.
2. Speak your message.
3. Release **Ctrl+Space**.
4. Examine the recognized transcript.
5. Correct the transcript when necessary.
6. Select **Send**.

The keyboard control keeps this release-to-finish behavior in either microphone-button mode. The **Send manual transcripts automatically** setting can send manual transcripts immediately.

That manual automatic-transcript setting is off by default. Automatic microphone-button mode sends after the pause regardless of that setting.

The input waveform uses actual microphone samples. With no input device, it stays flat and shows an unavailable-device status.

The visualization test mode uses generated signals. Its label identifies test operation. Test operation is not live microphone input.

## Voice output

Spoken responses are off by default. Automatic microphone messages always receive text-only replies. Other messages use the **Speak assistant responses** setting.

Microphone transcription does not require spoken responses. Changing this setting does not remove the configured audio API key.

Optional spoken replies use an AI-generated voice. The written response remains available if speech generation or playback fails.

JARVIS sends selected assistant reply text for synthesis. It removes code blocks and common credential patterns before this request.

This filter cannot identify every private value. Keep spoken responses off for sensitive material.

The sphere uses analysis of the audio being played. Processing animation does not indicate that speech is playing.

The application stops output before microphone capture to reduce acoustic feedback. Device changes do not require installation again.

## Settings

| Group            | Function                                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| General          | Startup workspace, session restoration, appearance, text size, animation, and reduced motion                           |
| Codex            | Connection, sign-in, runtime version, discovered models, and diagnostics                                               |
| Voice            | Provider key, microphone mode, pause, voice, playback speed, language, spoken responses, and manual transcript sending |
| Input            | Microphone, real input level, echo cancellation, and noise suppression                                                 |
| Output           | Available output devices, volume, and playback test                                                                    |
| Privacy and data | Data locations, conversation export and retention information                                                          |
| Permissions      | Read-only access, workspace access, and Full access                                                                    |

Panel widths and window position remain available after restart. The View menu can close or open the side panels.

Output-device selection depends on runtime support. If unavailable, the system default is used and the setting explains the limitation.

## Permissions

**Read-only** uses Codex's read-only sandbox. **Workspace access** permits changes in the conversation's project under the supported Codex workspace policy.

These modes restrict changes. They do not guarantee that Codex can read only the project. Codex can read other files that its configured sandbox permits.

Permission modes use backend sandbox controls. They are not only text instructions. The effective backend policy remains subject to Codex requirements.

**Warning:** Full access can permit commands to affect files accessible to your user account.

Full access requires deliberate confirmation. A persistent warning remains visible while this mode is selected.

Permission changes cannot safely change work that is already running. Stop the current turn before you change the mode.

## Local data and privacy

The Privacy settings show the actual data locations. SQLite stores settings, recent projects, drafts, and conversation references.

Codex retains conversation history through its own supported mechanisms. JARVIS credentials are separate from Codex authentication.

Raw microphone audio is held temporarily for transcription. JARVIS does not save raw recordings by default.

The OpenAI services receive requests only when you use their features. Network failures leave local files and settings available.
