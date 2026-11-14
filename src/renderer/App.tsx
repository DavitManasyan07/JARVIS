import { useCallback, useEffect, useRef, useState } from "react";
import {
  FolderOpen,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Settings as SettingsIcon,
  ChevronDown,
  Circle,
  Mic,
  Square,
  Keyboard,
  X,
  ArrowUpRight,
  ShieldCheck,
  WifiOff,
  AudioLines,
  Plus,
  FileText,
  Save,
  FolderPlus,
  History,
  Power,
  Download,
} from "lucide-react";
import { defaults, type Settings as SettingsData } from "../shared";
import {
  api,
  basename,
  permissionLabel,
  type Conversation,
  type Envelope,
  type FileData,
} from "./api";
import Sphere, { type SphereState } from "./Sphere";
import Explorer from "./Explorer";
import Editor, { type EditorTab } from "./Editor";
import Chat, { type ChatItem, type Approval } from "./Chat";
import Settings from "./Settings";
import useAudio from "./useAudio";
export function completedSpeechText(
  reported: ChatItem[] | undefined,
  streamed: ChatItem[],
): string {
  const items = reported?.length ? reported : streamed;
  const replies = items.filter(
    (item) =>
      item.type === "agentMessage" &&
      typeof item.text === "string" &&
      item.text.trim(),
  );
  return (
    (
      replies.findLast((item) => item.phase === "final_answer") ||
      replies.at(-1)
    )?.text || ""
  );
}

