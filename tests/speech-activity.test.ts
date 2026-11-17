import { describe, expect, it } from "vitest";
import { pcmRms, SpeechActivityDetector } from "../src/renderer/speechActivity";

// These are PCM fixtures processed by the production detector, not mocked levels.
function tone(amplitude: number, length = 2048): Float32Array {
  return Float32Array.from(
    { length },
    (_, i) => amplitude * Math.sin((2 * Math.PI * 440 * i) / 48000),
  );
}
const quiet = new Float32Array(2048);
function feed(
  detector: SpeechActivityDetector,
  from: number,
  until: number,
  samples: Float32Array,
  step = 40,
) {
  let state = detector.update(samples, from);
  for (let now = from + step; now <= until; now += step)
    state = detector.update(samples, now);
  return state;
}
describe("microphone PCM speech activity", () => {
  it("measures a real PCM signal and rejects silence or a DC offset", () => {
    expect(pcmRms(tone(0.2))).toBeCloseTo(0.2 / Math.sqrt(2), 2);
    expect(pcmRms(quiet)).toBe(0);
    expect(pcmRms(new Float32Array(2048).fill(0.4))).toBeLessThan(0.000001);
  });
  it("finishes only after qualifying speech and 1.2 seconds of quiet", () => {
    const detector = new SpeechActivityDetector(0);
    feed(detector, 0, 400, quiet);
    expect(feed(detector, 440, 800, tone(0.2)).speechDetected).toBe(true);
    expect(feed(detector, 840, 1960, quiet).action).toBe("none");
    expect(detector.update(quiet, 2000).action).toBe("finish");
  });
  it("does not stop during a short pause and uses the end of resumed speech", () => {
    const detector = new SpeechActivityDetector(0);
    feed(detector, 0, 300, quiet);
    feed(detector, 320, 760, tone(0.2));
    expect(feed(detector, 800, 1560, quiet).action).toBe("none");
    feed(detector, 1600, 2080, tone(0.15));
    expect(feed(detector, 2120, 3240, quiet).action).toBe("none");
    expect(detector.update(quiet, 3280).action).toBe("finish");
  });
  it("cancels eight seconds of silence without claiming speech", () => {
    const detector = new SpeechActivityDetector(0);
    const state = feed(detector, 0, 8000, quiet);
    expect(state.action).toBe("no-speech");
    expect(state.speechDetected).toBe(false);
  });
  it("rejects brief clicks and does not add separated clicks into speech", () => {
    const detector = new SpeechActivityDetector(0);
    feed(detector, 0, 400, quiet);
    for (let now = 440; now < 7600; now += 400) {
      detector.update(tone(0.3), now);
      feed(detector, now + 40, now + 360, quiet);
    }
    const state = detector.update(quiet, 8000);
    expect(state.action).toBe("no-speech");
    expect(state.speechDetected).toBe(false);
  });
  it("adapts to a steady low background before accepting louder voice", () => {
    const detector = new SpeechActivityDetector(0);
    const noise = tone(0.024);
    expect(feed(detector, 0, 1200, noise).speechDetected).toBe(false);
    const speech = feed(detector, 1240, 1640, tone(0.15));
    expect(speech.speechDetected).toBe(true);
    expect(speech.onsetThreshold).toBeGreaterThan(0.025);
    expect(feed(detector, 1680, 2840, noise).action).toBe("finish");
  });
  it("accepts immediate strong speech without waiting for calibration", () => {
    const detector = new SpeechActivityDetector(0);
    expect(feed(detector, 0, 280, tone(0.2)).speechDetected).toBe(true);
  });
  it("does not treat a delayed timer and one transient as sustained speech", () => {
    const detector = new SpeechActivityDetector(0);
    detector.update(quiet, 0);
    expect(detector.update(tone(0.2), 2000).speechDetected).toBe(false);
    expect(feed(detector, 2040, 8000, quiet).action).toBe("no-speech");
  });
  it("uses the lower release threshold to avoid chopping a trailing syllable", () => {
    const detector = new SpeechActivityDetector(0);
    feed(detector, 0, 400, quiet);
    feed(detector, 440, 800, tone(0.2));
    expect(feed(detector, 840, 1600, tone(0.012)).voiceActive).toBe(true);
    expect(feed(detector, 1640, 2760, quiet).action).toBe("none");
    expect(detector.update(quiet, 2800).action).toBe("finish");
  });
});
