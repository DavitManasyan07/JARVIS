export type Envelope = { method: string; params: any };
export const api = <T = any>(method: string, args?: any): Promise<T> =>
  window.jarvis.invoke<T>(method, args);
export type {
  Settings,
  Conversation,
  FileEntry,
  FileContent as FileData,
} from "../shared";
export const basename = (p: string) => p.split("/").filter(Boolean).pop() || p;
export const permissionLabel = (v: string) =>
  ({
    "read-only": "Read only",
    "workspace-write": "Workspace access",
    full: "FULL ACCESS",
  })[v] || "Workspace access";
