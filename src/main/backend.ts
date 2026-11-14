import { dialog, clipboard, shell, type BrowserWindow } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { Store } from "./store";
import { Files } from "./files";
import { CodexEngine, redactDiagnostic } from "./codex";
import { VoiceService } from "./voice";
import { string, pathString, name, settingsPatch, idArgs } from "./validation";
import type { JarvisEvent } from "../shared";

const empty = z.object({}).strict();
export const schemas: Record<string, z.ZodType> = {
  bootstrap: empty,
  "project.open": z.object({ path: pathString.optional() }).strict(),
  "project.close": empty,
  "project.new": empty,
  "workspace.open": empty,
  "workspace.save": empty,
  "file.open": empty,
  "fs.list": z
    .object({ path: pathString, hidden: z.boolean().optional() })
    .strict(),
  "fs.read": z.object({ path: pathString }).strict(),
  "fs.save": z
    .object({
      path: pathString,
      content: z.string().max(2 * 1024 * 1024),
      saveAs: z.boolean().optional(),
    })
    .strict(),
  "fs.create": z
    .object({ parent: pathString, name, directory: z.boolean() })
    .strict(),
  "fs.rename": z.object({ path: pathString, name }).strict(),
  "fs.trash": z.object({ path: pathString }).strict(),
  "fs.reveal": z.object({ path: pathString }).strict(),
  "fs.copyPath": z.object({ path: pathString }).strict(),
  "settings.update": z.object({ patch: settingsPatch }).strict(),
  "settings.clearRecents": empty,
  "conversations.list": empty,
  "conversations.create": z
    .object({
      project: pathString,
      title: z.string().min(1).max(200).optional(),
    })
    .strict(),
  "conversations.history": z
    .object({ id: string.min(1), cursor: string.min(1) })
    .strict(),
  "conversations.open": idArgs,
  "conversations.delete": idArgs,
  "conversations.archive": idArgs,
  "conversations.export": idArgs,
  "conversations.update": z
    .object({
      id: string.min(1),
      title: z.string().min(1).max(200).optional(),
      draft: z.string().max(100000).optional(),
    })
    .strict(),
  "chat.send": z
    .object({ id: string.min(1), text: z.string().trim().min(1).max(100000) })
    .strict(),
  "chat.stop": idArgs,
  "approval.respond": z
    .object({ id: z.union([z.string(), z.number()]), result: z.unknown() })
    .strict(),
  "codex.connect": empty,
  "codex.status": empty,
  "codex.login": empty,
  "voice.configure": z
    .object({ key: z.string().min(8).max(2048), remember: z.boolean() })
    .strict(),
  "voice.clearKey": empty,
  "voice.cancel": empty,
  "voice.transcribe": z
    .object({
      data: z
        .array(z.number().int().min(0).max(255))
        .min(1)
        .max(24 * 1024 * 1024),
      mime: z.enum([
        "audio/webm",
        "audio/webm;codecs=opus",
        "audio/ogg",
        "audio/ogg;codecs=opus",
        "audio/wav",
      ]),
      language: z.string().max(12).optional(),
    })
    .strict(),
  "voice.speak": z.object({ text: z.string().min(1).max(200000) }).strict(),
  "clipboard.writeText": z
    .object({ text: z.string().max(2 * 1024 * 1024) })
    .strict(),
  "app.exit": empty,
  "external.open": z.object({ url: z.string().url().max(8192) }).strict(),
};
export class Backend {
  readonly files: Files;
  readonly voice: VoiceService;
  private busy = new Set<string>();
  private uncertain = new Set<string>();
  startupError = "";
  constructor(
    readonly store: Store,
    readonly codex: CodexEngine,
    private window: () => BrowserWindow,
    private emit: (event: JarvisEvent) => void,
    readonly dataPaths: Record<string, string>,
    private quit: () => void,
  ) {
    this.files = new Files((p) =>
      this.emit({ method: "filesChanged", params: { path: p } }),
    );
    this.voice = new VoiceService(
      path.join(dataPaths.config, "voice-key.enc"),
      () => store.settings(),
    );
    codex.on("event", (event: JarvisEvent) => {
      const threadId = event.params?.threadId || event.params?.params?.threadId;
      const conversation = threadId
        ? store.list().find((c) => c.threadId === threadId)
        : undefined;
      if (event.method === "connection" && !event.params?.connected)
        for (const id of this.busy) this.uncertain.add(id);
      if (conversation && event.method === "turn/completed") {
        this.busy.delete(conversation.id);
        this.uncertain.delete(conversation.id);
        store.update(conversation.id, {});
      }
      this.emit({
        ...event,
        params: {
          ...event.params,
          ...(conversation ? { conversationId: conversation.id } : {}),
        },
      });
    });
  }
  async init(initial?: string) {
    await this.voice.init();
    const prefs = this.store.settings();
    const candidate =
      initial ||
      (prefs.restoreSession
        ? this.store.get<string | null>("project", null)
        : null) ||
      prefs.startupWorkspace;
    if (candidate)
      try {
        await this.openProject(candidate);
      } catch (error) {
        this.startupError = `Cannot restore project: ${redactDiagnostic(String(error))}`;
      }
    void this.codex.connect();
  }
  async openProject(input: string) {
    const target = await this.files.openProject(input);
    this.store.set("project", target);
    this.store.set(
      "recents",
      [
        target,
        ...this.store.get<string[]>("recents", []).filter((p) => p !== target),
      ].slice(0, 20),
    );
    this.emit({ method: "project", params: { path: target } });
    return target;
  }
  private async confirm(message: string, detail: string, button = "Continue") {
    return (
      (
        await dialog.showMessageBox(this.window(), {
          type: "warning",
          message,
          detail,
          buttons: ["Cancel", button],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
        })
      ).response === 1
    );
  }
  private updated(id: string) {
    const conversation = this.store.conversation(id);
    this.emit({ method: "conversation.updated", params: conversation });
    return conversation;
  }
  private reconcileBusy(id: string, history: any) {
    if (!this.busy.has(id)) return false;
    const thread = history?.thread;
    const latest = thread?.turns?.at(-1);
    if (
      !["idle", "systemError"].includes(thread?.status?.type) ||
      latest?.status === "inProgress"
    )
      return false;
    this.busy.delete(id);
    this.uncertain.delete(id);
    this.emit({
      method: "conversation.recovered",
      params: {
        conversationId: id,
        status: thread.status.type,
        reviewRequired: true,
        message:
          "Codex reports no active turn. Review the saved conversation before sending another request. Previous actions may have completed; subprocess termination is not confirmed.",
      },
    });
    return true;
  }

