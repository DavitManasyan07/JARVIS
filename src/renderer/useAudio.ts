import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Settings } from "./api";
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
export default function useAudio(
  settings: Settings,
  onTranscript: (text: string) => void,
  onError: (text: string) => void,
) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]),
    [recording, setRecording] = useState(false),
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
    canceledRecorders = useRef(new WeakSet<MediaRecorder>()),
    audio = useRef<HTMLAudioElement | null>(null),
    oscillator = useRef<OscillatorNode | null>(null),
    url = useRef<string | null>(null),
    timeout = useRef<ReturnType<typeof setTimeout> | null>(null),
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
  const finish = useCallback((cancel = false) => {
    recordGeneration.current++;
    if (cancel && recorder.current)
      canceledRecorders.current.add(recorder.current);
    if (timeout.current) clearTimeout(timeout.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    inputAnalyser.current?.disconnect();
    inputAnalyser.current = null;
    setRecording(false);
    setInputLevel(0);
    setBars(Array(32).fill(0));
  }, []);
  const start = useCallback(async () => {
    if (recorder.current?.state === "recording") return;
    stopSpeech();
    const generation = ++recordGeneration.current;
    try {
      const requested = settingsRef.current.inputDevice;
      const available = await navigator.mediaDevices.enumerateDevices();
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
      if (generation !== recordGeneration.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      await refresh();
      const ac = await context(),
        source = ac.createMediaStreamSource(media),
        analyser = ac.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.7;
      source.connect(analyser);
      inputAnalyser.current = analyser;
      const mime = ["audio/webm;codecs=opus", "audio/webm"].find((m) =>
        MediaRecorder.isTypeSupported(m),
      );
      if (generation !== recordGeneration.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      const rec = new MediaRecorder(media, mime ? { mimeType: mime } : {});
      recorder.current = rec;
      const pieces: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) pieces.push(e.data);
      };
      rec.onstop = async () => {
        if (canceledRecorders.current.has(rec)) {
          pieces.length = 0;
          return;
        }
        setTranscribing(true);
        try {
          const blob = new Blob(pieces, { type: rec.mimeType });
          pieces.length = 0;
          if (!blob.size) throw new Error("The recording contains no audio.");
          const data = Array.from(new Uint8Array(await blob.arrayBuffer()));
          const result = await api("voice.transcribe", {
            data,
            mime: rec.mimeType,
            language: settingsRef.current.language || undefined,
          });
          callbacks.current.onTranscript(result.text);
        } catch (e) {
          callbacks.current.onError(String((e as Error).message || e));
        } finally {
          setTranscribing(false);
        }
      };
      media.getAudioTracks()[0].onended = () => {
        finish(true);
        callbacks.current.onError(
          "The microphone was disconnected. Recording was canceled.",
        );
        void refresh();
      };
      rec.start(250);
      setRecording(true);
      timeout.current = setTimeout(() => finish(false), 60000);
    } catch (e) {
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
  }, [finish, refresh, stopSpeech]);
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
        player.onended = stopSpeech;
        player.onerror = () => {
          stopSpeech();
          callbacks.current.onError(
            "Audio playback failed. The written response is available.",
          );
        };
        await player.play();
        setSpeaking(true);
      } catch (e) {
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
        const values = new Uint8Array(inputAnalyser.current.fftSize);
        inputAnalyser.current.getByteTimeDomainData(values);
        setInputLevel(rms(values));
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
