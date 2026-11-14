import {
  app,
  BrowserWindow,
  Menu,
  ipcMain,
  dialog,
  session,
  nativeTheme,
  screen,
} from "electron";
import {
  mkdirSync,
  readFileSync,
  appendFileSync,
  statSync,
  renameSync,
  existsSync,
} from "node:fs";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { Store } from "./store";
import { CodexEngine, redactDiagnostic } from "./codex";
import { Backend } from "./backend";
import type { JarvisEvent } from "../shared";

if (process.getuid?.() === 0) {
  process.stderr.write("Run JARVIS as a regular Linux user.\n");
  app.exit(1);
}
process.umask(0o077);
app.setName("JARVIS");
app.setDesktopName("io.jarvis.Desktop.desktop");
const home = os.homedir();
const paths = {
  config: path.join(
    process.env.XDG_CONFIG_HOME || path.join(home, ".config"),
    "jarvis",
  ),
  data: path.join(
    process.env.XDG_DATA_HOME || path.join(home, ".local/share"),
    "jarvis",
  ),
  state: path.join(
    process.env.XDG_STATE_HOME || path.join(home, ".local/state"),
    "jarvis",
  ),
  cache: path.join(
    process.env.XDG_CACHE_HOME || path.join(home, ".cache"),
    "jarvis",
  ),
};
for (const folder of Object.values(paths))
  mkdirSync(folder, { recursive: true, mode: 0o700 });
app.setPath("userData", path.join(paths.config, "electron"));
app.setPath("sessionData", path.join(paths.cache, "electron"));
app.setPath("logs", path.join(paths.state, "logs"));
const logFile = path.join(paths.state, "diagnostics.log");
function log(text: string) {
  try {
    if (existsSync(logFile) && statSync(logFile).size > 256 * 1024)
      renameSync(logFile, logFile + ".1");
    appendFileSync(
      logFile,
      new Date().toISOString() + " " + redactDiagnostic(text) + "\n",
      { mode: 0o600 },
    );
  } catch {
    /* Startup must remain possible without log writes. */
  }
}
let win: BrowserWindow;
let backend: Backend;
let store: Store;
let codex: CodexEngine;
let closing = false,
  ready = false;
