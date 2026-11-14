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

The microphone is off at startup. Push-to-talk operation requires a deliberate user action. Continuous recording and wake-word operation are not enabled.

1. Connect a microphone.
2. Select the microphone in **Settings → Input**.
3. Press the microphone control to start recording.
4. Speak your message.
5. Press the control again to stop recording.
6. Examine the recognized transcript.
7. Correct the transcript when necessary.
8. Select **Send**.

Use the visible cancel control to discard a recording. Automatic transcript sending is an optional setting.

The input waveform uses actual microphone samples. With no input device, it stays flat and shows an unavailable-device status.

The visualization test mode uses generated signals. Its label identifies test operation. Test operation is not live microphone input.

## Voice output

Spoken replies use an AI-generated voice. The written response remains available if speech generation or playback fails.

JARVIS sends selected assistant reply text for synthesis. It removes code blocks and common credential patterns before this request.

This filter cannot identify every private value. Keep spoken responses off for sensitive material.

The sphere uses analysis of the audio being played. Processing animation does not indicate that speech is playing.

The application stops output before microphone capture to reduce acoustic feedback. Device changes do not require installation again.

## Settings

| Group            | Function                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------- |
| General          | Startup workspace, session restoration, appearance, text size, animation, and reduced motion |
| Codex            | Connection, sign-in, runtime version, discovered models, and diagnostics                     |
| Voice            | Provider key, voice, playback speed, language, spoken responses, and transcript sending      |
| Input            | Microphone, real input level, echo cancellation, and noise suppression                       |
| Output           | Available output devices, volume, and playback test                                          |
| Privacy and data | Data locations, conversation export and retention information       |
| Permissions      | Read-only access, workspace access, and Full access                                          |

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
