export interface SpeechActivityOptions {
  speechMs?: number;
  silenceMs?: number;
  noSpeechMs?: number;
  calibrationMs?: number;
}
export interface SpeechActivity {
  level: number;
  speechDetected: boolean;
  voiceActive: boolean;
  noiseFloor: number;
  onsetThreshold: number;
  action: "none" | "finish" | "no-speech";
}
/** Unamplified, normalized PCM RMS, with DC offset removed. */
export function pcmRms(samples: Float32Array): number {
  if (!samples.length) return 0;
  let sum = 0,
    squares = 0,
    count = 0;
  for (const sample of samples) {
    if (!Number.isFinite(sample)) continue;
    const value = Math.max(-1, Math.min(1, sample));
    sum += value;
    squares += value * value;
    count++;
  }
  return count
    ? Math.sqrt(Math.max(0, squares / count - (sum / count) ** 2))
    : 0;
}
/**
 * A local energy detector. This is deliberately not a speech-recognition model.
 * It estimates steady background noise, then uses separate onset/release levels.
 * Quiet capture is never sufficient to authorize an external transcription.
 */
export class SpeechActivityDetector {
  private readonly options: Required<SpeechActivityOptions>;
  private readonly startedAt: number;
  private previousAt: number;
  private noise = 0.002;
  private qualifyingMs = 0;
  private candidateQuietAt: number | null = null;
  private lastVoiceAt: number | null = null;
  private detected = false;
  private terminal: SpeechActivity["action"] = "none";
  constructor(now: number, options: SpeechActivityOptions = {}) {
    this.startedAt = now;
    this.previousAt = now;
    this.options = {
      speechMs: options.speechMs ?? 250,
      silenceMs: options.silenceMs ?? 1200,
      noSpeechMs: options.noSpeechMs ?? 8000,
      calibrationMs: options.calibrationMs ?? 180,
    };
  }
  get speechDetected() {
    return this.detected;
  }
  update(samples: Float32Array, now: number): SpeechActivity {
    const level = pcmRms(samples);
    // A delayed background timer cannot turn one loud sample into a long word.
    const elapsed = Math.max(0, now - this.previousAt);
    const duration = Math.min(100, elapsed);
    this.previousAt = Math.max(this.previousAt, now);
    const calibrating = now - this.startedAt < this.options.calibrationMs;
    if (calibrating && level < 0.025) {
      this.noise += (Math.min(level, 0.012) - this.noise) * 0.55;
    }
    const onsetThreshold = Math.max(0.012, this.noise * 3);
    const releaseThreshold = Math.max(0.007, this.noise * 1.65);
    const onset = level >= onsetThreshold && (!calibrating || level >= 0.025);
    const voiceActive = this.detected ? level >= releaseThreshold : onset;
    if (this.terminal === "none") {
      if (!this.detected) {
        if (onset) {
          this.qualifyingMs += duration;
          this.candidateQuietAt = null;
          if (this.qualifyingMs >= this.options.speechMs) {
            this.detected = true;
            this.lastVoiceAt = now;
          }
        } else {
          this.candidateQuietAt ??= now;
          // Brief phoneme gaps are allowed; distinct clicks do not accumulate.
          if (now - this.candidateQuietAt > 120) this.qualifyingMs = 0;
        }
      } else if (voiceActive) this.lastVoiceAt = now;
      // Learn the quiet floor slowly, and never absorb ongoing voice into it.
      if (!calibrating && level < releaseThreshold) {
        this.noise += (Math.max(0.0002, level) - this.noise) * 0.025;
      }
      if (
        this.detected &&
        this.lastVoiceAt !== null &&
        now - this.lastVoiceAt >= this.options.silenceMs
      )
        this.terminal = "finish";
      if (!this.detected && now - this.startedAt >= this.options.noSpeechMs)
        this.terminal = "no-speech";
    }
    return {
      level,
      speechDetected: this.detected,
      voiceActive,
      noiseFloor: this.noise,
      onsetThreshold,
      action: this.terminal,
    };
  }
}