const rendererFile = path.join(__dirname, "renderer", "index.html");
const rendererURL = pathToFileURL(rendererFile).href;
function event(data: JarvisEvent) {
  if (win && !win.isDestroyed()) win.webContents.send("jarvis:event", data);
}
function commandLineProject(argv: string[], cwd: string) {
  const start = app.isPackaged ? 1 : 2;
  const value = argv.slice(start).find((v) => !v.startsWith("-"));
  return value ? path.resolve(cwd, value) : undefined;
}
const firstProject = commandLineProject(process.argv, process.cwd());
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv, cwd) => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
    const project = commandLineProject(argv, cwd);
    if (project && ready)
      void backend
        .openProject(project)
        .catch((error) =>
          event({ method: "error", params: { message: String(error) } }),
        );
  });
  app
    .whenReady()
    .then(async () => {
      let runtime = process.env.JARVIS_CODEX_RUNTIME;
      if (!runtime)
        try {
          const config = JSON.parse(
            readFileSync(path.join(paths.config, "runtime.json"), "utf8"),
          );
          if (
            typeof config.codexPath === "string" &&
            path.isAbsolute(config.codexPath)
          )
            runtime = config.codexPath;
        } catch {
          /* PATH discovery is available without installer configuration. */
        }
      store = new Store(path.join(paths.data, "jarvis.sqlite3"));
      codex = new CodexEngine(runtime);
      codex.on("diagnostic", log);
      const bounds = store.get<any>("window", { width: 1440, height: 900 });
      const displays = screen.getAllDisplays();
      const savedPosition =
        Number.isFinite(bounds.x) &&
        Number.isFinite(bounds.y) &&
        displays.some(
          (d) =>
            bounds.x + 200 > d.workArea.x &&
            bounds.x < d.workArea.x + d.workArea.width &&
            bounds.y + 100 > d.workArea.y &&
            bounds.y < d.workArea.y + d.workArea.height,
        )
          ? { x: bounds.x, y: bounds.y }
          : {};
      win = new BrowserWindow({
        ...savedPosition,
        width: Math.max(960, Math.min(bounds.width || 1440, 3840)),
        height: Math.max(640, Math.min(bounds.height || 900, 2160)),
        minWidth: 960,
        minHeight: 640,
        title: "JARVIS",
        backgroundColor: "#0c1119",
        show: false,
        icon: path.join(app.getAppPath(), "assets", "jarvis-256.png"),
        autoHideMenuBar: true,
        webPreferences: {
          preload: path.join(__dirname, "preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
          spellcheck: false,
        },
      });
      backend = new Backend(
        store,
        codex,
        () => win,
        event,
        paths,
        () => win.close(),
      );
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      win.webContents.on("will-navigate", (e, url) => {
        if (url !== rendererURL) e.preventDefault();
      });
      win.webContents.on("will-redirect", (e) => e.preventDefault());
      win.webContents.on("render-process-gone", (_e, details) =>
        log(`Renderer exited: ${details.reason}`),
      );
      win.webContents.on("did-fail-load", (_e, code, description) =>
        log(`Renderer load failed (${code}): ${description}`),
      );
      session.defaultSession.setPermissionRequestHandler(
        (contents, permission, callback, details) =>
          callback(
            contents === win.webContents &&
              contents.getURL() === rendererURL &&
              (permission === "speaker-selection" ||
                (permission === "media" &&
                  "mediaTypes" in details &&
                  details.mediaTypes?.length === 1 &&
                  details.mediaTypes[0] === "audio")),
          ),
      );
      session.defaultSession.setPermissionCheckHandler(
        (contents, permission, origin, details) =>
          contents === win.webContents &&
          contents.getURL() === rendererURL &&
          (permission === "speaker-selection" ||
            (permission === "media" && details.mediaType === "audio")),
      );
      session.defaultSession.setDevicePermissionHandler(() => false);
      ipcMain.handle("jarvis:invoke", async (e, method, args) => {
        if (
          e.sender !== win.webContents ||
          e.senderFrame !== win.webContents.mainFrame ||
          e.senderFrame.url !== rendererURL
        )
          throw new Error("Untrusted IPC sender.");
        try {
          return await backend.invoke(method, args);
        } catch (error) {
          throw new Error(
            redactDiagnostic(
              error instanceof Error ? error.message : String(error),
            ),
          );
        }
      });
      const menu = (action: string) =>
        event({ method: "menu", params: { action } });
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          {
            label: "File",
            submenu: [
              {
                label: "New Project/Folder…",
                click: () => menu("project.new"),
              },
              {
                label: "Open Folder…",
                accelerator: "CmdOrCtrl+O",
                click: () => menu("project.open"),
              },
              {
                label: "Open File…",
                accelerator: "CmdOrCtrl+Shift+O",
                click: () => menu("file.open"),
              },
              { type: "separator" },
              { label: "Open Workspace…", click: () => menu("workspace.open") },
              { label: "Save Workspace…", click: () => menu("workspace.save") },
              {
                label: "Open Recent",
                submenu: store.get<string[]>("recents", []).map((p) => ({
                  label: p,
                  click: () =>
                    void backend.openProject(p).catch((error) =>
                      event({
                        method: "error",
                        params: { message: String(error) },
                      }),
                    ),
                })),
              },
              { label: "Close Project", click: () => menu("project.close") },
              { type: "separator" },
              {
                label: "Save",
                accelerator: "CmdOrCtrl+S",
                click: () => menu("save"),
              },
              {
                label: "Save As…",
                accelerator: "CmdOrCtrl+Shift+S",
                click: () => menu("saveAs"),
              },
              { type: "separator" },
              {
                label: "Exit",
                accelerator: "Alt+F4",
                click: () => win.close(),
              },
            ],
          },
          {
            label: "View",
            submenu: [
              {
                label: "Toggle explorer",
                accelerator: "CmdOrCtrl+B",
                click: () => menu("toggleExplorer"),
              },
              {
                label: "Toggle conversations",
                accelerator: "CmdOrCtrl+J",
                click: () => menu("toggleChat"),
              },
              { role: "togglefullscreen" },
              { role: "zoomIn" },
              { role: "zoomOut" },
              { role: "resetZoom" },
            ],
          },
          { label: "Settings", click: () => menu("settings") },
        ]),
      );
      nativeTheme.themeSource = store.settings().theme;
      await backend.init(firstProject);
      ready = true;
      await win.loadFile(rendererFile);
      if (bounds.maximized) win.maximize();
      win.show();
      let saveTimer: ReturnType<typeof setTimeout>;
      const remember = () => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          if (!win.isDestroyed())
            store.set("window", {
              ...win.getNormalBounds(),
              maximized: win.isMaximized(),
            });
        }, 350);
      };
      win.on("resize", remember);
      win.on("move", remember);
      win.on("minimize", () =>
        event({ method: "visibility", params: { visible: false } }),
      );
      win.on("restore", () =>
        event({ method: "visibility", params: { visible: true } }),
      );
      win.on("close", (e) => {
        if (closing) return;
        e.preventDefault();
        void (async () => {
          if (backend.hasActiveTurns()) {
            const result = await dialog.showMessageBox(win, {
              type: "warning",
              message: "Close JARVIS while Codex is working?",
              detail:
                "JARVIS will disconnect its app-server process. Completion of any agent-launched subprocess is not guaranteed. Stop the turn first when possible.",
              buttons: ["Keep open", "Close"],
              defaultId: 0,
              cancelId: 0,
            });
            if (result.response !== 1) return;
          }
          const rendererSafe = await win.webContents
            .executeJavaScript("!window.__jarvisHasUnsavedChanges", true)
            .catch(() => true);
          if (!rendererSafe) {
            const result = await dialog.showMessageBox(win, {
              type: "warning",
              message: "Discard unsaved editor changes?",
              buttons: ["Keep open", "Discard"],
              defaultId: 0,
              cancelId: 0,
            });
            if (result.response !== 1) return;
          }
          closing = true;
          clearTimeout(saveTimer);
          store.set("window", {
            ...win.getNormalBounds(),
            maximized: win.isMaximized(),
          });
          backend.shutdown();
          await codex.disconnect();
          store.close();
          win.destroy();
          app.quit();
        })();
      });
    })
    .catch((error) => {
      log(String(error));
      dialog.showErrorBox(
        "JARVIS could not start",
        redactDiagnostic(String(error)),
      );
      app.exit(1);
    });
  app.on("window-all-closed", () => app.quit());
}
