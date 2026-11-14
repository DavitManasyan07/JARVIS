import { _electron as electron } from "playwright";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const root = path.resolve(".");
const qa = path.join(root, ".dev", "packaged-qa");
await rm(qa, { recursive: true, force: true });
await mkdir(qa, { recursive: true });
const project = path.join(qa, "project with spaces");
await mkdir(project);
await writeFile(path.join(project, "note.txt"), "First line\n");
await writeFile(path.join(project, ".hidden"), "hidden");
const env = {
  ...process.env,
  XDG_CONFIG_HOME: path.join(qa, "config"),
  XDG_DATA_HOME: path.join(qa, "data"),
  XDG_STATE_HOME: path.join(qa, "state"),
  XDG_CACHE_HOME: path.join(qa, "cache"),
  JARVIS_CODEX_RUNTIME: "/nonexistent/JARVIS-test-no-runtime",
  CHROME_DEVEL_SANDBOX:
    process.env.CHROME_DEVEL_SANDBOX || "/opt/google/chrome/chrome-sandbox",
};
delete env.ELECTRON_RUN_AS_NODE;
const executablePath =
  process.env.JARVIS_TEST_EXECUTABLE ||
  path.join(root, "build", "linux-unpacked", "jarvis-bin");
const launch = () =>
  electron.launch({
    executablePath,
    args: ["--class=jarvis", "--name=jarvis"],
    env,
    chromiumSandbox: true,
    timeout: 30000,
  });
