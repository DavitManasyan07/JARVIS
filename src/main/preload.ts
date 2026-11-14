import { contextBridge, ipcRenderer } from "electron";
import type { JarvisEvent } from "../shared";
const methods = new Set([
  "bootstrap",
  "project.open",
  "project.close",
  "project.new",
  "workspace.open",
  "workspace.save",
  "file.open",
  "fs.list",
  "fs.read",
  "fs.save",
  "fs.create",
  "fs.rename",
  "fs.trash",
  "fs.reveal",
  "fs.copyPath",
  "settings.update",
  "settings.clearRecents",
  "conversations.list",
  "conversations.create",
  "conversations.history",
  "conversations.open",
  "conversations.delete",
  "conversations.archive",
  "conversations.export",
  "conversations.update",
  "chat.send",
  "chat.stop",
  "approval.respond",
  "codex.connect",
  "codex.status",
  "codex.login",
  "voice.configure",
  "voice.clearKey",
  "voice.cancel",
  "voice.transcribe",
  "voice.speak",
  "clipboard.writeText",
  "app.exit",
  "external.open",
]);
contextBridge.exposeInMainWorld(
  "jarvis",
  Object.freeze({
    invoke(method: string, args?: unknown) {
      if (typeof method !== "string" || !methods.has(method))
        return Promise.reject(new Error("Unknown JARVIS operation."));
      return ipcRenderer.invoke("jarvis:invoke", method, args ?? {});
    },
    onEvent(callback: (event: JarvisEvent) => void) {
      if (typeof callback !== "function")
        throw new Error("Expected event callback.");
      const handler = (_event: unknown, data: JarvisEvent) => callback(data);
      ipcRenderer.on("jarvis:event", handler);
      return () => ipcRenderer.removeListener("jarvis:event", handler);
    },
  }),
);
