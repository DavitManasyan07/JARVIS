import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Settings } from "./api";
import { SpeechActivityDetector } from "./speechActivity";
export interface CaptureOptions<Context = unknown> {
  mode?: "automatic" | "push-to-talk";
  context?: Context;
}
interface CaptureSession<Context> {
  generation: number;
  mode: "automatic" | "push-to-talk";
  context?: Context;
  language: string;
  silenceMs: number;
  detector: SpeechActivityDetector;
  active: boolean;
  canceled: boolean;
  finishRequested: boolean;
  transcribing: boolean;
  media?: MediaStream;
  source?: MediaStreamAudioSourceNode;
  analyser?: AnalyserNode;
  recorder?: MediaRecorder;
  samples: Float32Array<ArrayBuffer>;
  interval?: ReturnType<typeof setInterval>;
  noSpeechTimer?: ReturnType<typeof setTimeout>;
  maxTimer?: ReturnType<typeof setTimeout>;
}
export function rms(values: Uint8Array) {
  let sum = 0;
  for (const v of values) sum += ((v - 128) / 128) ** 2;
  return Math.min(1, Math.sqrt(sum / Math.max(1, values.length)) * 3);
}
export function speechText(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, " Code is available in the written response. ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#*_`>|]/g, "")
    .slice(0, 3500);
}
export default function useAudio<Context = unknown>(
  settings: Settings,
  onTranscript: (text: string, context?: Context) => void,
  onError: (text: string) => void,
) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]),
    [recording, setRecording] = useState(false),
    [starting, setStarting] = useState(false),
    [captureMode, setCaptureMode] = useState<"automatic" | "push-to-talk">(
      "automatic",
    ),
    [speechDetected, setSpeechDetected] = useState(false),
    [listeningStatus, setListeningStatus] = useState("Microphone off"),
    [transcribing, setTranscribing] = useState(false),
    [speaking, setSpeaking] = useState(false),
    [fixture, setFixture] = useState(false);
  const [inputLevel, setInputLevel] = useState(0),
    [outputLevel, setOutputLevel] = useState(0),
    [bars, setBars] = useState<number[]>(Array(32).fill(0));
  const [deviceError, setDeviceError] = useState("");
  const ctx = useRef<AudioContext | null>(null),
    inputAnalyser = useRef<AnalyserNode | null>(null),
    outputAnalyser = useRef<AnalyserNode | null>(null),
    stream = useRef<MediaStream | null>(null),
    recorder = useRef<MediaRecorder | null>(null),
    capture = useRef<CaptureSession<Context> | null>(null),
    audio = useRef<HTMLAudioElement | null>(null),
    oscillator = useRef<OscillatorNode | null>(null),
    url = useRef<string | null>(null),
    playGeneration = useRef(0),
    recordGeneration = useRef(0),
    outputGain = useRef<GainNode | null>(null),
    outputScale = useRef(1),
    settingsRef = useRef(settings),
    callbacks = useRef({ onTranscript, onError });
  settingsRef.current = settings;
  callbacks.current = { onTranscript, onError };
  const context = async () => {
    if (!ctx.current || ctx.current.state === "closed")
      ctx.current = new AudioContext();
    if (ctx.current.state === "suspended") await ctx.current.resume();
    return ctx.current;
  };
  const refresh = useCallback(async (recover = false) => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices(list);
      setDeviceError("");
      const selected = settingsRef.current.outputDevice;
      if (
        recover &&
        selected &&
        selected !== "default" &&
        !list.some(
          (d) => d.kind === "audiooutput" && d.deviceId === selected,
        ) &&
        ctx.current &&
        "setSinkId" in ctx.current
      ) {
        await (
          ctx.current as AudioContext & { setSinkId(id: string): Promise<void> }
        ).setSinkId("");
        callbacks.current.onError(
          "The selected output device is unavailable. Playback uses the system default.",
        );
      }
    } catch {
      setDeviceError(
        "Audio-device information is unavailable. Text chat is ready.",
      );
    }
  }, []);
  const stopSpeech = useCallback(() => {
    playGeneration.current++;
    void api("voice.cancel").catch(() => {});
    if (audio.current) {
      audio.current.pause();
      audio.current.src = "";
      audio.current = null;
    }
    if (url.current) {
      URL.revokeObjectURL(url.current);
      url.current = null;
    }
    if (oscillator.current) {
      try {
        oscillator.current.stop();
      } catch {}
      oscillator.current.disconnect();
      oscillator.current = null;
    }
    outputAnalyser.current?.disconnect();
    outputAnalyser.current = null;
    outputGain.current?.disconnect();
    outputGain.current = null;
    setSpeaking(false);
    setFixture(false);
    setOutputLevel(0);
  }, []);
  const releaseInput = (session: CaptureSession<Context>) => {
    if (session.interval) clearInterval(session.interval);
    if (session.noSpeechTimer) clearTimeout(session.noSpeechTimer);
    if (session.maxTimer) clearTimeout(session.maxTimer);
    session.interval = undefined;
    session.noSpeechTimer = undefined;
    session.maxTimer = undefined;
    for (const track of session.media?.getTracks() || []) {
      track.onended = null;
      track.stop();
    }
    session.source?.disconnect();
    session.analyser?.disconnect();
    if (stream.current === session.media) stream.current = null;
    if (inputAnalyser.current === session.analyser)
      inputAnalyser.current = null;
    session.active = false;
  };
  const finish = useCallback((cancel = false) => {
    const session = capture.current;
    if (!session) return;
    if (cancel) {
      session.canceled = true;
      recordGeneration.current++;
      // Dispatch cancellation before a later start can create a new request.
      // Old onstop/catch handlers never cancel requests belonging to a new capture.
      if (session.transcribing) void api("voice.cancel").catch(() => {});
    } else if (session.finishRequested) return;
    else if (!session.detector.speechDetected) {
      session.canceled = true;
      recordGeneration.current++;
      setListeningStatus("No speech detected · nothing sent");
      callbacks.current.onError(
        "No speech detected. Recording canceled; nothing sent.",
      );
    } else session.finishRequested = true;
    releaseInput(session);
    setStarting(false);
    setRecording(false);
    setInputLevel(0);
    setBars(Array(32).fill(0));
    if (session.canceled) {
      setTranscribing(false);
      setSpeechDetected(false);
      if (cancel) setListeningStatus("Recording canceled · nothing sent");
      capture.current = null;
    } else {
      setTranscribing(true);
      setListeningStatus("Transcribing your speech");
    }
    if (session.recorder?.state === "recording") session.recorder.stop();
    else if (!session.canceled) {
      session.canceled = true;
      capture.current = null;
      setTranscribing(false);
      callbacks.current.onError(
        "Recording could not be completed. Nothing was sent.",
      );
    }
  }, []);
  const start = useCallback(
    async (options: CaptureOptions<Context> = {}) => {
      if (capture.current?.active) return;
      if (capture.current) finish(true);
      stopSpeech();
      const generation = ++recordGeneration.current;
      const session: CaptureSession<Context> = {
        generation,
        mode: options.mode || "automatic",
        context: options.context,
        language: settingsRef.current.language || "",
        silenceMs: settingsRef.current.speechPauseMs || 1200,
        detector: new SpeechActivityDetector(performance.now(), {
          silenceMs: settingsRef.current.speechPauseMs || 1200,
        }),
        active: true,
        canceled: false,
        finishRequested: false,
        transcribing: false,
        samples: new Float32Array(2048),
      };
      capture.current = session;
      setStarting(true);
      setCaptureMode(session.mode);
      setSpeechDetected(false);
      setTranscribing(false);
      setListeningStatus("Opening microphone");
      const currentSession = () =>
        capture.current === session &&
        !session.canceled &&
        generation === recordGeneration.current;
      try {
        const requested = settingsRef.current.inputDevice;
        const available = await navigator.mediaDevices.enumerateDevices();
        if (!currentSession()) return;
        const input =
          requested &&
          requested !== "default" &&
          available.some(
            (d) => d.kind === "audioinput" && d.deviceId === requested,
          )
            ? requested
            : undefined;
        if (requested && requested !== "default" && !input)
          callbacks.current.onError(
            "The selected microphone is unavailable. Recording uses the system default.",
          );
        const media = await navigator.mediaDevices.getUserMedia({
          audio: {
            ...(input ? { deviceId: { exact: input } } : {}),
            echoCancellation: settingsRef.current.echoCancellation !== false,
            noiseSuppression: settingsRef.current.noiseSuppression !== false,
          },
          video: false,
        });
        session.media = media;
        if (!currentSession()) {
          releaseInput(session);
          return;
        }
        stream.current = media;
        await refresh();
        if (!currentSession()) {
          releaseInput(session);
          return;
        }
        const ac = await context();
        if (!currentSession()) {
          releaseInput(session);
          return;
        }
        const source = ac.createMediaStreamSource(media),
          analyser = ac.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.7;
        source.connect(analyser);
        session.source = source;
        session.analyser = analyser;
        inputAnalyser.current = analyser;
        // Timers start after capture is ready, not while a permission prompt is open.
        session.detector = new SpeechActivityDetector(performance.now(), {
          silenceMs: session.silenceMs,
        });
        const mime = ["audio/webm;codecs=opus", "audio/webm"].find((m) =>
          MediaRecorder.isTypeSupported(m),
        );
        const rec = new MediaRecorder(media, mime ? { mimeType: mime } : {});
        session.recorder = rec;
        recorder.current = rec;
        const pieces: Blob[] = [];
        rec.ondataavailable = (e) => {
          if (!session.canceled && e.data.size) pieces.push(e.data);
        };
        rec.onerror = () => {
          if (!currentSession()) return;
          finish(true);
          callbacks.current.onError(
            "Microphone recording failed. Nothing was sent.",
          );
        };
        rec.onstop = async () => {
          if (
            !currentSession() ||
            !session.finishRequested ||
            !session.detector.speechDetected
          ) {
            pieces.length = 0;
            return;
          }
          session.transcribing = true;
          try {
            const blob = new Blob(pieces, { type: rec.mimeType });
            pieces.length = 0;
            if (!blob.size) throw new Error("The recording contains no audio.");
            const data = Array.from(new Uint8Array(await blob.arrayBuffer()));
            if (!currentSession()) return;
            const result = await api("voice.transcribe", {
              data,
              mime: rec.mimeType,
              language: session.language || undefined,
            });
            if (!currentSession()) return;
            const text = String(result.text || "").trim();
            if (!text)
              throw new Error(
                "No speech transcript was returned. Nothing was sent.",
              );
            setListeningStatus("Transcript ready");
            callbacks.current.onTranscript(text, session.context);
          } catch (e) {
            if (currentSession()) {
              setListeningStatus("Transcription failed");
              callbacks.current.onError(String((e as Error).message || e));
            }
          } finally {
            session.transcribing = false;
            if (currentSession()) {
              setTranscribing(false);
              setSpeechDetected(false);
              capture.current = null;
            }
          }
        };
        media.getAudioTracks()[0].onended = () => {
          if (!currentSession()) return;
          finish(true);
          callbacks.current.onError(
            "The microphone was disconnected. Recording was canceled; nothing sent.",
          );
          void refresh();
        };
        const inspect = () => {
          if (!currentSession() || !session.active || !session.analyser) return;
          session.analyser.getFloatTimeDomainData(session.samples);
          const activity = session.detector.update(
            session.samples,
            performance.now(),
          );
          setInputLevel(Math.min(1, activity.level * 3));
          setSpeechDetected(activity.speechDetected);
          setListeningStatus(
            activity.speechDetected
              ? session.mode === "automatic"
                ? "Listening · pause to send"
                : "Listening · release to transcribe"
              : "Waiting for speech",
          );
          if (activity.action === "no-speech") {
            finish(false);
            return;
          }
          if (session.mode === "automatic" && activity.action === "finish")
            finish(false);
        };
        rec.start(250);
        setStarting(false);
        setRecording(true);
        setListeningStatus("Waiting for speech");
        // Capture control must keep running while RAF or the window is hidden.
        session.interval = setInterval(inspect, 40);
        session.noSpeechTimer = setTimeout(() => {
          if (currentSession() && !session.detector.speechDetected)
            finish(false);
        }, 8000);
        session.maxTimer = setTimeout(() => {
          if (currentSession()) finish(false);
        }, 60000);
      } catch (e) {
        if (!currentSession()) {
          releaseInput(session);
          return;
        }
        finish(true);
        const err = e as DOMException;
        callbacks.current.onError(
          err.name === "NotFoundError"
            ? "No microphone available. Connect a microphone, then try again."
            : err.name === "NotAllowedError"
              ? "Microphone access was denied. Check your desktop privacy settings."
              : `Cannot start microphone: ${err.message}`,
        );
      }
    },
    [finish, refresh, stopSpeech],
  );
  const route = async (ac: AudioContext) => {
    if ("setSinkId" in ac) {
      const sink = settingsRef.current.outputDevice;
      try {
        await (
          ac as AudioContext & { setSinkId(id: string): Promise<void> }
        ).setSinkId(!sink || sink === "default" ? "" : sink);
      } catch {
        await (
          ac as AudioContext & { setSinkId(id: string): Promise<void> }
        ).setSinkId("");
        callbacks.current.onError(
          "The selected output device is unavailable. Playback uses the system default.",
        );
      }
    }
  };
  const speak = useCallback(
    async (text: string) => {
      stopSpeech();
      finish(true);
      const generation = playGeneration.current;
      try {
        const result = await api("voice.speak", { text: speechText(text) });
        if (generation !== playGeneration.current) return;
        const ac = await context();
        await route(ac);
        if (generation !== playGeneration.current) return;
        const player = new Audio();
        audio.current = player;
        url.current = URL.createObjectURL(
          new Blob([new Uint8Array(result.data)], { type: result.mime }),
        );
        player.src = url.current;
        player.playbackRate = Number(settingsRef.current.speechSpeed ?? 1);
        const source = ac.createMediaElementSource(player),
          analyser = ac.createAnalyser(),
          gain = ac.createGain();
        analyser.fftSize = 256;
        outputScale.current = 1;
        outputGain.current = gain;
        gain.gain.value = Math.min(
          1,
          Math.max(0, Number(settingsRef.current.volume ?? 0.8)),
        );
        source.connect(gain);
        gain.connect(analyser);
        analyser.connect(ac.destination);
        outputAnalyser.current = analyser;
        player.onended = () => {
          if (audio.current === player) stopSpeech();
        };
        player.onerror = () => {
          if (generation !== playGeneration.current) return;
          stopSpeech();
          callbacks.current.onError(
            "Audio playback failed. The written response is available.",
          );
        };
        await player.play();
        setSpeaking(true);
      } catch (e) {
        if (generation !== playGeneration.current) return;
        stopSpeech();
        callbacks.current.onError(
          `Speech unavailable: ${(e as Error).message}`,
        );
      }
    },
    [finish, stopSpeech],
  );
  const test = useCallback(
    async (audible = false) => {
      stopSpeech();
      finish(true);
      try {
        const ac = await context();
        await route(ac);
        const osc = ac.createOscillator(),
          analyser = ac.createAnalyser(),
          gain = ac.createGain();
        analyser.fftSize = 256;
        osc.type = "sine";
        osc.frequency.value = 240;
        outputScale.current = audible ? 0.08 : 0;
        outputGain.current = gain;
        gain.gain.value = audible
          ? 0.08 * Number(settingsRef.current.volume ?? 0.8)
          : 0;
        osc.connect(analyser);
        analyser.connect(gain);
        gain.connect(ac.destination);
        outputAnalyser.current = analyser;
        oscillator.current = osc;
        osc.start();
        setFixture(true);
        if (audible) setTimeout(stopSpeech, 1200);
      } catch (e) {
        callbacks.current.onError(
          `Audio test unavailable: ${(e as Error).message}`,
        );
      }
    },
    [finish, stopSpeech],
  );
  useEffect(() => {
    void refresh();
    const changed = () => void refresh(true);
    navigator.mediaDevices?.addEventListener("devicechange", changed);
    let frame = 0,
      last = 0;
    const draw = (time: number) => {
      frame = requestAnimationFrame(draw);
      if (time - last < 60 || document.hidden) return;
      last = time;
      if (inputAnalyser.current) {
        const frequency = new Uint8Array(
          inputAnalyser.current.frequencyBinCount,
        );
        inputAnalyser.current.getByteFrequencyData(frequency);
        setBars(
          Array.from({ length: 32 }, (_, i) => (frequency[i * 2] || 0) / 255),
        );
      }
      if (outputAnalyser.current) {
        const values = new Uint8Array(outputAnalyser.current.fftSize);
        outputAnalyser.current.getByteTimeDomainData(values);
        setOutputLevel(rms(values));
      }
    };
    frame = requestAnimationFrame(draw);
    return () => {
      navigator.mediaDevices?.removeEventListener("devicechange", changed);
      cancelAnimationFrame(frame);
      finish(true);
      stopSpeech();
      void ctx.current?.close();
    };
  }, [finish, refresh, stopSpeech]);
  useEffect(() => {
    if (outputGain.current)
      outputGain.current.gain.value = outputScale.current * settings.volume;
    if (audio.current) audio.current.playbackRate = settings.speechSpeed;
  }, [settings.volume, settings.speechSpeed]);
  useEffect(() => {
    if (ctx.current && outputAnalyser.current)
      void route(ctx.current).catch((e) =>
        callbacks.current.onError(e.message),
      );
  }, [settings.outputDevice]);
  return {
    devices,
    recording,
    starting,
    captureMode,
    speechDetected,
    listeningStatus,
    transcribing,
    speaking,
    fixture,
    inputLevel,
    outputLevel,
    bars,
    deviceError,
    refresh,
    start,
    finish,
    speak,
    stopSpeech,
    test,
    sinkSupported: "setSinkId" in AudioContext.prototype,
  };
}
export type AudioController = ReturnType<typeof useAudio>;
