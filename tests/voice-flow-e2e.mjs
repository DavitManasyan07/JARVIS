import { _electron as electron } from "playwright";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

// Explicit generated audio + HTTP/protocol fixtures. Never captures physical audio,
// loads a real provider key, or sends a request to an external service.
const root = path.resolve(import.meta.dirname, "..");
const qa = path.join(root, ".dev", "voice-flow-qa");
await rm(qa, { recursive: true, force: true });
await mkdir(qa, { recursive: true });
const project = path.join(qa, "project with spaces");
await mkdir(project);
const codexLog = path.join(qa, "explicit-codex-fixture.jsonl");
await writeFile(codexLog, "");
const executablePath =
  process.env.JARVIS_TEST_EXECUTABLE ||
  path.join(root, "build", "linux-unpacked", "jarvis-bin");
const env = {
  ...process.env,
  XDG_CONFIG_HOME: path.join(qa, "config"),
  XDG_DATA_HOME: path.join(qa, "data"),
  XDG_STATE_HOME: path.join(qa, "state"),
  XDG_CACHE_HOME: path.join(qa, "cache"),
  JARVIS_CODEX_RUNTIME: path.join(
    root,
    "tests",
    "fixtures",
    "voice-flow-codex.cjs",
  ),
  JARVIS_VOICE_FIXTURE_LOG: codexLog,
  CHROME_DEVEL_SANDBOX:
    process.env.CHROME_DEVEL_SANDBOX || "/opt/google/chrome/chrome-sandbox",
};
delete env.ELECTRON_RUN_AS_NODE;
let app, page;
const results = [],
  errors = [];
const passed = (text) => {
  results.push(text);
  console.log("PASS " + text);
};
const invoke = (method, args) =>
  page.evaluate(({ method, args }) => window.jarvis.invoke(method, args), {
    method,
    args,
  });
const mainStats = () =>
  app.evaluate(() => ({
    calls: globalThis.__jarvisVoiceFixture.calls.map((call) => ({ ...call })),
    synthesisAttempts: globalThis.__jarvisVoiceFixture.synthesisAttempts,
    unexpectedNetwork: [...globalThis.__jarvisVoiceFixture.unexpectedNetwork],
  }));
const provider = (next) =>
  app.evaluate((_, next) => {
    globalThis.__jarvisVoiceFixture.next = next;
  }, next);
const release = (index) =>
  app.evaluate((_, index) => {
    const pending = globalThis.__jarvisVoiceFixture.pending.get(index);
    if (!pending)
      throw new Error(`No pending explicit transcription fixture ${index}`);
    pending();
  }, index);
