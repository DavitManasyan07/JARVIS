import { describe, expect, it } from "vitest";
import { rms, speechText } from "../src/renderer/useAudio";

describe("actual audio-sample analysis", () => {
  it("shows a flat level for an empty fixture or digital silence", () => {
    expect(rms(new Uint8Array())).toBe(0);
    expect(rms(new Uint8Array(256).fill(128))).toBe(0);
  });

  it("measures known constant and symmetric alternating sample fixtures", () => {
    expect(rms(new Uint8Array(256).fill(160))).toBeCloseTo(0.75, 10);
    expect(rms(new Uint8Array([128, 160, 128, 96]))).toBeCloseTo(
      (Math.sqrt(2) / 8) * 3,
      10,
    );
  });

  it("bounds full-scale signal levels and never returns a non-finite value", () => {
    expect(rms(new Uint8Array([0, 255, 0, 255]))).toBe(1);
    for (const fixture of [
      new Uint8Array([127]),
      new Uint8Array([255]),
      new Uint8Array([0]),
    ]) {
      const level = rms(fixture);
      expect(Number.isFinite(level)).toBe(true);
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(1);
    }
  });
});

it("keeps terminal-sized code blocks out of the renderer speech request", () => {
  const text = speechText(
    "Review the result.\n```sh\nrm -rf important-files\n```\n[Read the guide](https://example.invalid)",
  );
  expect(text).not.toContain("rm -rf");
  expect(text).not.toContain("https://");
  expect(text).toContain("Review the result.");
  expect(text).toContain("Read the guide");
});
