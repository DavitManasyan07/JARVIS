import { _electron as electron } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
const run = promisify(execFile);
const root = path.resolve(".");
const qa = root + "/.dev/launcher-qa";
await mkdir(qa, { recursive: true });
const project = qa + "/caller project with spaces";
await mkdir(project, { recursive: true });
const base =
  (process.env.XDG_DATA_HOME || os.homedir() + "/.local/share") + "/jarvis";
const executablePath = base + "/runtime/jarvis-bin";
const launcher = os.homedir() + "/.local/bin/jarvis";
const desktop =
  (process.env.XDG_DATA_HOME || os.homedir() + "/.local/share") +
  "/applications/io.jarvis.Desktop.desktop";
const env = {
  ...process.env,
  XDG_CONFIG_HOME: qa + "/config",
  XDG_DATA_HOME: qa + "/data",
  XDG_STATE_HOME: qa + "/state",
  XDG_CACHE_HOME: qa + "/cache",
  JARVIS_CODEX_RUNTIME: "/nonexistent/JARVIS-explicit-launch-test",
  CHROME_DEVEL_SANDBOX: "/opt/google/chrome/chrome-sandbox",
};
delete env.ELECTRON_RUN_AS_NODE;
let app;
async function waitMinimized(expected) {
  for (let i = 0; i < 60; i++) {
    if (
      (await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].isMinimized(),
      )) === expected
    )
      return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Native window minimized state did not become " + expected);
}

try {
  app = await electron.launch({
    executablePath,
    args: ["--class=jarvis", "--name=jarvis"],
    env,
    chromiumSandbox: true,
  });
  const page = await app.firstWindow();
  await page.waitForSelector(".app-shell");
  await page.evaluate(() => window.jarvis.invoke("project.close"));
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].minimize(),
  );
  await waitMinimized(true);
  await run(
    "bash",
    ["-lc", 'jarvis "$1"', "jarvis-test", "caller project with spaces"],
    { cwd: qa, env, timeout: 15000 },
  );
  await page.waitForFunction(
    async (project) =>
      (await window.jarvis.invoke("bootstrap")).project === project,
    project,
    { timeout: 15000 },
  );
  assert.equal(
    await app.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
    ),
    1,
  );
  await waitMinimized(false);
  assert.equal(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isMinimized(),
    ),
    false,
  );
  console.log(
    "PASS jarvis command on login PATH, relative caller path with spaces, single-instance focus",
  );
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].minimize(),
  );
  await waitMinimized(true);
  await run("gio", ["launch", desktop], { env, timeout: 15000 });
  await waitMinimized(false);
  assert.equal(
    await app.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
    ),
    1,
  );
  console.log("PASS installed desktop launcher activates existing app");
  await app.close();
  app = null;
  await writeFile(
    qa + "/results.json",
    JSON.stringify(
      {
        launcher,
        desktop,
        executablePath,
        passed: [
          "login PATH jarvis",
          "relative caller path with spaces",
          "single instance focus",
          "desktop entry launch",
        ],
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (app) await app.close().catch(() => {});
  throw error;
}
