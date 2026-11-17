import { useEffect, useRef, useState } from "react";
import {
  X,
  SlidersHorizontal,
  Cpu,
  AudioLines,
  Mic,
  Volume2,
  Shield,
  LockKeyhole,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { api, type Settings as SettingsData } from "./api";
import type { AudioController } from "./useAudio";
const groups = [
  { id: "General", icon: SlidersHorizontal },
  { id: "Codex", icon: Cpu },
  { id: "Voice", icon: AudioLines },
  { id: "Input", icon: Mic },
  { id: "Output", icon: Volume2 },
  { id: "Privacy and data", icon: LockKeyhole },
  { id: "Permissions", icon: Shield },
];
export default function Settings({
  settings,
  update,
  codex,
  voice,
  audio,
  dataPaths,
  close,
  refresh,
  onError,
  initialGroup = "General",
}: {
  settings: SettingsData;
  update(patch: Partial<SettingsData>): Promise<void>;
  codex: any;
  voice: any;
  audio: AudioController;
  dataPaths: any;
  close(): void;
  refresh(): Promise<void>;
  onError(text: string): void;
  initialGroup?: string;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const all = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]',
        ) || [],
      ).filter((el) => el.getClientRects().length);
      const first = all[0],
        last = all.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  const [group, setGroup] = useState(initialGroup),
    [key, setKey] = useState(""),
    [remember, setRemember] = useState(false),
    [working, setWorking] = useState(false),
    [notice, setNotice] = useState("");
  const set = (name: keyof SettingsData, value: any) =>
    void update({ [name]: value });
  const task = async (fn: () => Promise<any>) => {
    setWorking(true);
    setNotice("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setWorking(false);
    }
  };
  const check = (
    name: keyof SettingsData,
    label: string,
    description?: string,
  ) => (
    <label className="setting-check">
      <input
        type="checkbox"
        checked={!!settings[name]}
        onChange={(e) => set(name, e.target.checked)}
      />
      <span>
        {label}
        {description && <small>{description}</small>}
      </span>
    </label>
  );
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="settings-dialog"
      >
        <header>
          <div>
            <SlidersHorizontal size={19} />
            <h2 id="settings-title">Settings</h2>
          </div>
          <button
            autoFocus
            aria-label="Close settings"
            title="Close settings"
            onClick={close}
          >
            <X size={19} />
          </button>
        </header>
        <div className="settings-body">
          <nav aria-label="Settings groups">
            {groups.map((g) => (
              <button
                key={g.id}
                className={group === g.id ? "active" : ""}
                onClick={() => setGroup(g.id)}
              >
                <g.icon size={16} />
                {g.id}
              </button>
            ))}
          </nav>
          <div className="settings-content">
            <h3>{group}</h3>
            {group === "General" && (
              <>
                {check(
                  "restoreSession",
                  "Restore the last workspace",
                  "Open the previous project when JARVIS starts.",
                )}
                <label className="setting-field">
                  Startup folder
                  <input
                    value={settings.startupWorkspace}
                    placeholder="Optional absolute path"
                    onChange={(e) => set("startupWorkspace", e.target.value)}
                  />
                  <small>
                    Used when restoring the previous workspace is disabled.
                  </small>
                </label>
                <label className="setting-field">
                  Theme
                  <select
                    value={settings.theme}
                    onChange={(e) => set("theme", e.target.value)}
                  >
                    <option value="dark">Dark charcoal</option>
                    <option value="system">System contrast preference</option>
                  </select>
                  <small>
                    JARVIS uses a dark interface. System mode follows the system
                    contrast preference.
                  </small>
                </label>
                <label className="setting-field">
                  Text size · {settings.textSize}px
                  <input
                    type="range"
                    min="12"
                    max="20"
                    step="1"
                    value={settings.textSize}
                    onChange={(e) => set("textSize", Number(e.target.value))}
                  />
                </label>
                <label className="setting-field">
                  Animation quality
                  <select
                    value={settings.animationQuality}
                    onChange={(e) => set("animationQuality", e.target.value)}
                  >
                    <option value="high">Standard · up to 30 frames/s</option>
                    <option value="low">Low power · up to 12 frames/s</option>
                  </select>
                </label>
                {check(
                  "reducedMotion",
                  "Reduce motion",
                  "Keep the sphere still. Actual audio levels remain visible.",
                )}
              </>
            )}
            {group === "Codex" && (
              <>
                <div className="setting-status">
                  <i className={codex?.connected ? "connected" : ""} />
                  <div>
                    <strong>
                      {codex?.connected
                        ? "App server connected"
                        : "App server disconnected"}
                    </strong>
                    <small>
                      {codex?.version || "Runtime version unavailable"}
                    </small>
                  </div>
                </div>
                <p className="muted">
                  JARVIS runs Codex as a local child process. Your existing
                  supported Codex sign-in can be used. Your Codex configuration
                  is preserved.
                </p>
                <div className="info-box">
                  {codex?.account
                    ? `Account: ${codex.account.type || "signed in"}${codex.account.email ? ` · ${codex.account.email}` : ""}`
                    : "No signed-in account was reported. Sign in to start online tasks."}
                </div>
                {codex?.error && (
                  <p className="inline-error wrap">{String(codex.error)}</p>
                )}
                <div className="button-row">
                  <button
                    disabled={working}
                    onClick={() => void task(() => api("codex.connect"))}
                  >
                    <RefreshCw size={14} />
                    Reconnect
                  </button>
                  <button
                    className="primary"
                    disabled={working}
                    onClick={() =>
                      void task(async () => {
                        const result = await api("codex.login");
                        setNotice(
                          result?.authUrl
                            ? "Finish sign-in in your browser, then reconnect."
                            : "Follow the Codex sign-in instructions.",
                        );
                      })
                    }
                  >
                    <ExternalLink size={14} />
                    Sign in with ChatGPT
                  </button>
                </div>
                <label className="setting-field">
                  Model
                  <select
                    value={settings.model}
                    onChange={(e) => set("model", e.target.value)}
                  >
                    <option value="">Account default</option>
                    {(codex?.models || []).map((m: any) => (
                      <option value={m.model || m.id} key={m.id || m.model}>
                        {m.displayName || m.model || m.id}
                      </option>
                    ))}
                  </select>
                  <small>Models are reported by the Codex app server.</small>
                </label>
                <details>
                  <summary>Connection diagnostics</summary>
                  <pre className="diagnostics">
                    {JSON.stringify(
                      {
                        connected: codex?.connected,
                        version: codex?.version,
                        error: codex?.error || null,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              </>
            )}
            {group === "Voice" && (
              <>
                <div className="info-box">
                  Voice is optional. Audio is sent to OpenAI only when you
                  record or request speech. An OpenAI API key and separate API
                  billing are required. Codex sign-in does not provide audio API
                  access.
                </div>
                <label className="setting-field">
                  Provider
                  <select
                    value="openai"
                    disabled
                    title="OpenAI is the implemented voice provider"
                  >
                    <option value="openai">OpenAI API</option>
                  </select>
                </label>
                <div className="setting-status">
                  <i className={voice?.configured ? "connected" : ""} />
                  <span>
                    {voice?.configured
                      ? "Audio API key configured"
                      : "Audio API key not configured"}
                  </span>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void task(async () => {
                      await api("voice.configure", { key, remember });
                      setKey("");
                      setNotice("Voice credentials updated.");
                    });
                  }}
                >
                  <label className="setting-field">
                    OpenAI API key
                    <input
                      type="password"
                      autoComplete="off"
                      value={key}
                      placeholder="Enter an API key"
                      onChange={(e) => setKey(e.target.value)}
                    />
                  </label>
                  <label className="setting-check">
                    <input
                      type="checkbox"
                      checked={remember}
                      disabled={!voice?.secureStorage}
                      onChange={(e) => setRemember(e.target.checked)}
                    />
                    <span>
                      Keep the key in the operating-system secret store
                      <small>
                        {voice?.secureStorage
                          ? `Available: ${voice.backend}`
                          : "A secure secret store is unavailable. Use a session-only key."}
                      </small>
                    </span>
                  </label>
                  <div className="button-row">
                    <button
                      className="primary"
                      disabled={!key.trim() || working}
                    >
                      Use key
                    </button>
                    <button
                      type="button"
                      disabled={!voice?.configured || working}
                      onClick={() => void task(() => api("voice.clearKey"))}
                    >
                      Remove key
                    </button>
                  </div>
                </form>
                <label className="setting-field">
                  AI-generated voice
                  <select
                    value={settings.voice}
                    onChange={(e) => set("voice", e.target.value)}
                  >
                    {[
                      "alloy",
                      "ash",
                      "ballad",
                      "coral",
                      "echo",
                      "sage",
                      "shimmer",
                      "verse",
                      "marin",
                      "cedar",
                    ].map((v) => (
                      <option value={v} key={v}>
                        {v[0].toUpperCase() + v.slice(1)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="setting-field">
                  Playback speed · {settings.speechSpeed}×
                  <input
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    value={settings.speechSpeed}
                    onChange={(e) => set("speechSpeed", Number(e.target.value))}
                  />
                </label>
                <label className="setting-field">
                  Transcription language
                  <input
                    value={settings.language}
                    maxLength={10}
                    placeholder="Automatic, or language code such as en"
                    onChange={(e) => set("language", e.target.value)}
                  />
                </label>
                {check(
                  "spokenResponses",
                  "Speak assistant responses",
                  "Speak replies to typed and manual voice messages. Automatic voice requests always get text replies.",
                )}
                <label className="setting-field">
                  Microphone button
                  <select
                    value={settings.microphoneMode}
                    onChange={(e) => set("microphoneMode", e.target.value)}
                  >
                    <option value="automatic">
                      Automatic · pause to send · text replies
                    </option>
                    <option value="push-to-talk">
                      Manual · click again to finish
                    </option>
                  </select>
                  <small>
                    Automatic mode sends your words to the conversation where
                    you start recording. No Enter key is needed.
                  </small>
                </label>
                <label className="setting-field">
                  Pause before sending ·{" "}
                  {(settings.speechPauseMs / 1000).toFixed(1)} seconds
                  <input
                    type="range"
                    min="600"
                    max="4000"
                    step="100"
                    value={settings.speechPauseMs}
                    disabled={settings.microphoneMode !== "automatic"}
                    onChange={(e) =>
                      set("speechPauseMs", Number(e.target.value))
                    }
                  />
                  <small>
                    {settings.microphoneMode === "automatic"
                      ? "Use a longer pause if you need more time between phrases."
                      : "Pause detection is used only in Automatic mode."}
                  </small>
                </label>
                {check(
                  "autoSendTranscript",
                  "Send manual transcripts automatically",
                  "For Ctrl+Space and manual recording. When off, review the transcript before sending. Automatic mode always sends after a pause.",
                )}
                <p className="muted">
                  Click the microphone, speak, then pause to send. The
                  microphone turns off after each request. Ctrl+Space still
                  records while held. Press Escape to cancel recording or
                  transcription. If no speech is detected for 8 seconds, nothing
                  is sent.
                </p>
              </>
            )}
            {group === "Input" && (
              <>
                <label className="setting-field">
                  Microphone
                  <select
                    value={settings.inputDevice}
                    onChange={(e) => set("inputDevice", e.target.value)}
                  >
                    <option value="default">System default</option>
                    {audio.devices
                      .filter(
                        (d) =>
                          d.kind === "audioinput" && d.deviceId !== "default",
                      )
                      .map((d, i) => (
                        <option key={d.deviceId || i} value={d.deviceId}>
                          {d.label || `Microphone ${i + 1}`}
                        </option>
                      ))}
                  </select>
                </label>
                {!audio.devices.some((d) => d.kind === "audioinput") && (
                  <div className="info-box">
                    No microphone available. Connect a device to use push to
                    talk. Text chat is ready.
                  </div>
                )}
                <label className="setting-field">
                  Live input level
                  <meter
                    min="0"
                    max="1"
                    value={audio.inputLevel}
                    aria-label="Microphone input level"
                  />
                  <small>
                    {audio.recording
                      ? "Recording · audio will be transcribed when you finish."
                      : "Microphone capture is off."}
                  </small>
                </label>
                {check("echoCancellation", "Echo cancellation")}
                {check("noiseSuppression", "Noise suppression")}
                <div className="button-row">
                  <button onClick={() => void audio.refresh()}>
                    <RefreshCw size={14} />
                    Refresh devices
                  </button>
                  {audio.recording && (
                    <button onClick={() => audio.finish(true)}>
                      Cancel recording
                    </button>
                  )}
                </div>
                <p className="muted">
                  Device names may appear only after you explicitly grant
                  microphone access. Recordings are not saved by JARVIS.
                </p>
              </>
            )}
            {group === "Output" && (
              <>
                {audio.sinkSupported ? (
                  <label className="setting-field">
                    Output device
                    <select
                      value={settings.outputDevice}
                      onChange={(e) => set("outputDevice", e.target.value)}
                    >
                      <option value="default">System default</option>
                      {audio.devices
                        .filter(
                          (d) =>
                            d.kind === "audiooutput" &&
                            d.deviceId !== "default",
                        )
                        .map((d, i) => (
                          <option key={d.deviceId || i} value={d.deviceId}>
                            {d.label || `Output ${i + 1}`}
                          </option>
                        ))}
                    </select>
                  </label>
                ) : (
                  <div className="info-box">
                    This runtime uses the system default output device. Change
                    the device in your desktop sound settings.
                  </div>
                )}
                <label className="setting-field">
                  Output volume · {Math.round(settings.volume * 100)}%
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={settings.volume}
                    onChange={(e) => set("volume", Number(e.target.value))}
                  />
                </label>
                <div className="button-row">
                  <button onClick={() => void audio.test(true)}>
                    <Volume2 size={15} />
                    Play test tone
                  </button>
                  <button onClick={audio.stopSpeech}>Stop audio</button>
                </div>
                <small className="muted">
                  The test uses a generated tone. Physical playback cannot be
                  confirmed without speakers.
                </small>
                <hr />
                <h4>Visualization test</h4>
                <p className="muted">
                  A generated test signal drives the sphere. It is labeled as a
                  fixture and does not use the microphone.
                </p>
                <button
                  onClick={() =>
                    audio.fixture ? audio.stopSpeech() : void audio.test(false)
                  }
                >
                  {audio.fixture
                    ? "Stop visualization test"
                    : "Start visualization test"}
                </button>
              </>
            )}
            {group === "Privacy and data" && (
              <>
                <p className="muted">
                  The SQLite database contains workspace settings and
                  conversation references. Codex keeps the authoritative thread
                  history in its own data location.
                </p>
                <dl className="data-paths">
                  {Object.entries(dataPaths || {}).map(([name, path]) => (
                    <div key={name}>
                      <dt>{name}</dt>
                      <dd>{String(path)}</dd>
                    </div>
                  ))}
                </dl>
                <div className="info-box">
                  Raw microphone recordings stay in memory until transcription,
                  then JARVIS discards them. OpenAI receives recordings for
                  transcription and response text for speech. External services
                  have their own data policies.
                </div>
                <p className="muted">
                  Export, archive, or remove an individual conversation in its
                  menu. Local removal deletes its JARVIS reference. It does not
                  delete all provider-side data. Uninstall preserves application
                  data by default.
                </p>
                <button
                  onClick={() => {
                    if (dataPaths?.data)
                      void api("fs.reveal", { path: dataPaths.data }).catch(
                        (e) => onError(e.message),
                      );
                  }}
                  disabled={!dataPaths?.data}
                >
                  Open local data folder
                </button>
              </>
            )}
            {group === "Permissions" && (
              <>
                <p className="muted">
                  The selected policy is applied through Codex sandbox and
                  approval controls on every turn. File-editing controls in
                  JARVIS remain explicit user actions.
                </p>
                <div className="permission-options">
                  {[
                    [
                      "read-only",
                      "Read only",
                      "Codex can inspect files. Changes require supported approval.",
                    ],
                    [
                      "workspace-write",
                      "Workspace access",
                      "Codex can change the conversation project. Additional access requires approval.",
                    ],
                    [
                      "full",
                      "Full access",
                      "Commands can affect files accessible to your user account. Use only for trusted work.",
                    ],
                  ].map(([value, label, desc]) => (
                    <label
                      key={value}
                      className={
                        settings.permissionMode === value ? "selected" : ""
                      }
                    >
                      <input
                        type="radio"
                        name="permissions"
                        checked={settings.permissionMode === value}
                        onChange={() => set("permissionMode", value)}
                      />
                      <span>
                        <strong>{label}</strong>
                        <small>{desc}</small>
                      </span>
                    </label>
                  ))}
                </div>
                {settings.permissionMode === "full" && (
                  <div className="warning-box">
                    Full access is active. Commands can affect files accessible
                    to the current user.
                  </div>
                )}
                <p className="muted">
                  Changing this setting affects the next turn. It does not stop
                  a running command. Use Stop to request interruption.
                </p>
              </>
            )}
            {notice && <p className="notice">{notice}</p>}
          </div>
        </div>
        <footer>
          <span>JARVIS · Local workspace, connected intelligence</span>
          <button onClick={close}>Done</button>
        </footer>
      </section>
    </div>
  );
}
