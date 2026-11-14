// Explicit authenticated integration test. This sends a tiny real task to Codex.
import { _electron as electron } from "playwright";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
const root = path.resolve("."),
  qa = path.join(root, ".dev", "live-desktop-qa");
await mkdir(qa, { recursive: true });
const project = path.join(qa, "project with spaces");
await mkdir(project, { recursive: true });
await writeFile(
  path.join(project, "README.md"),
  "JARVIS authenticated desktop test project.\n",
);
const runtime =
  process.env.JARVIS_LIVE_CODEX ||
  execFileSync("bash", ["-c", "command -v codex"], { encoding: "utf8" }).trim();
const env = {
  ...process.env,
  XDG_CONFIG_HOME: qa + "/config",
  XDG_DATA_HOME: qa + "/data",
  XDG_STATE_HOME: qa + "/state",
  XDG_CACHE_HOME: qa + "/cache",
  JARVIS_CODEX_RUNTIME: runtime,
  CHROME_DEVEL_SANDBOX:
    process.env.CHROME_DEVEL_SANDBOX || "/opt/google/chrome/chrome-sandbox",
};
delete env.ELECTRON_RUN_AS_NODE;
const executablePath =
  process.env.JARVIS_TEST_EXECUTABLE ||
  root + "/build/linux-unpacked/jarvis-bin";
const launch = () =>
  electron.launch({
    executablePath,
    args: ["--class=jarvis", "--name=jarvis"],
    env,
    chromiumSandbox: true,
    timeout: 30000,
  });
let app;
let conversationId, threadId;
const results = [];
try {
  app = await launch();
  let page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  await page.waitForSelector(".app-shell");
  await page.waitForFunction(
    async () => {
      const s = await window.jarvis.invoke("codex.status");
      return s.connected;
    },
    {},
    { timeout: 45000 },
  );
  const status = await page.evaluate(() =>
    window.jarvis.invoke("codex.status"),
  );
  if (status.requiresOpenaiAuth && !status.account)
    throw new Error("BLOCKED: no authenticated Codex account.");
  await page.evaluate(
    (project) => window.jarvis.invoke("project.open", { path: project }),
    project,
  );
  await page.evaluate(() =>
    window.jarvis.invoke("settings.update", {
      patch: { permissionMode: "read-only" },
    }),
  );
  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .first()
    .click();
  await page.getByRole("textbox", { name: "Message JARVIS" }).waitFor();
  await page.evaluate(() => {
    window.__qaEvents = [];
    window.jarvis.onEvent((e) => {
      if (
        ["item/agentMessage/delta", "item/started", "turn/completed"].includes(
          e.method,
        )
      )
        window.__qaEvents.push({
          method: e.method,
          type: e.params?.item?.type,
          status: e.params?.turn?.status,
        });
    });
  });
  await page
    .getByRole("textbox", { name: "Message JARVIS" })
    .fill(
      "Run pwd exactly once in this project, then reply exactly: JARVIS desktop verified. Do not modify any files.",
    );
  await page.getByRole("textbox", { name: "Message JARVIS" }).press("Enter");
  await page.waitForFunction(
    () => window.__qaEvents.some((e) => e.method === "turn/completed"),
    {},
    { timeout: 120000 },
  );
  await page
    .locator(".assistant-message")
    .filter({ hasText: "JARVIS desktop verified." })
    .waitFor();
  const events = await page.evaluate(() => window.__qaEvents);
  assert.ok(events.some((e) => e.method === "item/agentMessage/delta"));
  assert.ok(events.some((e) => e.type === "commandExecution"));
  const boot = await page.evaluate(() => window.jarvis.invoke("bootstrap"));
  const c = boot.conversations.find(
    (c) => c.project === project && !c.archived,
  );
  assert.ok(c?.threadId);
  conversationId = c.id;
  threadId = c.threadId;
  results.push(
    "real reply streamed through packaged UI with genuine command event",
  );
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.screenshot({ path: qa + "/live-conversation.png" });
  await app.close();
  app = null;
  app = await launch();
  page = await app.firstWindow();
  await page.waitForSelector(".app-shell");
  await page.waitForFunction(
    async () => (await window.jarvis.invoke("codex.status")).connected,
    {},
    { timeout: 45000 },
  );
  const opened = await page.evaluate(
    (id) => window.jarvis.invoke("conversations.open", { id }),
    conversationId,
  );
  assert.equal(opened.conversation.threadId, threadId);
  assert.ok(opened.thread.thread.turns.length > 0);
  // Open via sidebar when restored selection has not loaded yet.
  if (
    await page
      .getByRole("button", { name: "All conversations", exact: true })
      .count()
  )
    await page
      .getByRole("button", { name: "All conversations", exact: true })
      .click();
  await page
    .locator(".conversation-row")
    .filter({ hasText: "Run pwd exactly once" })
    .click();
  await page
    .locator(".assistant-message")
    .filter({ hasText: "JARVIS desktop verified." })
    .waitFor();
  results.push(
    "same authoritative Codex thread restored after packaged restart",
  );
  await page
    .getByRole("textbox", { name: "Message JARVIS" })
    .fill("Without running any tools, reply exactly: Same thread resumed.");
  await page.getByRole("textbox", { name: "Message JARVIS" }).press("Enter");
  await page
    .locator(".assistant-message")
    .filter({ hasText: "Same thread resumed." })
    .waitFor({ timeout: 120000 });
  const current = await page.evaluate(
    (id) => window.jarvis.invoke("conversations.open", { id }),
    conversationId,
  );
  assert.equal(current.conversation.threadId, threadId);
  results.push(
    "second real turn resumed existing thread rather than copying transcript",
  );
  await page.evaluate(
    (id) => window.jarvis.invoke("conversations.archive", { id }),
    conversationId,
  );
  results.push("test conversation archived through supported backend API");
  await app.close();
  app = null;
  await writeFile(
    qa + "/results.json",
    JSON.stringify(
      {
        results,
        codexVersion: status.version,
        modelsDiscovered: status.models.length,
        subprocessTerminationConfirmed: false,
      },
      null,
      2,
    ),
  );
  console.log(results.map((s) => "PASS " + s).join("\n"));
} catch (error) {
  if (app) {
    try {
      const p = await app.firstWindow();
      await p.screenshot({ path: qa + "/failure.png" });
      console.error((await p.locator("body").innerText()).slice(-6000));
    } catch {}
    await app.close().catch(() => {});
  }
  throw error;
}
