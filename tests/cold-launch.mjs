// This test starts the installed shell launcher with the same AppArmor label as
// the GNOME desktop. It deliberately does not start or attach Playwright.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdir,
  readFile,
  readdir,
  readlink,
  realpath,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { DatabaseSync } from "node:sqlite";

const run = promisify(execFile);
const root = path.resolve(".");
const qaBase = path.join(root, ".dev", "cold-launch");
const qa = path.join(qaBase, `run-${Date.now()}-${process.pid}`);
const launcher = path.join(os.homedir(), ".local", "bin", "jarvis");
const desktop = path.join(
  process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"),
  "applications",
  "io.jarvis.Desktop.desktop",
);
const runtime = await realpath(
  path.join(
    process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"),
    "jarvis",
    "runtime",
    "jarvis-bin",
  ),
);
const source = await readFile(launcher, "utf8");
const logAssignment = source.match(/^JARVIS_LOG_BASE=(.*)$/m)?.[1];
assert.ok(
  logAssignment,
  "The installed launcher must identify its diagnostic directory.",
);
// Ask Bash to parse the installer-generated %q assignment; never evaluate user text.
const { stdout: logBase } = await run("bash", [
  "-c",
  `JARVIS_LOG_BASE=${logAssignment}\nprintf '%s' "$JARVIS_LOG_BASE"`,
]);
const logFile = path.join(logBase, "launcher.log");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const exists = async (file) => !!(await stat(file).catch(() => null));
const results = [];
await mkdir(qa, { recursive: true });

assert.equal(
  process.platform,
  "linux",
  "Cold launcher verification requires Linux.",
);
assert.notEqual(
  process.getuid?.(),
  0,
  "Run cold launcher verification as the normal desktop user.",
);
assert.ok(
  process.env.DISPLAY,
  "Cold launcher verification requires an X11 desktop.",
);
const hasAaExec = await exists("/usr/bin/aa-exec");
const parentLabel = (await readFile("/proc/self/attr/current", "utf8")).trim();
if (!hasAaExec && parentLabel !== "unconfined")
  throw new Error(
    `Cannot reproduce the desktop AppArmor context: aa-exec is unavailable and the test parent is ${parentLabel}.`,
  );
const contextCommand = hasAaExec ? "/usr/bin/aa-exec" : "/usr/bin/env";
const contextArgs = hasAaExec ? ["-p", "unconfined", "--"] : [];
const { stdout: label } = await run(contextCommand, [
  ...contextArgs,
  "cat",
  "/proc/self/attr/current",
]);
assert.equal(
  label.trim(),
  "unconfined",
  "The cold launcher must start from the actual desktop security context.",
);

