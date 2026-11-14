import { it, expect, vi } from "vitest";
vi.mock("electron", () => ({
  safeStorage: {},
  dialog: {},
  clipboard: {},
  shell: {},
}));
import { schemas, isAllowedExternal } from "../src/main/backend";
it("exposes narrow operations with strict validated IPC arguments", () => {
  expect(schemas["codex.request"]).toBeUndefined();
  expect(schemas["fs.exec"]).toBeUndefined();
  expect(
    schemas["fs.read"].safeParse({ path: "/tmp/a", shell: true }).success,
  ).toBe(false);
  expect(schemas["fs.save"].safeParse({ path: "a", content: 1 }).success).toBe(
    false,
  );
  expect(schemas["project.open"].safeParse({ path: "a\0b" }).success).toBe(
    false,
  );
  expect(
    schemas["voice.configure"].safeParse({
      key: "example-key",
      remember: false,
    }).success,
  ).toBe(true);
});
it("rejects executable and local external URLs", () => {
  for (const url of [
    "javascript:alert(1)",
    "file:///etc/passwd",
    "http://example.com",
    "https://name:pass@example.com",
  ])
    expect(isAllowedExternal(url)).toBe(false);
  expect(isAllowedExternal("https://developers.openai.com/codex")).toBe(true);
});