let app;
const results = [];
function passed(s) {
  results.push(s);
  console.log("PASS " + s);
}
try {
  app = await launch();
  let page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.waitForSelector(".app-shell");
  const isolation = await page.evaluate(() => ({
    require: typeof window.require,
    process: typeof window.process,
    bridge: typeof window.jarvis,
  }));
  assert.deepEqual(isolation, {
    require: "undefined",
    process: "undefined",
    bridge: "object",
  });
  assert.equal(
    await app.evaluate(({ app }) => app.commandLine.hasSwitch("no-sandbox")),
    false,
  );
  const prefs = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(),
  );
  assert.equal(prefs.sandbox, true);
  assert.equal(prefs.contextIsolation, true);
  assert.equal(prefs.nodeIntegration, false);
  passed("packaged Electron startup and renderer sandbox");
  const invoke = (method, args) =>
    page.evaluate(({ method, args }) => window.jarvis.invoke(method, args), {
      method,
      args,
    });
  const boot = await invoke("bootstrap");
  assert.equal(boot.project, null);
  assert.equal(boot.voice.configured, false);
  assert.equal(boot.codex.connected, false);
  assert.ok(
    (await page
      .getByText("No microphone available", { exact: false })
      .count()) > 0,
  );
  passed(
    "startup with unavailable Codex/voice credentials and no capture prompts",
  );
  await assert.rejects(invoke("fs.exec", { command: "id" }));
  await assert.rejects(invoke("fs.read", { path: "x", shell: true }));
  await assert.rejects(
    invoke("settings.update", { patch: { permissionMode: "fake" } }),
  );
  passed("malformed and unlisted IPC rejected");
  await invoke("project.open", { path: project });
  await page.locator(".tree-row").filter({ hasText: "note.txt" }).click();
  await page
    .getByRole("textbox", { name: "Edit note.txt" })
    .fill("Edited through the packaged JARVIS interface.\n");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  assert.equal(
    await readFile(path.join(project, "note.txt"), "utf8"),
    "Edited through the packaged JARVIS interface.\n",
  );
  passed("project with spaces, explorer, text editing and save");
  await page.getByRole("button", { name: "Create file", exact: true }).click();
  await page.getByRole("textbox", { name: "Item name" }).fill("new file.md");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.locator(".tree-row").filter({ hasText: "new file.md" }).waitFor();
  passed("create file through working explorer");
  await page
    .getByRole("button", { name: "Show hidden files", exact: true })
    .click();
  await page.locator(".tree-row").filter({ hasText: ".hidden" }).waitFor();
  await invoke("settings.update", {
    patch: { reducedMotion: true, textSize: 16 },
  });
  const c = await invoke("conversations.create", {
    project,
    title: "Persistent reference",
  });
  await invoke("conversations.update", { id: c.id, draft: "Retained draft" });
  await assert.rejects(
    invoke("chat.send", { id: c.id, text: "must not simulate" }),
    /Codex/,
  );
  passed("offline conversations, drafts, and honest unavailable-task error");
  // Explicit test-only native-dialog choices. Production uses real Electron dialogs.
  await app.evaluate(({ dialog }, qa) => {
    dialog.showSaveDialog = async (_w, opts) => ({
      canceled: false,
      filePath:
        qa +
        "/" +
        (opts.title === "Save workspace"
          ? "saved workspace.jarvis-workspace"
          : "export.json"),
    });
  }, qa);
  const workspace = await invoke("workspace.save");
  assert.equal(JSON.parse(await readFile(workspace, "utf8")).version, 1);
  await invoke("project.close");
  await app.evaluate(({ dialog }, workspace) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [workspace],
    });
  }, workspace);
  await invoke("workspace.open");
  assert.equal((await invoke("bootstrap")).project, project);
  passed("save and restore documented workspace format");
  await page.getByRole("button", { name: "Return to visualization" }).click();
  // Project HTML remains inert text. Markdown has separate fixture tests.
  await invoke("fs.create", {
    parent: project,
    name: "unsafe.html",
    directory: false,
  });
  await invoke("fs.save", {
    path: path.join(project, "unsafe.html"),
    content:
      '<script>window.__unsafeExecuted=true</script><img onerror="window.__unsafeExecuted=true">',
  });
  await page.locator(".tree-row").filter({ hasText: "unsafe.html" }).click();
  assert.equal(await page.evaluate(() => window.__unsafeExecuted), undefined);
  passed("unsafe project content stays inert in text editor");
  await page.getByRole("button", { name: "Return to visualization" }).click();
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.unmaximize();
    w.setBounds({ width: 1366, height: 768 });
  });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(qa, "laptop.png") });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setBounds({ width: 1920, height: 1080 }),
  );
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(qa, "desktop.png") });
  passed(
    "laptop and desktop renderer captures without horizontal page overflow",
  );
  await invoke("settings.update", {
    patch: { explorerWidth: 600, chatWidth: 900 },
  });
  await page.reload();
  await page.waitForSelector(".app-shell");
  await page.setViewportSize({ width: 1000, height: 720 });
  const dimensions = await page.evaluate(() => ({
    left: document.querySelector(".explorer").getBoundingClientRect().width,
    right: document.querySelector(".chat-panel").getBoundingClientRect().width,
    center: document.querySelector(".main-workspace").getBoundingClientRect()
      .width,
    overflow: document.documentElement.scrollWidth > innerWidth,
  }));
  assert.ok(
    dimensions.left >= 180 &&
      dimensions.right >= 300 &&
      dimensions.center >= 260,
  );
  assert.equal(dimensions.overflow, false);
  await invoke("settings.update", {
    patch: { explorerWidth: 248, chatWidth: 410 },
  });
  await page.reload();
  await page.waitForSelector(".app-shell");
  await page.setViewportSize({ width: 1920, height: 1080 });
  passed("oversized saved panels fit a smaller window");

  await page
    .getByRole("button", { name: "Settings", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "Output", exact: true }).click();
  await page
    .getByRole("button", { name: "Start visualization test", exact: true })
    .click();
  await page.getByRole("button", { name: "Close settings" }).click();
  await page.waitForTimeout(500);
  assert.ok(
    (await page.locator('[aria-label*="generated test signal"]').count()) > 0,
  );
  await page.screenshot({ path: path.join(qa, "fixture.png") });
  passed("labeled generated-signal visualization test");
  await page
    .getByRole("button", { name: "Settings", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "Output", exact: true }).click();
  await page
    .getByRole("button", { name: "Stop visualization test", exact: true })
    .click();
  await page.getByRole("button", { name: "Close settings" }).click();
  // Explicit generated microphone/device fixture: no physical recording or provider call.
  await page.evaluate(() => {
    const label = document.createElement("div");
    label.id = "audio-fixture-label";
    label.textContent =
      "AUTOMATED DEVICE FIXTURE — GENERATED AUDIO, NO LIVE MICROPHONE";
    label.style.cssText =
      "position:fixed;top:62px;left:30%;z-index:9999;background:#234049;color:white;padding:8px";
    document.body.append(label);
    navigator.mediaDevices.enumerateDevices = async () => [
      {
        kind: "audioinput",
        deviceId: "fixture-mic",
        groupId: "fixture",
        label: "Generated fixture microphone",
        toJSON() {
          return {};
        },
      },
    ];
    navigator.mediaDevices.getUserMedia = async () => {
      const ctx = new AudioContext();
      await ctx.resume();
      const osc = ctx.createOscillator(),
        dest = ctx.createMediaStreamDestination();
      osc.frequency.value = 440;
      osc.connect(dest);
      osc.start();
      window.__fixtureContext = ctx;
      window.__fixtureStream = dest.stream;
      return dest.stream;
    };
    navigator.mediaDevices.dispatchEvent(new Event("devicechange"));
  });
  await page
    .getByRole("button", { name: "Start microphone recording" })
    .click();
  await page.getByRole("img", { name: "Live microphone waveform" }).waitFor();
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".waveform i")].some(
      (bar) => parseFloat(bar.style.height) > 4,
    ),
  );
  const heights = await page
    .locator(".waveform i")
    .evaluateAll((bars) => bars.map((bar) => bar.style.height));
  assert.deepEqual(heights, heights.slice().reverse());
  await page.screenshot({
    path: path.join(qa, "generated-microphone-fixture.png"),
  });
  await page.evaluate(() => {
    navigator.mediaDevices.enumerateDevices = async () => [];
    window.__fixtureStream
      .getAudioTracks()[0]
      .dispatchEvent(new Event("ended"));
    navigator.mediaDevices.dispatchEvent(new Event("devicechange"));
    void window.__fixtureContext.close();
    document.getElementById("audio-fixture-label").remove();
  });
  await page.getByRole("img", { name: "Microphone inactive" }).waitFor();
  assert.ok(
    await page
      .getByRole("button", { name: "Start microphone recording" })
      .isDisabled(),
  );
  passed(
    "generated microphone waveform symmetry and device-disconnection cancellation",
  );
  assert.deepEqual(errors, []);
  await app.close();
  app = null;
  app = await launch();
  page = await app.firstWindow();
  await page.waitForSelector(".app-shell");
  const restored = await page.evaluate(() => window.jarvis.invoke("bootstrap"));
  assert.equal(restored.project, project);
  assert.equal(restored.settings.reducedMotion, true);
  assert.equal(restored.settings.textSize, 16);
  assert.equal(
    restored.conversations.find((row) => row.id === c.id)?.draft,
    "Retained draft",
  );
  passed("SQLite and workspace persistence after packaged restart");
  await page.evaluate(() =>
    window.jarvis.invoke("settings.update", {
      patch: { restoreSession: true },
    }),
  );
  await app.close();
  app = null;
  await rm(project, { recursive: true });
  app = await launch();
  page = await app.firstWindow();
  await page.waitForSelector(".app-shell");
  const missing = await page.evaluate(() => window.jarvis.invoke("bootstrap"));
  assert.equal(missing.project, null);
  assert.ok(missing.startupError);
  passed("missing project does not prevent startup");
  await app.close();
  app = null;
  await writeFile(
    path.join(qa, "results.json"),
    JSON.stringify(
      {
        executablePath,
        results,
        physicalAudio: "not performed: hardware absent",
        authenticatedCodex:
          "separate real protocol verification in .dev/codex-verification.json",
      },
      null,
      2,
    ),
  );
  console.log(`${results.length} packaged checks passed.`);
} catch (error) {
  if (app) {
    try {
      const page = await app.firstWindow();
      await page.screenshot({ path: path.join(qa, "failure.png") });
      console.error((await page.locator("body").innerText()).slice(0, 6000));
    } catch {}
    await app.close().catch(() => {});
  }
  throw error;
}