async function procIdentity(pid) {
  try {
    const [exe, procStat] = await Promise.all([
      realpath(`/proc/${pid}/exe`),
      readFile(`/proc/${pid}/stat`, "utf8"),
    ]);
    const started = procStat
      .slice(procStat.lastIndexOf(")") + 2)
      .split(" ")[19];
    return { pid, exe, started };
  } catch {
    return null;
  }
}
async function ownsData(pid, config) {
  const expected = path.join(
    path.dirname(config),
    "data",
    "jarvis",
    "jarvis.sqlite3",
  );
  try {
    const files = await readdir(`/proc/${pid}/fd`);
    const targets = await Promise.all(
      files.map((fd) => readlink(`/proc/${pid}/fd/${fd}`).catch(() => "")),
    );
    return targets.includes(expected);
  } catch {
    return false;
  }
}
async function ownedPids(config) {
  const { stdout } = await run("pgrep", [
    "-u",
    String(process.getuid()),
    "-x",
    "jarvis-bin",
  ]).catch(() => ({ stdout: "" }));
  const candidates = await Promise.all(
    stdout
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((x) => procIdentity(Number(x))),
  );
  const owned = await Promise.all(
    candidates.map(async (p) =>
      p && p.exe === runtime && (await ownsData(p.pid, config)) ? p : null,
    ),
  );
  return owned.filter(Boolean);
}
async function visibleWindow(config) {
  const { stdout } = await run("xprop", ["-root", "_NET_CLIENT_LIST"]);
  for (const id of stdout.match(/0x[0-9a-f]+/gi) || []) {
    const { stdout: properties } = await run("xprop", [
      "-id",
      id,
      "WM_CLASS",
      "_NET_WM_PID",
      "_NET_WM_NAME",
    ]).catch(() => ({ stdout: "" }));
    if (!/WM_CLASS.*"io\.jarvis\.Desktop"/.test(properties)) continue;
    const pid = Number(
      properties.match(/_NET_WM_PID\([^)]*\)\s*=\s*(\d+)/)?.[1],
    );
    if (!pid) continue;
    const identity = await procIdentity(pid);
    if (!identity || identity.exe !== runtime || !(await ownsData(pid, config)))
      continue;
    const { stdout: geometry } = await run("xwininfo", ["-id", id, "-stats"]);
    if (/Map State: IsViewable/.test(geometry))
      return { ...identity, window: id };
  }
  return null;
}
async function rendererSecurity(mainPid) {
  const { stdout } = await run("ps", [
    "-u",
    String(process.getuid()),
    "-o",
    "pid=,ppid=",
  ]);
  const pairs = stdout
    .trim()
    .split("\n")
    .map((line) => line.trim().split(/\s+/).map(Number));
  const descendants = new Set([mainPid]),
    depths = new Map([[mainPid, 0]]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [pid, ppid] of pairs)
      if (descendants.has(ppid) && !descendants.has(pid)) {
        descendants.add(pid);
        depths.set(pid, (depths.get(ppid) || 0) + 1);
        changed = true;
      }
  }
  for (const pid of descendants) {
    if (pid === mainPid) continue;
    try {
      const cmd = (await readFile(`/proc/${pid}/cmdline`, "utf8")).split("\0");
      const explicitType = cmd.find((a) => a.startsWith("--type="));
      if (explicitType && explicitType !== "--type=renderer") continue;
      if (!explicitType && (depths.get(pid) || 0) < 3) continue;
      const status = await readFile(`/proc/${pid}/status`, "utf8");
      assert.ok(
        !cmd.some(
          (a) => a === "--no-sandbox" || a === "--disable-setuid-sandbox",
        ),
        "The real renderer must not bypass its sandbox.",
      );
      if (
        !/^Seccomp:\s*2$/m.test(status) ||
        !/^NoNewPrivs:\s*1$/m.test(status)
      ) {
        if (explicitType === "--type=renderer")
          throw new Error(
            "The actual renderer lacks seccomp or NoNewPrivs restrictions.",
          );
        continue;
      }
      return {
        pid,
        seccomp: 2,
        noNewPrivs: 1,
        identification: explicitType
          ? "renderer command line"
          : "protected deep descendant; sandbox hides its command line",
      };
    } catch (e) {
      if (e.code === "ENOENT") continue;
      throw e;
    }
  }
  return null;
}
async function cleanup(config) {
  for (const identity of await ownedPids(config)) {
    const current = await procIdentity(identity.pid);
    if (!current || current.started !== identity.started) continue;
    process.kill(identity.pid, "SIGTERM");
    for (let i = 0; i < 30; i++) {
      if (!(await procIdentity(identity.pid))) break;
      await delay(100);
    }
    const remaining = await procIdentity(identity.pid);
    if (
      remaining &&
      remaining.started === identity.started &&
      (await ownsData(identity.pid, config))
    )
      process.kill(identity.pid, "SIGKILL");
  }
}
async function readNewLog(offset) {
  const content = await readFile(logFile, "utf8").catch(() => "");
  return Buffer.byteLength(content) >= offset
    ? Buffer.from(content).subarray(offset).toString()
    : content;
}
async function scenario(kind) {
  const folder = path.join(qa, kind),
    config = path.join(folder, "config"),
    project = path.join(folder, "caller project with spaces");
  await mkdir(project, { recursive: true });
  const env = {
    ...process.env,
    XDG_CONFIG_HOME: config,
    XDG_DATA_HOME: path.join(folder, "data"),
    XDG_STATE_HOME: path.join(folder, "state"),
    XDG_CACHE_HOME: path.join(folder, "cache"),
    JARVIS_CODEX_RUNTIME: "/nonexistent/JARVIS-explicit-cold-launch-test",
  };
  for (const name of [
    "ELECTRON_RUN_AS_NODE",
    "ELECTRON_DISABLE_SANDBOX",
    "CHROME_DEVEL_SANDBOX",
    "NODE_OPTIONS",
  ])
    delete env[name];
  const offset = (await stat(logFile).catch(() => ({ size: 0 }))).size;
  assert.equal(
    (await ownedPids(config)).length,
    0,
    "The cold launch must have no existing test instance.",
  );
  try {
    if (kind === "command")
      await run(
        contextCommand,
        [
          ...contextArgs,
          "bash",
          "-lc",
          'jarvis "$1"',
          "jarvis-cold-test",
          "caller project with spaces",
        ],
        { cwd: folder, env, timeout: 10000 },
      );
    else
      await run(
        contextCommand,
        [...contextArgs, "gio", "launch", desktop, project],
        { cwd: folder, env, timeout: 10000 },
      );
    let main;
    for (let i = 0; i < 70; i++) {
      main = await visibleWindow(config);
      if (main) break;
      const added = await readNewLog(offset);
      if (/FATAL:.*(?:sandbox|zygote)|No usable sandbox/i.test(added))
        throw new Error(
          `Cold ${kind} launch aborted before creating a window:\n${added.slice(-4000)}`,
        );
      await delay(150);
    }
    assert.ok(
      main,
      `Cold ${kind} launch did not create a visible JARVIS window. New launcher diagnostics:\n${(await readNewLog(offset)).slice(-4000)}`,
    );
    await delay(1200);
    const alive = await procIdentity(main.pid);
    assert.equal(
      alive?.started,
      main.started,
      "The real application must remain alive after startup.",
    );
    assert.equal(
      (await readFile(`/proc/${main.pid}/attr/current`, "utf8")).trim(),
      "unconfined",
      "The test application must not inherit the Code or Playwright security context.",
    );
    const args = (await readFile(`/proc/${main.pid}/cmdline`, "utf8")).split(
      "\0",
    );
    assert.ok(
      !args.some(
        (a) =>
          a === "--no-sandbox" ||
          a === "--disable-setuid-sandbox" ||
          a.startsWith("--inspect") ||
          a.startsWith("--remote-debugging-port"),
      ),
      "Cold startup must use production arguments, with no inspector or sandbox bypass.",
    );
    let renderer;
    for (let i = 0; i < 30; i++) {
      renderer = await rendererSecurity(main.pid);
      if (renderer) break;
      await delay(100);
    }
    assert.ok(renderer, "A sandboxed renderer must exist.");
    const db = new DatabaseSync(
      path.join(env.XDG_DATA_HOME, "jarvis", "jarvis.sqlite3"),
      { readOnly: true },
    );
    try {
      const row = db.prepare("SELECT value FROM kv WHERE key=?").get("project");
      assert.equal(
        JSON.parse(row?.value || "null"),
        await realpath(project),
        "The real launcher must open the intended project path.",
      );
    } finally {
      db.close();
    }
    const result = {
      kind,
      mainPid: main.pid,
      window: main.window,
      securityContext: "unconfined",
      renderer,
      project,
    };
    results.push(result);
    console.log(
      `PASS cold ${kind} launch: visible window, intended project, unconfined parent, seccomp renderer; no Playwright instance or debugging switches.`,
    );
  } finally {
    await cleanup(config);
  }
}
try {
  await scenario("command");
  await scenario("desktop");
  await writeFile(
    path.join(qa, "results.json"),
    JSON.stringify(
      { runtime, launcher, desktop, parentLabel, results },
      null,
      2,
    ),
  );
  console.log(
    `PASS ${results.length} actual cold-launch checks. Evidence: ${qa}`,
  );
} catch (error) {
  await writeFile(
    path.join(qa, "failure.json"),
    JSON.stringify(
      { runtime, parentLabel, results, error: String(error) },
      null,
      2,
    ),
  );
  throw error;
}
