import { it, expect, vi } from "vitest";
vi.mock("electron", () => ({
  safeStorage: {
    isAsyncEncryptionAvailable: async () => false,
    getSelectedStorageBackend: () => "basic_text",
  },
}));
import { speechText, pcmToWav, VoiceService } from "../src/main/voice";
import { defaults } from "../src/shared";
it("removes code, secret-shaped values and image URLs before synthesis", () => {
  const result = speechText(
    "Hello ```sh\nrm -rf /\n``` sk-privatevalue1234 Bearer token [link](https://example.com)",
  );
  expect(result).not.toContain("rm -rf");
  expect(result).not.toContain("sk-private");
  expect(result).not.toContain("Bearer token");
  expect(result).toContain("Hello");
});
it("wraps real PCM fixtures in a valid mono 24kHz WAV header", () => {
  const pcm = Buffer.alloc(4800);
  for (let i = 0; i < 2400; i++)
    pcm.writeInt16LE(
      Math.round(16000 * Math.sin((i * 2 * Math.PI * 440) / 24000)),
      i * 2,
    );
  const wav = pcmToWav(pcm);
  expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
  expect(wav.readUInt32LE(24)).toBe(24000);
  expect(wav.subarray(44)).toEqual(pcm);
});
it("rejects plaintext persistence and explains missing audio credentials", async () => {
  const service = new VoiceService(".dev/never-key.enc", () => defaults);
  await expect(service.configure("test-session-key", true)).rejects.toThrow(
    "session-only",
  );
  await expect(service.speak("hello")).rejects.toThrow("API key");
});