const turns = async () =>
  (await readFile(codexLog, "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((event) => event.method === "turn/start");
async function poll(check, message, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out: " + message);
}
async function installGeneratedMicrophone() {
  await page.evaluate(() => {
    const label = document.createElement("div");
    label.id = "voice-flow-fixture-label";
    label.textContent =
      "AUTOMATED VOICE FIXTURE · GENERATED INPUT / FAKE PROVIDERS · NO LIVE AUDIO";
    label.style.cssText =
      "position:fixed;top:64px;left:18%;z-index:9999;background:#24434d;color:#fff;padding:6px;font:11px sans-serif;pointer-events:none";
    document.body.append(label);
    window.__jarvisGeneratedMicrophone = { nextPlan: [], captures: [] };
    navigator.mediaDevices.enumerateDevices = async () => [
      {
        kind: "audioinput",
        deviceId: "explicit-generated-microphone",
        groupId: "voice-flow-fixture",
        label: "Generated voice-flow fixture microphone",
        toJSON() {
          return {};
        },
      },
    ];
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const fixture = window.__jarvisGeneratedMicrophone;
      const plan = fixture.nextPlan.length
        ? fixture.nextPlan
        : [
            { ms: 900, level: 0.25 },
            { ms: 20000, level: 0 },
          ];
      const context = new AudioContext();
      await context.resume();
      const source = context.createOscillator(),
        gain = context.createGain(),
        destination = context.createMediaStreamDestination();
      source.type = "sine";
      source.frequency.value = 440;
      source.connect(gain);
      gain.connect(destination);
      let elapsed = 0;
      gain.gain.setValueAtTime(0, context.currentTime);
      for (const segment of plan) {
        gain.gain.setValueAtTime(
          segment.level,
          context.currentTime + elapsed / 1000,
        );
        elapsed += segment.ms;
      }
      gain.gain.setValueAtTime(0, context.currentTime + elapsed / 1000);
      source.start();
      const capture = {
        constraints,
        plan,
        stream: destination.stream,
        context,
        stopped: false,
      };
      fixture.captures.push(capture);
      for (const track of destination.stream.getTracks()) {
        const originalStop = track.stop.bind(track);
        track.stop = () => {
          originalStop();
          if (capture.stopped) return;
          capture.stopped = true;
          try {
            source.stop();
          } catch {}
          if (context.state !== "closed") void context.close().catch(() => {});
        };
      }
      return destination.stream;
    };
    navigator.mediaDevices.dispatchEvent(new Event("devicechange"));
  });
  await page.waitForFunction(
    () =>
      !document.querySelector('[aria-label="Start microphone recording"]')
        ?.disabled,
  );
}
const captureStats = () =>
  page.evaluate(() =>
    window.__jarvisGeneratedMicrophone.captures.map((capture) => ({
      stopped: capture.stopped,
      tracksEnded: capture.stream
        .getTracks()
        .every((track) => track.readyState === "ended"),
    })),
  );
async function startRecording(
  plan = [
    { ms: 900, level: 0.25 },
    { ms: 20000, level: 0 },
  ],
) {
  await page.evaluate((plan) => {
    window.__jarvisGeneratedMicrophone.nextPlan = plan;
  }, plan);
  await page
    .getByRole("button", { name: "Start microphone recording", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Cancel recording", exact: true })
    .waitFor();
}
async function waitIdle(timeout = 6000) {
  await page
    .getByRole("button", { name: "Start microphone recording", exact: true })
    .waitFor({ timeout });
  await page.waitForFunction(
    () =>
      !document.querySelector('[aria-label="Start microphone recording"]')
        ?.disabled,
    { timeout },
  );
}
async function chooseConversation(title) {
  await page
    .getByRole("button", { name: "All conversations", exact: true })
    .click();
  await page.locator(".conversation-row").filter({ hasText: title }).click();
}
async function assertTextOnly() {
  assert.equal(
    (await mainStats()).synthesisAttempts,
    0,
    "No speech provider may be contacted by automatic microphone replies",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Stop speaking", exact: true })
      .count(),
    0,
  );
}

try {
  app = await electron.launch({
    executablePath,
    args: ["--class=jarvis", "--name=jarvis"],
    env,
    chromiumSandbox: true,
    timeout: 30000,
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForSelector(".app-shell");
  const prefs = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(),
  );
  assert.equal(prefs.sandbox, true);
  assert.equal(prefs.contextIsolation, true);
  assert.equal(prefs.nodeIntegration, false);
  assert.equal(
    await app.evaluate(({ app }) => app.commandLine.hasSwitch("no-sandbox")),
    false,
  );

  // Only the main-process provider transport is replaced. Real recorder bytes still
  // cross the validated preload bridge and the production voice service.
  await app.evaluate(async () => {
    const fixture = (globalThis.__jarvisVoiceFixture = {
      calls: [],
      synthesisAttempts: 0,
      unexpectedNetwork: [],
      pending: new Map(),
      next: null,
    });
    globalThis.fetch = async (input, options = {}) => {
      const url =
        typeof input === "string" ? input : input.url || String(input);
      if (url !== "https://api.openai.com/v1/audio/transcriptions") {
        fixture.unexpectedNetwork.push(url);
        throw new Error(
          "Unexpected external fetch blocked by explicit voice fixture.",
        );
      }
      const next = fixture.next;
      fixture.next = null;
      const recording = options.body.get("file");
      const index = fixture.calls.length;
      fixture.calls.push({
        bytes: recording.size,
        mime: recording.type,
        aborted: false,
        resolved: false,
      });
      if (!next)
        throw new Error("No explicit transcription fixture was configured.");
      return new Promise((resolve, reject) => {
        const finish = () => {
          fixture.pending.delete(index);
          fixture.calls[index].resolved = true;
          resolve(
            new Response(JSON.stringify({ text: next.text }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        };
        options.signal?.addEventListener(
          "abort",
          () => {
            fixture.calls[index].aborted = true;
            if (!next.ignoreAbort) {
              fixture.pending.delete(index);
              reject(new Error("Explicit voice fixture cancelled."));
            }
          },
          { once: true },
        );
        fixture.pending.set(index, finish);
        if (!next.defer) setTimeout(finish, 10);
      });
    };
    const https = process.getBuiltinModule("node:https");
    const originalRequest = https.request;
    https.request = function (...args) {
      const target = args[0];
      const host =
        typeof target === "string"
          ? target
          : target?.hostname || target?.host || target?.href || "";
      if (String(host).includes("api.openai.com")) {
        fixture.synthesisAttempts++;
        throw new Error(
          "Speech synthesis is forbidden by the explicit text-only voice-flow test.",
        );
      }
      return originalRequest.apply(this, args);
    };
  });
  const initial = await invoke("bootstrap");
  assert.equal(initial.voice.configured, false);
  await invoke("project.open", { path: project });
  await installGeneratedMicrophone();
  await page
    .getByRole("button", { name: "Start microphone recording", exact: true })
    .click();
  await page.getByRole("dialog").waitFor();
  assert.equal(
    (await captureStats()).length,
    0,
    "Missing key must be detected before microphone permission/capture",
  );
  assert.equal((await mainStats()).calls.length, 0);
  await page.getByRole("button", { name: "Close settings" }).click();
  passed("missing audio key explains setup before any capture or upload");

  await invoke("voice.configure", {
    key: "jarvis-voice-flow-fixture-only-not-a-real-api-key",
    remember: false,
  });
  await invoke("settings.update", {
    patch: {
      microphoneMode: "automatic",
      speechPauseMs: 1200,
      spokenResponses: true,
      autoSendTranscript: false,
      activeConversation: null,
    },
  });
  await page.reload();
  await page.waitForSelector(".app-shell");
  await installGeneratedMicrophone();
  await poll(
    async () => (await invoke("codex.status")).connected,
    "explicit Codex fixture connection",
  );

  await provider({ text: "Voice fixture alpha" });
  await startRecording();
  await poll(
    async () => (await mainStats()).calls.length === 1,
    "speech followed by silence finishes recording",
    7000,
  );
  await poll(
    async () => (await turns()).length === 1,
    "recognized transcript auto-sends once",
  );
  await page
    .locator(".assistant-message")
    .filter({ hasText: "Fixture text reply: Voice fixture alpha" })
    .waitFor();
  await waitIdle();
  const alphaTurn = (await turns())[0];
  assert.equal(alphaTurn.text, "Voice fixture alpha");
  assert.equal(alphaTurn.cwd, project);
  assert.ok(
    (await mainStats()).calls[0].bytes > 1000,
    "Transcription receives actual encoded recorder data",
  );
  assert.equal((await captureStats())[0].tracksEnded, true);
  assert.equal(
    await page
      .locator(".user-message")
      .filter({ hasText: "Voice fixture alpha" })
      .count(),
    1,
  );
  assert.equal(
    await page.getByRole("textbox", { name: "Message JARVIS" }).inputValue(),
    "",
  );
  await assertTextOnly();
  await page.screenshot({ path: path.join(qa, "automatic-text-reply.png") });
  passed(
    "one microphone click captures generated PCM, silence finalizes, one transcript auto-sends, and reply stays text-only",
  );

  const callsBeforeQuiet = (await mainStats()).calls.length;
  await provider({ text: "THIS QUIET RECORDING MUST NEVER UPLOAD" });
  await startRecording([{ ms: 12000, level: 0 }]);
  await waitIdle(12000);
  assert.equal((await mainStats()).calls.length, callsBeforeQuiet);
  assert.equal((await turns()).length, 1);
  passed("no-speech recording cancels after timeout without provider upload");

  const capturesBeforeCancel = (await captureStats()).length;
  await provider({ text: "THIS CANCELLED RECORDING MUST NEVER UPLOAD" });
  await startRecording([{ ms: 10000, level: 0.25 }]);
  await page.waitForTimeout(400);
  await page
    .getByRole("button", { name: "Cancel recording", exact: true })
    .click();
  await waitIdle();
  await page.waitForTimeout(200);
  assert.equal((await mainStats()).calls.length, callsBeforeQuiet);
  assert.equal((await captureStats())[capturesBeforeCancel].tracksEnded, true);
  passed("manual recording cancellation discards audio and stops its tracks");

  await provider({ text: "Voice fixture short pause" });
  await startRecording([
    { ms: 600, level: 0.25 },
    { ms: 600, level: 0 },
    { ms: 700, level: 0.25 },
    { ms: 20000, level: 0 },
  ]);
  await page.waitForTimeout(1400);
  assert.equal(
    await page
      .getByRole("button", { name: "Cancel recording", exact: true })
      .count(),
    1,
  );
  assert.equal((await mainStats()).calls.length, callsBeforeQuiet);
  await poll(
    async () => (await turns()).length === 2,
    "short pause resumes and final long pause auto-sends once",
    7000,
  );
  await waitIdle();
  await assertTextOnly();
  passed(
    "a short speech pause stays within one recording; final silence sends exactly once",
  );

  const composer = page.getByRole("textbox", { name: "Message JARVIS" });
  await composer.fill("Keep this typed draft.");
  const capturesBeforeDraft = (await captureStats()).length;
  await page
    .getByRole("button", { name: "Start microphone recording", exact: true })
    .click();
  await page.waitForTimeout(150);
  assert.equal((await captureStats()).length, capturesBeforeDraft);
  assert.equal(await composer.inputValue(), "Keep this typed draft.");
  assert.equal((await turns()).length, 2);
  await composer.fill("");
  passed(
    "an existing draft blocks automatic capture without overwriting or sending it",
  );

  const beforePinnedCall = (await mainStats()).calls.length;
  await provider({ text: "Voice fixture pinned conversation", defer: true });
  await startRecording();
  await poll(
    async () => (await mainStats()).calls.length === beforePinnedCall + 1,
    "delayed transcription begins",
    7000,
  );
  const other = await invoke("conversations.create", {
    project,
    title: "Other voice fixture conversation",
  });
  await chooseConversation("Other voice fixture conversation");
  await release(beforePinnedCall);
  await poll(
    async () => (await turns()).length === 3,
    "transcript sends to its original conversation",
  );
  const pinnedTurn = (await turns())[2];
  assert.equal(pinnedTurn.threadId, alphaTurn.threadId);
  assert.equal(pinnedTurn.text, "Voice fixture pinned conversation");
  assert.equal(
    (await invoke("bootstrap")).settings.activeConversation,
    other.id,
  );
  assert.equal(
    await page
      .locator(".assistant-message")
      .filter({ hasText: "Voice fixture pinned conversation" })
      .count(),
    0,
  );
  await chooseConversation("Voice fixture alpha");
  await page
    .locator(".assistant-message")
    .filter({
      hasText: "Fixture text reply: Voice fixture pinned conversation",
    })
    .waitFor();
  await waitIdle();
  await assertTextOnly();
  passed(
    "switching conversations during transcription keeps the send pinned without switching the visible conversation",
  );

  const beforeDraftCall = (await mainStats()).calls.length;
  await provider({ text: "Voice fixture needs draft review", defer: true });
  await startRecording();
  await poll(
    async () => (await mainStats()).calls.length === beforeDraftCall + 1,
    "draft-race transcription begins",
    7000,
  );
  await composer.fill("Typed while transcription was pending.");
  await release(beforeDraftCall);
  await waitIdle();
  await poll(
    async () =>
      (await composer.inputValue()).includes(
        "Voice fixture needs draft review",
      ),
    "voice transcript retained for draft review",
  );
  assert.match(
    await composer.inputValue(),
    /Typed while transcription was pending\./,
  );
  assert.equal((await turns()).length, 3);
  await composer.fill("");
  passed(
    "editing a draft while transcription is pending preserves both texts for review and does not auto-send",
  );

  const beforeLateCall = (await mainStats()).calls.length;
  await provider({
    text: "LATE CANCELLED TRANSCRIPT MUST NOT SEND",
    defer: true,
    ignoreAbort: true,
  });
  await startRecording();
  await poll(
    async () => (await mainStats()).calls.length === beforeLateCall + 1,
    "late-response cancellation fixture starts",
    7000,
  );
  await page
    .getByRole("button", { name: "Cancel transcription", exact: true })
    .click();
  await waitIdle();
  await poll(
    async () => (await mainStats()).calls[beforeLateCall].aborted,
    "transcription cancellation aborts the provider request",
  );
  await release(beforeLateCall);
  await page.waitForTimeout(250);
  assert.equal((await turns()).length, 3);
  assert.equal(await composer.inputValue(), "");
  assert.equal(
    await page
      .locator(".message")
      .filter({ hasText: "LATE CANCELLED TRANSCRIPT" })
      .count(),
    0,
  );
  passed(
    "cancelled transcription ignores a late provider response without changing draft or sending a task",
  );

  await provider({ text: "Voice fixture push to talk review" });
  await page.evaluate(() => {
    window.__jarvisGeneratedMicrophone.nextPlan = [{ ms: 10000, level: 0.25 }];
  });
  await page.keyboard.down("Control");
  await page.keyboard.down("Space");
  await page
    .getByRole("button", { name: "Cancel recording", exact: true })
    .waitFor();
  await page.waitForTimeout(500);
  await page.keyboard.up("Space");
  await page.keyboard.up("Control");
  await poll(
    async () =>
      (await composer.inputValue()).includes(
        "Voice fixture push to talk review",
      ),
    "push-to-talk transcript remains available for review",
  );
  assert.equal((await turns()).length, 3);
  passed("push-to-talk release retains the explicit manual-review behavior");
  await assertTextOnly();
  assert.deepEqual((await mainStats()).unexpectedNetwork, []);
  assert.deepEqual(errors, []);
  assert.ok(
    (await captureStats()).every((capture) => capture.tracksEnded),
    "All generated capture tracks must stop",
  );
  await composer.fill("");
  await app.close();
  app = null;
  await writeFile(
    path.join(qa, "results.json"),
    JSON.stringify(
      {
        executablePath,
        fixtures:
          "Explicit generated PCM microphone, fake transcription transport and fake Codex app-server",
        results,
        physicalAudio: "Not performed; no physical devices used",
        paidProviders: "Not contacted",
        realCredentials: "Not loaded or used",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`${results.length} packaged voice-flow checks passed.`);
} catch (error) {
  if (app) {
    try {
      await page.screenshot({ path: path.join(qa, "failure.png") });
      console.error((await page.locator("body").innerText()).slice(0, 7000));
      console.error(JSON.stringify(await mainStats()));
    } catch {}
    await app.close().catch(() => {});
  }
  throw error;
}