  async invoke(method: string, raw: unknown = {}) {
    if (!Object.hasOwn(schemas, method))
      throw new Error("Unknown JARVIS operation.");
    const a: any = schemas[method].parse(raw ?? {});
    switch (method) {
      case "bootstrap":
        return {
          settings: this.store.settings(),
          project: this.files.project,
          recents: this.store.get("recents", []),
          conversations: this.store.list(),
          codex: this.codex.status,
          dataPaths: this.dataPaths,
          voice: this.voice.status(),
          startupError: this.startupError,
        };
      case "project.open": {
        const selected =
          a.path ||
          (
            await dialog.showOpenDialog(this.window(), {
              title: "Open project folder",
              properties: ["openDirectory"],
            })
          ).filePaths[0];
        return selected ? this.openProject(selected) : null;
      }
      case "project.close":
        this.files.close();
        this.store.set("project", null);
        this.emit({ method: "project", params: { path: null } });
        return null;
      case "project.new": {
        const chosen = await dialog.showSaveDialog(this.window(), {
          title: "New project folder",
          buttonLabel: "Create folder",
        });
        if (chosen.canceled || !chosen.filePath) return null;
        await fs.mkdir(chosen.filePath);
        return this.openProject(chosen.filePath);
      }
      case "workspace.save": {
        const chosen = await dialog.showSaveDialog(this.window(), {
          title: "Save workspace",
          defaultPath: "JARVIS.jarvis-workspace",
          filters: [
            { name: "JARVIS workspace", extensions: ["jarvis-workspace"] },
          ],
        });
        if (chosen.canceled || !chosen.filePath) return null;
        const settings = this.store.settings();
        await fs.writeFile(
          chosen.filePath,
          JSON.stringify(
            {
              version: 1,
              project: this.files.project,
              panels: {
                explorerWidth: settings.explorerWidth,
                chatWidth: settings.chatWidth,
                showExplorer: settings.showExplorer,
                showChat: settings.showChat,
              },
            },
            null,
            2,
          ),
          { mode: 0o600 },
        );
        return chosen.filePath;
      }
      case "workspace.open": {
        const chosen = await dialog.showOpenDialog(this.window(), {
          title: "Open workspace",
          properties: ["openFile"],
          filters: [
            {
              name: "JARVIS workspace",
              extensions: ["jarvis-workspace", "json"],
            },
          ],
        });
        if (chosen.canceled) return null;
        const file = chosen.filePaths[0];
        if ((await fs.stat(file)).size > 65536)
          throw new Error("This workspace file is too large.");
        const workspace = z
          .object({
            version: z.literal(1),
            project: string.nullable(),
            panels: z
              .object({
                explorerWidth: z.number().min(180).max(600),
                chatWidth: z.number().min(300).max(900),
                showExplorer: z.boolean(),
                showChat: z.boolean(),
              })
              .optional(),
          })
          .strict()
          .parse(JSON.parse(await fs.readFile(file, "utf8")));
        if (workspace.project)
          await this.openProject(
            path.resolve(path.dirname(file), workspace.project),
          );
        else {
          this.files.close();
          this.store.set("project", null);
          this.emit({ method: "project", params: { path: null } });
        }
        if (workspace.panels) this.store.updateSettings(workspace.panels);
        return { project: this.files.project, settings: this.store.settings() };
      }
      case "file.open": {
        const selected = await dialog.showOpenDialog(this.window(), {
          title: "Open file",
          properties: ["openFile"],
        });
        if (selected.canceled) return null;
        await this.files.grant(selected.filePaths[0]);
        return this.files.read(selected.filePaths[0]);
      }
      case "fs.list":
        return this.files.list(a.path, a.hidden);
      case "fs.read":
        return this.files.read(a.path);
      case "fs.save": {
        let target = a.path;
        if (a.saveAs) {
          const result = await dialog.showSaveDialog(this.window(), {
            title: "Save file as",
            defaultPath: target,
          });
          if (result.canceled || !result.filePath) return null;
          target = result.filePath;
          await this.files.grant(target);
        }
        if (
          (await this.files.changedOnDisk(target)) &&
          !(await this.confirm(
            "This file changed on disk.",
            "Replace the current disk file with your editor contents?",
            "Replace",
          ))
        )
          return null;
        return this.files.save(target, a.content);
      }
      case "fs.create":
        return this.files.create(a.parent, a.name, a.directory);
      case "fs.rename":
        return this.files.rename(a.path, a.name);
      case "fs.trash": {
        const target = await this.files.mutationTarget(a.path);
        if (target === this.files.project)
          throw new Error(
            "Close the project before moving its folder to the trash with the system file manager.",
          );
        if (
          !(await this.confirm(
            "Move this item to the trash?",
            target,
            "Move to trash",
          ))
        )
          return false;
        await shell.trashItem(target);
        return true;
      }
      case "fs.reveal":
        shell.showItemInFolder(
          Object.values(this.dataPaths).includes(a.path)
            ? a.path
            : await this.files.allowed(a.path),
        );
        return true;
      case "fs.copyPath":
        clipboard.writeText(await this.files.allowed(a.path));
        return true;
      case "settings.update": {
        if (
          a.patch.permissionMode === "full" &&
          this.store.settings().permissionMode !== "full" &&
          !(await this.confirm(
            "Enable Full access?",
            "Codex commands can affect all files accessible to your Linux user, and can access the network. Approval prompts do not make this mode a sandbox.",
            "Enable Full access",
          ))
        )
          return this.store.settings();
        return this.store.updateSettings(a.patch);
      }
      case "settings.clearRecents":
        this.store.clearRecents();
        return true;
      case "conversations.list":
        return this.store.list();
      case "conversations.create": {
        const project = await fs.realpath(a.project);
        if (project !== this.files.project)
          throw new Error(
            "Create a conversation in the currently open project.",
          );
        const conversation = this.store.create(project, a.title);
        this.emit({ method: "conversation.updated", params: conversation });
        return conversation;
      }
      case "conversations.open": {
        const conversation = this.store.conversation(a.id);
        let thread = null;
        if (conversation.threadId) {
          if (!this.codex.status.connected)
            throw new Error(
              "Codex is disconnected. Reconnect to read the saved thread.",
            );
          thread = await this.codex.readThread(conversation.threadId);
          this.reconcileBusy(a.id, thread);
        }
        return { conversation, thread };
      }
      case "conversations.history": {
        const conversation = this.store.conversation(a.id);
        if (!conversation.threadId)
          throw new Error("This conversation has no Codex history.");
        return this.codex.history(conversation.threadId, a.cursor);
      }
      case "conversations.update": {
        const previous = this.store.conversation(a.id);
        if (a.title && previous.threadId)
          await this.codex.rename(previous.threadId, a.title);
        this.store.update(a.id, {
          ...(a.title ? { title: a.title } : {}),
          ...(a.draft !== undefined ? { draft: a.draft } : {}),
        });
        return this.updated(a.id);
      }
      case "conversations.delete": {
        if (this.busy.has(a.id))
          throw new Error(
            "Stop the active turn before removing its local reference.",
          );
        if (
          !(await this.confirm(
            "Remove this local conversation reference?",
            "This removes the JARVIS sidebar entry and draft. Codex history and provider-side data remain.",
            "Remove locally",
          ))
        )
          return false;
        this.store.delete(a.id);
        return true;
      }
      case "conversations.archive": {
        const conversation = this.store.conversation(a.id);
        if (this.busy.has(a.id))
          throw new Error("Stop the active turn before archiving.");
        if (conversation.threadId)
          await this.codex.archive(conversation.threadId);
        this.store.update(a.id, { archived: true });
        return this.updated(a.id);
      }
      case "conversations.export": {
        const conversation = this.store.conversation(a.id);
        const thread = conversation.threadId
          ? await this.codex.readThread(conversation.threadId)
          : null;
        if (thread && conversation.threadId) {
          let pages = 0;
          while (thread.historyCursor) {
            if (++pages > 1000)
              throw new Error(
                "This history exceeds the export limit of 30,000 turns. No partial export was written.",
              );
            const page = await this.codex.history(
              conversation.threadId,
              thread.historyCursor,
            );
            thread.thread.turns = [...page.turns, ...thread.thread.turns];
            thread.historyCursor = page.historyCursor;
          }
        }
        const result = await dialog.showSaveDialog(this.window(), {
          title: "Export conversation (may contain private project content)",
          defaultPath: "conversation.json",
          filters: [{ name: "JSON", extensions: ["json"] }],
        });
        if (result.canceled || !result.filePath) return null;
        const safe = JSON.parse(
          redactDiagnosticExport(
            JSON.stringify(
              {
                format: "jarvis-export-v1",
                conversation: { ...conversation, draft: "" },
                thread,
              },
              null,
              2,
            ),
          ),
        );
        await fs.writeFile(result.filePath, JSON.stringify(safe, null, 2), {
          mode: 0o600,
        });
        return result.filePath;
      }
      case "chat.send": {
        const conversation = this.store.conversation(a.id);
        if (this.busy.has(a.id)) {
          if (
            this.uncertain.has(a.id) &&
            this.codex.status.connected &&
            conversation.threadId
          ) {
            const history = await this.codex.readThread(conversation.threadId);
            if (this.reconcileBusy(a.id, history))
              throw new Error(
                "Codex reports no active turn. Reopen this conversation and review its saved messages before sending again. Your message was not sent. Previous actions may have completed.",
              );
          }
          throw new Error(
            this.uncertain.has(a.id)
              ? "The previous turn has an unknown outcome. Reconnect Codex and reopen this conversation to inspect its saved state before sending again."
              : "This conversation already has an active turn.",
          );
        }
        if (!(await fs.stat(conversation.project)).isDirectory())
          throw new Error(
            "The conversation project is unavailable. Restore its original folder before continuing.",
          );
        if (!this.codex.status.connected)
          throw new Error("Connect Codex in Settings before sending.");
        if (this.codex.status.requiresOpenaiAuth && !this.codex.status.account)
          throw new Error("Sign in to Codex in Settings before sending.");
        const settings = this.store.settings();
        this.busy.add(a.id);
        let turnRequested = false;
        try {
          let threadId = conversation.threadId;
          if (threadId)
            await this.codex.resumeThread(
              threadId,
              conversation.project,
              settings.permissionMode,
              settings.model || undefined,
            );
          else {
            const result = await this.codex.startThread(
              conversation.project,
              settings.permissionMode,
              settings.model || undefined,
            );
            threadId = result.thread.id;
            this.store.update(a.id, { threadId });
            this.updated(a.id);
          }
          turnRequested = true;
          const result = await this.codex.send(
            threadId!,
            a.text,
            conversation.project,
            settings.permissionMode,
            settings.model || undefined,
          );
          this.store.update(a.id, {
            draft: "",
            ...(conversation.title === "New conversation"
              ? { title: a.text.slice(0, 70) }
              : {}),
          });
          this.updated(a.id);
          return { threadId, turn: result.turn };
        } catch (error) {
          if (
            turnRequested &&
            (!this.codex.status.connected ||
              /timed out|result is unknown/i.test(String(error)))
          )
            this.uncertain.add(a.id);
          else {
            this.busy.delete(a.id);
            this.uncertain.delete(a.id);
          }
          throw error;
        }
      }
      case "chat.stop": {
        this.voice.cancel();
        const conversation = this.store.conversation(a.id);
        return conversation.threadId
          ? this.codex.stop(conversation.threadId)
          : {
              interrupted: false,
              terminationConfirmed: false,
              message:
                "No Codex turn has started. Audio requests were cancelled.",
            };
      }
      case "approval.respond":
        this.codex.respond(a.id, a.result);
        return true;
      case "codex.status":
        return this.codex.status;
      case "codex.connect":
        return this.codex.connect();
      case "codex.login": {
        await this.codex.connect();
        const result = await this.codex.login();
        const url = (result as any).authUrl;
        if (url && isAllowedExternal(url)) await shell.openExternal(url);
        return result;
      }
      case "voice.configure":
        return this.voice.configure(a.key, a.remember);
      case "voice.clearKey":
        return this.voice.clear();
      case "voice.cancel":
        return this.voice.cancel();
      case "voice.transcribe":
        return this.voice.transcribe(
          new Uint8Array(a.data),
          a.mime,
          a.language || this.store.settings().language,
        );
      case "voice.speak":
        return this.voice.speak(a.text);
      case "clipboard.writeText":
        clipboard.writeText(a.text);
        return true;
      case "app.exit":
        this.quit();
        return true;
      case "external.open":
        if (!isAllowedExternal(a.url))
          throw new Error("Only HTTPS web links can open externally.");
        await shell.openExternal(a.url);
        return true;
    }
  }
  shutdown() {
    this.files.close();
    this.voice.cancel();
  }
  hasActiveTurns() {
    return this.busy.size > 0;
  }
}
export function isAllowedExternal(input: string) {
  try {
    const url = new URL(input);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}
function redactDiagnosticExport(text: string) {
  return text
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, "[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(
      /(\\?"(?:access_token|refresh_token|api_key|password)\\?"\s*:\s*\\?")[^"\\]*(\\?")/gi,
      "$1[redacted]$2",
    );
}
