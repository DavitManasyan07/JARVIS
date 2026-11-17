import { z } from "zod";
export const string = z
  .string()
  .max(8192)
  .refine((s) => !s.includes("\0"), "NUL characters are not permitted.");
export const pathString = string.min(1);
export const name = z
  .string()
  .min(1)
  .max(255)
  .refine(
    (s) => s !== "." && s !== ".." && !/[\/\\\0]/.test(s),
    "Enter a single item name.",
  );
export const settingsPatch = z
  .object({
    restoreSession: z.boolean(),
    startupWorkspace: string,
    theme: z.enum(["dark", "system"]),
    textSize: z.number().int().min(12).max(22),
    animationQuality: z.enum(["low", "high"]),
    reducedMotion: z.boolean(),
    explorerWidth: z.number().min(180).max(600),
    chatWidth: z.number().min(300).max(900),
    showExplorer: z.boolean(),
    showChat: z.boolean(),
    hiddenFiles: z.boolean(),
    activeConversation: string.nullable(),
    model: string,
    permissionMode: z.enum(["read-only", "workspace-write", "full"]),
    voiceProvider: z.literal("openai"),
    voice: z.enum([
      "alloy",
      "ash",
      "ballad",
      "coral",
      "echo",
      "fable",
      "nova",
      "onyx",
      "sage",
      "shimmer",
      "verse",
      "marin",
      "cedar",
    ]),
    speechSpeed: z.number().min(0.25).max(4),
    language: z.string().max(12),
    spokenResponses: z.boolean(),
    autoSendTranscript: z.boolean(),
    microphoneMode: z.enum(["automatic", "push-to-talk"]),
    speechPauseMs: z.number().int().min(600).max(4000),
    inputDevice: string,
    outputDevice: string,
    volume: z.number().min(0).max(1),
    echoCancellation: z.boolean(),
    noiseSuppression: z.boolean(),
  })
  .partial()
  .strict();
export const idArgs = z.object({ id: string.min(1) }).strict();