function fitPanelWidths(
  requested: { left: number; right: number },
  viewport: number,
  showLeft: boolean,
  showRight: boolean,
) {
  const minima = { left: showLeft ? 180 : 0, right: showRight ? 300 : 0 };
  const desired = {
    left: showLeft ? Math.max(minima.left, requested.left) : 0,
    right: showRight ? Math.max(minima.right, requested.right) : 0,
  };
  const budget = Math.max(
    0,
    viewport - 260 - (Number(showLeft) + Number(showRight)) * 5,
  );
  const extra = {
    left: desired.left - minima.left,
    right: desired.right - minima.right,
  };
  const scale =
    desired.left + desired.right <= budget
      ? 1
      : Math.max(
          0,
          Math.min(
            1,
            (budget - minima.left - minima.right) /
              Math.max(1, extra.left + extra.right),
          ),
        );
  return {
    left: Math.floor(minima.left + extra.left * scale),
    right: Math.floor(minima.right + extra.right * scale),
  };
}
export default function App() {
  const [settings, setSettings] = useState<SettingsData>(defaults),
    [project, setProject] = useState<string | null>(null),
    [recents, setRecents] = useState<string[]>([]),
    [conversations, setConversations] = useState<Conversation[]>([]),
    [activeId, setActiveId] = useState<string | null>(null),
    [codex, setCodex] = useState<any>({ connected: false }),
    [voice, setVoice] = useState<any>({ configured: false }),
    [dataPaths, setDataPaths] = useState<any>({}),
    [booted, setBooted] = useState(false),
    [bootError, setBootError] = useState("");
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const [settingsOpen, setSettingsOpen] = useState(false),
    [menu, setMenu] = useState<"file" | "view" | null>(null),
    [notice, setNotice] = useState<{ text: string; error: boolean } | null>(
      null,
    ),
    [refreshKey, setRefreshKey] = useState(0),
    [tabs, setTabs] = useState<EditorTab[]>([]),
    [activeFile, setActiveFile] = useState(""),
    [saveSignal, setSaveSignal] = useState({ id: 0, as: false }),
    [histories, setHistories] = useState<Record<string, ChatItem[]>>({}),
    [running, setRunning] = useState<Record<string, boolean>>({}),
    [approvals, setApprovals] = useState<Record<string, Approval[]>>({}),
    [widths, setWidths] = useState({
      left: defaults.explorerWidth,
      right: defaults.chatWidth,
    }),
    [historyCursors, setHistoryCursors] = useState<
      Record<string, string | null>
    >({});
  const current = useRef({
      settings,
      project,
      conversations,
      activeId,
      histories,
      codex,
    }),
    pending = useRef<string | null>(null),
    turnMessages = useRef<Record<string, Record<string, ChatItem>>>({}),
    heldPTT = useRef(false),
    noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  current.current = {
    settings,
    project,
    conversations,
    activeId,
    histories,
    codex,
  };
  const showError = useCallback((text: string) => {
    setNotice({ text, error: true });
  }, []);
  const showNotice = useCallback((text: string) => {
    setNotice({ text, error: false });
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 10000);
  }, []);
  const execute = useCallback(
    async (fn: () => Promise<any>) => {
      try {
        return await fn();
      } catch (e) {
        showError((e as Error).message);
        return null;
      }
    },
    [showError],
  );
  const refreshConversations = useCallback(async () => {
    const list = await api<Conversation[]>("conversations.list");
    setConversations(list);
  }, []);
  const update = useCallback(
    async (patch: Partial<SettingsData>) => {
      try {
        const next = await api<SettingsData>("settings.update", { patch });
        setSettings(next);
        setWidths({ left: next.explorerWidth, right: next.chatWidth });
      } catch (e) {
        showError((e as Error).message);
      }
    },
    [showError],
  );
  const openFile = useCallback((file: FileData) => {
    if (!file) return;
    setTabs((old) =>
      old.some((t) => t.path === file.path)
        ? old
        : [
            ...old,
            { ...file, buffer: file.content || "", saved: file.content || "" },
          ],
    );
    setActiveFile(file.path);
  }, []);
  const select = useCallback(
    async (id: string) => {
      const local = current.current.conversations.find((c) => c.id === id);
      if (local?.threadId && !current.current.codex.connected) {
        setActiveId(id);
        void update({ activeConversation: id, showChat: true });
        return;
      }
      const response = await execute(() => api("conversations.open", { id }));
      if (!response) return;
      const conversation = response.conversation;
      const thread = response.thread?.thread || response.thread;
      setHistoryCursors((old) => ({
        ...old,
        [id]: response.thread?.historyCursor || null,
      }));
      setRunning((old) => ({
        ...old,
        [id]: thread?.status?.type === "active",
      }));
      setConversations((old) =>
        old.map((c) => (c.id === id ? conversation : c)),
      );
      setActiveId(id);
      setHistories((old) => ({
        ...old,
        [id]: (thread?.turns || []).flatMap((t: any) => t.items || []),
      }));
      void update({ activeConversation: id, showChat: true });
    },
    [execute, update],
  );
  const loadEarlier = async () => {
    const id = current.current.activeId;
    if (!id || !historyCursors[id]) return;
    const result = await execute(() =>
      api("conversations.history", { id, cursor: historyCursors[id] }),
    );
    if (result) {
      setHistoryCursors((old) => ({
        ...old,
        [id]: result.historyCursor || null,
      }));
      setHistories((old) => ({
        ...old,
        [id]: [
          ...(result.turns || []).flatMap((t: any) => t.items || []),
          ...(old[id] || []),
        ],
      }));
    }
  };
  const newConversation = useCallback(async () => {
    const p = current.current.project;
    if (!p) {
      showNotice("Open a project folder before you start a conversation.");
      return;
    }
    const c = await execute(() =>
      api<Conversation>("conversations.create", { project: p }),
    );
    if (c) {
      setConversations((old) => [c, ...old.filter((x) => x.id !== c.id)]);
      setActiveId(c.id);
      setHistories((old) => ({ ...old, [c.id]: [] }));
      void update({ activeConversation: c.id, showChat: true });
    }
  }, [execute, showNotice, update]);
  const setDraft = useCallback(
    (draft: string) => {
      const id = current.current.activeId;
      if (!id) return;
      setConversations((old) =>
        old.map((c) => (c.id === id ? { ...c, draft } : c)),
      );
      void api("conversations.update", { id, draft }).catch((e) =>
        showError(e.message),
      );
    },
    [showError],
  );
  const send = useCallback(async () => {
    const id = current.current.activeId,
      c = current.current.conversations.find((c) => c.id === id);
    if (!id || !c?.draft.trim() || running[id]) return;
    const text = c.draft;
    pending.current = id;
    setRunning((old) => ({ ...old, [id]: true }));
    setDraft("");
    const optimistic = `pending-${Date.now()}`;
    setHistories((old) => ({
      ...old,
      [id]: [...(old[id] || []), { id: optimistic, type: "userMessage", text }],
    }));
    try {
      const result = await api("chat.send", { id, text });
      setConversations((old) =>
        old.map((c) => (c.id === id ? { ...c, threadId: result.threadId } : c)),
      );
      void refreshConversations();
    } catch (e) {
      setRunning((old) => ({ ...old, [id]: false }));
      setHistories((old) => ({
        ...old,
        [id]: (old[id] || []).filter((i) => i.id !== optimistic),
      }));
      setConversations((old) =>
        old.map((c) => (c.id === id ? { ...c, draft: text } : c)),
      );
      void api("conversations.update", { id, draft: text });
      showError((e as Error).message);
    } finally {
      pending.current = null;
    }
  }, [running, setDraft, refreshConversations, showError]);
  const onTranscript = useCallback(
    (text: string) => {
      if (!current.current.activeId) {
        showNotice(`Transcript: ${text}`);
        return;
      }
      setDraft(text);
      showNotice("Transcript ready. Review it in the message composer.");
      if (current.current.settings.autoSendTranscript)
        setTimeout(() => void send(), 0);
    },
    [setDraft, showNotice, send],
  );
  const audio = useAudio(settings, onTranscript, showError),
    audioRef = useRef(audio);
  audioRef.current = audio;
  const stop = useCallback(async () => {
    audioRef.current.finish(true);
    audioRef.current.stopSpeech();
    const id = current.current.activeId;
    if (!id) return;
    const result = await execute(() => api("chat.stop", { id }));
    if (result) showNotice(result.message || JSON.stringify(result));
  }, [execute, showNotice]);
  const refresh = useCallback(async () => {
    const b = await api("bootstrap");
    setSettings({ ...defaults, ...b.settings });
    setProject(b.project);
    setRecents(b.recents || []);
    setConversations(b.conversations || []);
    setCodex(b.codex || { connected: false });
    setVoice(b.voice || { configured: false });
    setDataPaths(b.dataPaths || {});
    setWidths({
      left: b.settings?.explorerWidth || defaults.explorerWidth,
      right: b.settings?.chatWidth || defaults.chatWidth,
    });
    if (b.startupError) setNotice({ text: b.startupError, error: true });
    return b;
  }, []);
  const boot = useCallback(async () => {
    setBootError("");
    try {
      const b = await refresh();
      setBooted(true);
      if (
        b.settings?.activeConversation &&
        b.conversations?.some(
          (c: Conversation) => c.id === b.settings.activeConversation,
        )
      ) {
        const c = b.conversations.find(
          (c: Conversation) => c.id === b.settings.activeConversation,
        );
        setActiveId(c.id);
        if (!c.threadId || b.codex?.connected) void select(c.id);
      }
    } catch (e) {
      setBootError((e as Error).message);
    }
  }, [refresh, select]);
  const handleAction = useCallback(
    (action: string) => {
      setMenu(null);
      if (action === "settings") {
        setSettingsOpen(true);
        return;
      }
      if (action === "save" || action === "saveAs") {
        setSaveSignal((old) => ({ id: old.id + 1, as: action === "saveAs" }));
        return;
      }
      if (action === "newConversation") {
        void newConversation();
        return;
      }
      if (action === "toggleExplorer") {
        void update({ showExplorer: !current.current.settings.showExplorer });
        return;
      }
      if (action === "toggleChat") {
        void update({ showChat: !current.current.settings.showChat });
        return;
      }
      if (/^(project\.|workspace\.|file\.)/.test(action)) {
        void execute(async () => {
          const result = await api(action);
          if (action === "file.open" && result) openFile(result);
        });
        return;
      }
      const operations: Record<string, string> = {
        openFolder: "project.open",
        openFile: "file.open",
        newProject: "project.new",
        openWorkspace: "workspace.open",
        saveWorkspace: "workspace.save",
        closeProject: "project.close",
        exit: "app.exit",
      };
      if (operations[action])
        void execute(async () => {
          const result = await api(operations[action]);
          if (action === "openFile" && result) openFile(result);
        });
    },
    [execute, newConversation, openFile, update],
  );
  const handleActionRef = useRef(handleAction);
  handleActionRef.current = handleAction;
  useEffect(() => {
    void boot();
    const unsubscribe = window.jarvis.onEvent((event: Envelope) => {
      const p = event.params || {},
        method = event.method;
      if (method === "project") {
        setProject(p.path);
        setRefreshKey((k) => k + 1);
        void api("bootstrap").then((b) => setRecents(b.recents || []));
        return;
      }
      if (method === "filesChanged") {
        setRefreshKey((k) => k + 1);
        return;
      }
      if (method === "menu") {
        handleActionRef.current(p.action);
        return;
      }
      if (method === "connection") {
        setCodex((old: any) => ({ ...old, ...p }));
        return;
      }
      if (method === "conversation.updated") {
        const c = p.conversation || p;
        setConversations((old) =>
          old.some((x) => x.id === c.id)
            ? old.map((x) => (x.id === c.id ? c : x))
            : [c, ...old],
        );
        return;
      }
      if (method === "serverRequest/resolved") {
        setApprovals((old) =>
          Object.fromEntries(
            Object.entries(old).map(([id, list]) => [
              id,
              list.filter((a) => a.id !== p.requestId),
            ]),
          ),
        );
        return;
      }
      if (
        method === "account/updated" ||
        method === "account/login/completed"
      ) {
        void api("codex.status")
          .then(setCodex)
          .catch(() => {});
        return;
      }
      const id =
        p.conversationId ||
        current.current.conversations.find((c) => c.threadId === p.threadId)
          ?.id ||
        pending.current;
      if (!id) return;
      const turnKey = `${id}:${p.turnId || p.turn?.id || ""}`;
      if (method === "approval") {
        setApprovals((old) => ({ ...old, [id]: [...(old[id] || []), p] }));
        return;
      }
      if (method === "turn/started") {
        turnMessages.current[turnKey] = {};
        setRunning((old) => ({ ...old, [id]: true }));
        return;
      }
      if (method === "turn/completed") {
        setRunning((old) => ({ ...old, [id]: false }));
        setApprovals((old) => ({ ...old, [id]: [] }));
        setHistories((old) => ({
          ...old,
          [id]: (old[id] || []).map((i) => ({ ...i, streaming: false })),
        }));
        const error = p.turn?.error;
        if (error) showError(error.message || JSON.stringify(error));
        if (
          current.current.settings.spokenResponses &&
          p.turn?.status === "completed"
        ) {
          const text = completedSpeechText(
            p.turn.items,
            Object.values(turnMessages.current[turnKey] || {}),
          );
          if (text) void audioRef.current.speak(text);
        }
        delete turnMessages.current[turnKey];
        void refreshConversations().catch(() => {});
        return;
      }
      if (method === "error") {
        showError(p.error?.message || p.message || "Codex reported an error.");
        return;
      }
      const item = p.item;
      if ((method === "item/started" || method === "item/completed") && item) {
        if (item.type === "agentMessage") {
          const messages = (turnMessages.current[turnKey] ||= {});
          messages[item.id] = { ...messages[item.id], ...item };
        }
        setHistories((old) => {
          let list = old[id] || [];
          if (item.type === "userMessage")
            list = list.filter((i) => !i.id.startsWith("pending-"));
          const found = list.some((i) => i.id === item.id);
          const next = {
            ...item,
            streaming:
              method === "item/started" && item.type === "agentMessage",
          };
          return {
            ...old,
            [id]: found
              ? list.map((i) => (i.id === item.id ? { ...i, ...next } : i))
              : [...list, next],
          };
        });
        return;
      }
      if (method === "item/agentMessage/delta") {
        const messages = (turnMessages.current[turnKey] ||= {});
        messages[p.itemId] = {
          ...messages[p.itemId],
          id: p.itemId,
          type: "agentMessage",
          text: (messages[p.itemId]?.text || "") + p.delta,
        };
        setHistories((old) => {
          const list = old[id] || [],
            found = list.some((i) => i.id === p.itemId);
          return {
            ...old,
            [id]: found
              ? list.map((i) =>
                  i.id === p.itemId
                    ? { ...i, text: (i.text || "") + p.delta, streaming: true }
                    : i,
                )
              : [
                  ...list,
                  {
                    id: p.itemId,
                    type: "agentMessage",
                    text: p.delta,
                    streaming: true,
                  },
                ],
          };
        });
        return;
      }
      if (method === "item/commandExecution/outputDelta") {
        setHistories((old) => ({
          ...old,
          [id]: (old[id] || []).map((i) =>
            i.id === p.itemId
              ? { ...i, aggregatedOutput: (i.aggregatedOutput || "") + p.delta }
              : i,
          ),
        }));
        return;
      }
      if (method === "turn/diff/updated") {
        setHistories((old) => ({
          ...old,
          [id]: [
            ...(old[id] || []).filter((i) => i.id !== `diff-${p.turnId}`),
            {
              id: `diff-${p.turnId}`,
              type: "fileChange",
              status: "Reported diff",
              changes: [{ path: "Turn changes", diff: p.diff, kind: "update" }],
            },
          ],
        }));
      }
    });
    return unsubscribe;
  }, []);
  useEffect(() => {
    if (
      codex.connected &&
      activeId &&
      !Object.prototype.hasOwnProperty.call(histories, activeId)
    )
      void select(activeId);
  }, [codex.connected, activeId, select]);
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--text-size",
      `${settings.textSize}px`,
    );
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.textSize, settings.theme]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === "Space") {
        e.preventDefault();
        if (!e.repeat && !audioRef.current.recording) {
          heldPTT.current = true;
          void audioRef.current.start();
        }
      }
      if (e.key === "Escape") {
        setMenu(null);
        setSettingsOpen(false);
        if (audioRef.current.recording) audioRef.current.finish(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "o") {
        e.preventDefault();
        handleActionRef.current(e.shiftKey ? "openFile" : "openFolder");
      }
      if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        setSettingsOpen(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space" && heldPTT.current) {
        heldPTT.current = false;
        audioRef.current.finish(false);
      }
    };
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", up);
    };
  }, []);
  useEffect(() => {
    (window as any).__jarvisHasUnsavedChanges = tabs.some(
      (t) => t.saved !== t.buffer,
    );
    const before = (e: BeforeUnloadEvent) => {
      if (tabs.some((t) => t.saved !== t.buffer)) {
        e.preventDefault();
        e.returnValue = "Unsaved changes";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [tabs]);
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const effectiveWidths = fitPanelWidths(
    widths,
    viewportWidth,
    settings.showExplorer,
    settings.showChat,
  );
  const resizeLimit = (side: "left" | "right") =>
    Math.max(
      side === "left" ? 180 : 300,
      Math.min(
        side === "left" ? 600 : 900,
        viewportWidth -
          260 -
          (Number(settings.showExplorer) + Number(settings.showChat)) * 5 -
          effectiveWidths[side === "left" ? "right" : "left"],
      ),
    );
  const resize = (
    side: "left" | "right",
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    const start = event.clientX,
      initial = effectiveWidths[side];
    const baseline = {
      left: settings.showExplorer ? effectiveWidths.left : widths.left,
      right: settings.showChat ? effectiveWidths.right : widths.right,
    };
    setWidths(baseline);
    let value = initial;
    event.currentTarget.setPointerCapture(event.pointerId);
    const target = event.currentTarget;
    const move = (e: PointerEvent) => {
      const min = side === "left" ? 180 : 300,
        max = resizeLimit(side);
      value = Math.max(
        min,
        Math.min(
          max,
          initial + (e.clientX - start) * (side === "left" ? 1 : -1),
        ),
      );
      setWidths({ ...baseline, [side]: value });
    };
    const end = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", end);
      void update({
        explorerWidth: side === "left" ? value : baseline.left,
        chatWidth: side === "right" ? value : baseline.right,
      });
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
  };
  const separator = (side: "left" | "right") => (
    <button
      className="panel-resizer"
      role="separator"
      aria-label={`Resize ${side === "left" ? "explorer" : "conversation"} panel`}
      aria-orientation="vertical"
      aria-valuenow={effectiveWidths[side]}
      aria-valuemin={side === "left" ? 180 : 300}
      aria-valuemax={resizeLimit(side)}
      onPointerDown={(e) => resize(side, e)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          const val = Math.max(
            side === "left" ? 180 : 300,
            Math.min(
              resizeLimit(side),
              effectiveWidths[side] +
                (e.key === "ArrowRight" ? 20 : -20) *
                  (side === "left" ? 1 : -1),
            ),
          );
          void update({
            explorerWidth:
              side === "left"
                ? val
                : settings.showExplorer
                  ? effectiveWidths.left
                  : widths.left,
            chatWidth:
              side === "right"
                ? val
                : settings.showChat
                  ? effectiveWidths.right
                  : widths.right,
          });
        }
      }}
    />
  );
  const active = conversations.find((c) => c.id === activeId) || null,
    isRunning = !!(activeId && running[activeId]),
    inputDevices = audio.devices.filter((d) => d.kind === "audioinput"),
    state: SphereState = audio.recording
      ? "listening"
      : audio.speaking
        ? "speaking"
        : audio.transcribing || isRunning
          ? "processing"
          : codex.error
            ? "error"
            : codex.connected
              ? "idle"
              : "disconnected";
  const stateText = {
    idle: "Ready when you are",
    listening: "Listening to your microphone",
    processing: audio.transcribing
      ? "Transcribing your recording"
      : "Working on your request",
    speaking: "Speaking · AI-generated voice",
    disconnected: "Local workspace ready",
    error: "Connection needs attention",
  }[state];
  if (!booted)
    return (
      <div className="boot-screen">
        <div className="brand-symbol">J</div>
        <h1>JARVIS</h1>
        <p>{bootError || "Opening your workspace…"}</p>
        {bootError && (
          <button className="primary" onClick={() => void boot()}>
            Try again
          </button>
        )}
      </div>
    );
  return (
    <div className="app app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-symbol">J</span>
          <strong>JARVIS</strong>
          <span className="brand-tag">WORKSPACE</span>
        </div>
        <nav className="top-menu" aria-label="Application menu">
          <button
            className={menu === "file" ? "active" : ""}
            onClick={() => setMenu(menu === "file" ? null : "file")}
          >
            File
            <ChevronDown size={10} />
          </button>
          <button
            className={menu === "view" ? "active" : ""}
            onClick={() => setMenu(menu === "view" ? null : "view")}
          >
            View
            <ChevronDown size={10} />
          </button>
          <button onClick={() => setSettingsOpen(true)}>Settings</button>
        </nav>
        <div className="header-project" title={project || "No project open"}>
          <FolderOpen size={13} />
          <span>{project ? basename(project) : "No project open"}</span>
        </div>
        <div className="header-actions">
          <button
            title={settings.showExplorer ? "Hide explorer" : "Show explorer"}
            aria-label={
              settings.showExplorer ? "Hide explorer" : "Show explorer"
            }
            onClick={() =>
              void update({ showExplorer: !settings.showExplorer })
            }
          >
            {settings.showExplorer ? (
              <PanelLeftClose size={17} />
            ) : (
              <PanelLeftOpen size={17} />
            )}
          </button>
          <button
            title={
              settings.showChat ? "Hide conversations" : "Show conversations"
            }
            aria-label={
              settings.showChat ? "Hide conversations" : "Show conversations"
            }
            onClick={() => void update({ showChat: !settings.showChat })}
          >
            {settings.showChat ? (
              <PanelRightClose size={17} />
            ) : (
              <PanelRightOpen size={17} />
            )}
          </button>
          <span
            className={`connection-pill ${codex.connected ? "online" : ""}`}
          >
            <i />
            {codex.connected ? "CODEX CONNECTED" : "LOCAL MODE"}
          </span>
          <button
            title="Settings (Ctrl+,)"
            aria-label="Settings"
            onClick={() => setSettingsOpen(true)}
          >
            <SettingsIcon size={17} />
          </button>
        </div>
      </header>
      {settings.permissionMode === "full" && (
        <div className="full-warning">
          <ShieldCheck size={13} />
          Full access is active. Commands can affect files accessible to your
          user account.
          <button onClick={() => setSettingsOpen(true)}>
            Review permissions
          </button>
        </div>
      )}
      <div
        className="workspace"
        style={{
          gridTemplateColumns: `${settings.showExplorer ? `${effectiveWidths.left}px 5px ` : ""}minmax(260px, 1fr)${settings.showChat ? ` 5px ${effectiveWidths.right}px` : ""}`,
        }}
      >
        {settings.showExplorer && (
          <>
            <Explorer
              project={project}
              hidden={settings.hiddenFiles}
              onHidden={() =>
                void update({ hiddenFiles: !settings.hiddenFiles })
              }
              onOpen={openFile}
              onError={showError}
              refreshKey={refreshKey}
            />
            {separator("left")}
          </>
        )}
        <main className="main-workspace">
          {activeFile ? (
            <Editor
              tabs={tabs}
              active={activeFile}
              onActive={setActiveFile}
              onChange={(path, value) =>
                setTabs((old) =>
                  old.map((t) =>
                    t.path === path ? { ...t, buffer: value } : t,
                  ),
                )
              }
              onClose={(path) => {
                const tab = tabs.find((t) => t.path === path);
                if (
                  tab &&
                  tab.buffer !== tab.saved &&
                  !window.confirm("Discard unsaved changes in this file?")
                )
                  return;
                setTabs((old) => old.filter((t) => t.path !== path));
                if (activeFile === path)
                  setActiveFile(tabs.find((t) => t.path !== path)?.path || "");
              }}
              onSaved={(oldPath, newPath, content) => {
                setTabs((old) =>
                  old.map((t) =>
                    t.path === oldPath
                      ? { ...t, path: newPath, buffer: content, saved: content }
                      : t,
                  ),
                );
                if (activeFile === oldPath) setActiveFile(newPath);
              }}
              onError={showError}
              saveSignal={saveSignal}
            />
          ) : (
            <>
              <div className="workspace-eyebrow">
                <span>YOUR PERSONAL ASSISTANT</span>
                <span className="workspace-number">01 / WORKSPACE</span>
              </div>
              <div className="visualization-area">
                <div className="visualization-title">
                  <h1>Intelligence, at your command.</h1>
                  <p>Your projects. Your conversations. One workspace.</p>
                </div>
                <Sphere
                  state={audio.fixture ? "speaking" : state}
                  level={audio.recording ? audio.inputLevel : audio.outputLevel}
                  reduced={
                    settings.reducedMotion ||
                    window.matchMedia("(prefers-reduced-motion: reduce)")
                      .matches
                  }
                  quality={settings.animationQuality}
                  fixture={audio.fixture}
                />
                <div className={`sphere-status ${state}`}>
                  <i />
                  {audio.fixture
                    ? "VISUALIZATION TEST · GENERATED SIGNAL"
                    : stateText}
                </div>
                <div className="voice-controls">
                  <div
                    className={`waveform ${audio.recording ? "recording" : ""}`}
                    role="img"
                    aria-label={
                      audio.recording
                        ? "Live microphone waveform"
                        : "Microphone inactive"
                    }
                  >
                    {[...audio.bars.slice().reverse(), ...audio.bars].map(
                      (v, i) => (
                        <i
                          key={i}
                          style={{
                            height: `${audio.recording ? Math.max(2, v * 42) : 2}px`,
                            opacity: audio.recording ? 0.5 + v * 0.5 : 0.24,
                          }}
                        />
                      ),
                    )}
                  </div>
                  <button
                    className={`mic-button ${audio.recording ? "recording" : ""}`}
                    aria-label={
                      audio.recording
                        ? "Finish recording"
                        : "Start microphone recording"
                    }
                    title={
                      audio.recording
                        ? "Finish and transcribe recording"
                        : "Record · hold Ctrl+Space to push to talk"
                    }
                    disabled={!inputDevices.length || audio.transcribing}
                    onClick={() =>
                      audio.recording ? audio.finish(false) : void audio.start()
                    }
                  >
                    {audio.recording ? <Square size={17} /> : <Mic size={19} />}
                  </button>
                  {audio.recording && (
                    <button
                      className="cancel-recording"
                      title="Cancel recording"
                      aria-label="Cancel recording"
                      onClick={() => audio.finish(true)}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
                <div className="audio-caption">
                  {audio.recording
                    ? "Recording · microphone active"
                    : audio.transcribing
                      ? "Transcribing…"
                      : inputDevices.length
                        ? "Microphone off · Ctrl+Space to talk"
                        : "No microphone available · text chat is ready"}
                  {audio.speaking && (
                    <button onClick={audio.stopSpeech}>Stop speech</button>
                  )}
                  {audio.fixture && (
                    <button onClick={audio.stopSpeech}>Stop test</button>
                  )}
                </div>
                <div className="workspace-quick-actions">
                  <button onClick={() => handleAction("openFolder")}>
                    <FolderOpen size={15} />
                    <span>Open a project</span>
                    <ArrowUpRight size={12} />
                  </button>
                  <button
                    disabled={!project}
                    onClick={() => void newConversation()}
                  >
                    <Plus size={15} />
                    <span>Start a conversation</span>
                    <ArrowUpRight size={12} />
                  </button>
                </div>
                {tabs.length > 0 && (
                  <div className="open-file-links">
                    {tabs.map((t) => (
                      <button
                        key={t.path}
                        onClick={() => setActiveFile(t.path)}
                      >
                        <FileText size={12} />
                        {basename(t.path)}
                        {t.buffer !== t.saved ? " ●" : ""}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="workspace-bottom-note">
                <Keyboard size={12} />
                <span>Text comes first. Voice is there when you need it.</span>
              </div>
            </>
          )}
        </main>
        {settings.showChat && (
          <>
            {separator("right")}
            <Chat
              hasEarlier={!!(activeId && historyCursors[activeId])}
              onLoadEarlier={() => void loadEarlier()}
              conversations={conversations}
              active={active}
              items={activeId ? histories[activeId] || [] : []}
              draft={active?.draft || ""}
              running={isRunning}
              approvals={activeId ? approvals[activeId] || [] : []}
              settings={settings}
              codex={codex}
              project={project}
              onSelect={(id) => void select(id)}
              onNew={() => void newConversation()}
              onDraft={setDraft}
              onSend={() => void send()}
              onStop={() => void stop()}
              onBack={() => {
                setActiveId(null);
                void update({ activeConversation: null });
              }}
              onReload={() => void refreshConversations()}
              onOpen={openFile}
              onError={showError}
              onResolved={(id) => {
                if (activeId)
                  setApprovals((old) => ({
                    ...old,
                    [activeId]: (old[activeId] || []).filter(
                      (a) => a.id !== id,
                    ),
                  }));
              }}
              onSpeak={(text) => void audio.speak(text)}
            />
          </>
        )}
      </div>
      <footer className="status-bar">
        <span className="status-project" title={project || "No project"}>
          <FolderOpen size={12} />
          {project || "No project open"}
        </span>
        <span>
          <ShieldCheck size={12} />
          {permissionLabel(settings.permissionMode)}
        </span>
        <span>
          <AudioLines size={12} />
          {audio.recording
            ? "Recording"
            : inputDevices.length
              ? "Microphone off"
              : "No microphone"}
        </span>
        <span className="status-right">
          {codex.connected ? (
            <Circle size={7} fill="currentColor" />
          ) : (
            <WifiOff size={11} />
          )}
          <span>
            {codex.connected
              ? "Codex app server"
              : "Offline features available"}
          </span>
        </span>
      </footer>
      {notice && (
        <div
          className={`toast ${notice.error ? "error" : ""}`}
          role={notice.error ? "alert" : "status"}
        >
          <span>{notice.text}</span>
          <button
            aria-label="Dismiss message"
            title="Dismiss message"
            onClick={() => setNotice(null)}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {menu && (
        <>
          <div className="menu-dismiss" onClick={() => setMenu(null)} />
          <div
            className={`context-menu top-dropdown ${menu === "view" ? "view-dropdown" : ""}`}
            role="menu"
          >
            {menu === "file" ? (
              <>
                <button onClick={() => handleAction("newProject")}>
                  <FolderPlus size={14} />
                  New project / folder…
                </button>
                <button onClick={() => handleAction("openFolder")}>
                  <FolderOpen size={14} />
                  Open folder…<kbd>Ctrl+O</kbd>
                </button>
                <button onClick={() => handleAction("openFile")}>
                  <FileText size={14} />
                  Open file…<kbd>Ctrl+Shift+O</kbd>
                </button>
                <hr />
                <button onClick={() => handleAction("openWorkspace")}>
                  Open workspace…
                </button>
                <button
                  onClick={() => handleAction("saveWorkspace")}
                  disabled={!project}
                >
                  Save workspace…
                </button>
                <details className="recent-menu">
                  <summary>
                    <History size={14} />
                    Open recent
                  </summary>
                  {recents.length ? (
                    recents.map((p) => (
                      <button
                        key={p}
                        title={p}
                        onClick={() => {
                          setMenu(null);
                          void execute(() => api("project.open", { path: p }));
                        }}
                      >
                        {basename(p)}
                        <small>{p}</small>
                      </button>
                    ))
                  ) : (
                    <span>No recent projects</span>
                  )}
                </details>
                <hr />
                <button
                  onClick={() => handleAction("save")}
                  disabled={!activeFile}
                >
                  <Save size={14} />
                  Save<kbd>Ctrl+S</kbd>
                </button>
                <button
                  onClick={() => handleAction("saveAs")}
                  disabled={!activeFile}
                >
                  Save as…
                </button>
                <button
                  onClick={() => handleAction("closeProject")}
                  disabled={!project}
                >
                  Close project
                </button>
                <hr />
                <button onClick={() => handleAction("exit")}>
                  <Power size={14} />
                  Exit
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    setMenu(null);
                    void update({ showExplorer: !settings.showExplorer });
                  }}
                >
                  {settings.showExplorer ? "Hide" : "Show"} explorer
                </button>
                <button
                  onClick={() => {
                    setMenu(null);
                    void update({ showChat: !settings.showChat });
                  }}
                >
                  {settings.showChat ? "Hide" : "Show"} conversations
                </button>
                <button
                  onClick={() => {
                    setActiveFile("");
                    setMenu(null);
                  }}
                >
                  Show visualization
                </button>
                <hr />
                <button
                  onClick={() => {
                    setMenu(null);
                    void update({ reducedMotion: !settings.reducedMotion });
                  }}
                >
                  {settings.reducedMotion ? "Enable" : "Reduce"} animation
                </button>
              </>
            )}
          </div>
        </>
      )}
      {settingsOpen && (
        <Settings
          settings={settings}
          update={update}
          codex={codex}
          voice={voice}
          audio={audio}
          dataPaths={dataPaths}
          close={() => setSettingsOpen(false)}
          refresh={async () => {
            await refresh();
          }}
          onError={showError}
        />
      )}
    </div>
  );
}
