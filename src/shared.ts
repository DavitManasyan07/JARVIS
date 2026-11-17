export type PermissionMode = "read-only" | "workspace-write" | "full";
export interface Settings {
  restoreSession: boolean;
  startupWorkspace: string;
  theme: "dark" | "system";
  textSize: number;
  animationQuality: "low" | "high";
  reducedMotion: boolean;
  explorerWidth: number;
  chatWidth: number;
  showExplorer: boolean;
  showChat: boolean;
  hiddenFiles: boolean;
  activeConversation: string | null;
  model: string;
  permissionMode: PermissionMode;
  voiceProvider: "openai";
  voice: string;
  speechSpeed: number;
  language: string;
  spokenResponses: boolean;
  autoSendTranscript: boolean;
  microphoneMode: "automatic" | "push-to-talk";
  speechPauseMs: number;
  inputDevice: string;
  outputDevice: string;
  volume: number;
  echoCancellation: boolean;
  noiseSuppression: boolean;
}
export const defaults: Settings = {
  restoreSession: true,
  startupWorkspace: "",
  theme: "dark",
  textSize: 14,
  animationQuality: "high",
  reducedMotion: false,
  explorerWidth: 248,
  chatWidth: 410,
  showExplorer: true,
  showChat: true,
  hiddenFiles: false,
  activeConversation: null,
  model: "",
  permissionMode: "workspace-write",
  voiceProvider: "openai",
  voice: "coral",
  speechSpeed: 1,
  language: "",
  spokenResponses: false,
  autoSendTranscript: false,
  microphoneMode: "automatic",
  speechPauseMs: 1200,
  inputDevice: "default",
  outputDevice: "default",
  volume: 0.7,
  echoCancellation: true,
  noiseSuppression: true,
};
export interface Conversation {
  id: string;
  threadId: string | null;
  title: string;
  project: string;
  createdAt: number;
  updatedAt: number;
  draft: string;
  archived: boolean;
}
export interface FileEntry {
  name: string;
  path: string;
  directory: boolean;
  symlink: boolean;
}
export interface FileContent {
  path: string;
  kind: "text" | "image" | "binary";
  content?: string;
  dataUrl?: string;
  size: number;
}
export interface JarvisEvent {
  method: string;
  params: any;
}
export interface JarvisBridge {
  invoke<T = any>(method: string, args?: any): Promise<T>;
  onEvent(callback: (event: JarvisEvent) => void): () => void;
}
declare global {
  interface Window {
    jarvis: JarvisBridge;
  }
}
