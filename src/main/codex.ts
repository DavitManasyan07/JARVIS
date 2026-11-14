import { EventEmitter } from "node:events";
import {
  spawn,
  execFile,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { createInterface, type Interface } from "node:readline";
import { resolve, isAbsolute, join } from "node:path";
import { mkdirSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import type { ThreadStartParams } from "../protocol/v2/ThreadStartParams";
import type { ThreadResumeParams } from "../protocol/v2/ThreadResumeParams";
import type { TurnStartParams } from "../protocol/v2/TurnStartParams";
import type { SandboxPolicy } from "../protocol/v2/SandboxPolicy";
import type { Thread } from "../protocol/v2/Thread";

export type PermissionMode = "read-only" | "workspace-write" | "full";
export type CodexStatus = {
  connected: boolean;
  version: string;
  account: unknown;
  models: unknown[];
  requiresOpenaiAuth?: boolean;
  error?: string;
  diagnostics?: string[];
};
type Wire = Record<string, any>;
type Pending = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  method: string;
};
type EngineOptions = {
  spawnArgs?: string[];
  cwd?: string;
  requestTimeoutMs?: number;
  version?: string;
  env?: NodeJS.ProcessEnv;
};
const approvalMethods = new Set([
  "item/commandExecution/requestApproval",
  "item/fileChange/requestApproval",
  "item/permissions/requestApproval",
  "item/tool/requestUserInput",
  "mcpServer/elicitation/request",
  "execCommandApproval",
  "applyPatchApproval",
]);

/** Protocol diagnostics never share stdout, and never contain bearer credentials. */
export function redactDiagnostic(text: string): string {
  return text
    .replace(/\b(?:sk-[\w-]+|eyJ[\w-]+\.[\w-]+\.[\w-]+)\b/g, "[redacted]")
    .replace(/(authorization\s*[:=]\s*|bearer\s+)[^\s,}]+/gi, "$1[redacted]")
    .replace(
      /((?:api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password)\s*["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi,
      "$1[redacted]",
    )
    .slice(0, 1800);
}

export function sandboxFor(mode: PermissionMode, cwd: string): SandboxPolicy {
  if (!isAbsolute(cwd))
    throw new Error("The working directory must be an absolute path.");
  if (mode === "read-only") return { type: "readOnly", networkAccess: false };
  if (mode === "workspace-write")
    return {
      type: "workspaceWrite",
      writableRoots: [resolve(cwd)],
      networkAccess: false,
      excludeTmpdirEnvVar: true,
      excludeSlashTmp: true,
    };
  if (mode === "full") return { type: "dangerFullAccess" };
  throw new Error("Unsupported permission mode.");
}

/** Managed local stdio app-server. This object must stay in Electron's main process. */
export class CodexEngine extends EventEmitter {
  private child?: ChildProcessWithoutNullStreams;
  private lines?: Interface;
  private nextId = 1;
  private pending = new Map<string | number, Pending>();
  private approvals = new Map<string | number, Wire>();
  private activeTurns = new Map<string, string>();
  private completedTurns = new Set<string>();
  private startingTurns = new Set<string>();
  private bindings = new Map<string, string>();
  private connecting?: Promise<CodexStatus>;
  private disposed = false;
  readonly diagnostics: string[] = [];
  status: CodexStatus = {
    connected: false,
    version: "Not checked",
    account: null,
    models: [],
  };

  constructor(
    readonly runtime = process.env.JARVIS_CODEX_RUNTIME || "codex",
    private readonly options: EngineOptions = {},
  ) {
    super();
  }

  private diagnostic(line: string) {
    const clean = redactDiagnostic(line.trim());
    if (!clean) return;
    this.diagnostics.push(clean);
    if (this.diagnostics.length > 40) this.diagnostics.shift();
    this.emit("diagnostic", clean);
  }

  private publishStatus() {
    this.status.diagnostics = [...this.diagnostics];
    this.emit("event", { method: "connection", params: { ...this.status } });
  }

  async connect(): Promise<CodexStatus> {
    if (this.status.connected && this.child) return this.status;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      if (this.child) await this.disconnect();
      return this.initialize();
    })();
    try {
      return await this.connecting;
    } finally {
      this.connecting = undefined;
    }
  }

  private async initialize(): Promise<CodexStatus> {
    this.disposed = false;
    try {
      const version =
        this.options.version ??
        (await new Promise<string>((done, fail) => {
          execFile(
            this.runtime,
            ["--version"],
            { timeout: 5000, maxBuffer: 65536 },
            (err, stdout) => (err ? fail(err) : done(stdout.trim())),
          );
        }));
      this.status = { connected: false, version, account: null, models: [] };
      const stateHome = process.env.XDG_STATE_HOME;
      const startupCwd =
        this.options.cwd ||
        join(
          stateHome && isAbsolute(stateHome)
            ? stateHome
            : join(homedir(), ".local", "state"),
          "jarvis",
          "codex-runtime",
        );
      mkdirSync(startupCwd, { recursive: true, mode: 0o700 });
      chmodSync(startupCwd, 0o700);
      const child = spawn(
        this.runtime,
        this.options.spawnArgs ?? [
          "app-server",
          "--listen",
          "stdio://",
          "-c",
          'sandbox_mode="workspace-write"',
          "-c",
          'approval_policy="on-request"',
          "-c",
          'approvals_reviewer="user"',
        ],
        {
          cwd: startupCwd,
          env: this.options.env ?? process.env,
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true,
        },
      );
      this.child = child;
      this.lines = createInterface({
        input: child.stdout,
        crlfDelay: Infinity,
      });
      this.lines.on("line", (line) => {
        if (line.length > 16 * 1024 * 1024) {
          this.transportFailed("Codex sent an oversized protocol message.");
          child.kill("SIGTERM");
          return;
        }
        this.receive(line);
      });
      let stderrBuffer = "";
      child.stderr.on("data", (chunk: Buffer) => {
        stderrBuffer += chunk.toString();
        const parts = stderrBuffer.split("\n");
        stderrBuffer = parts.pop() || "";
        for (const line of parts) this.diagnostic(line);
        if (stderrBuffer.length > 65536) {
          stderrBuffer = "";
          this.diagnostic("Oversized Codex diagnostic line omitted.");
        }
      });
      child.stdin.on("error", (err) =>
        this.transportFailed(`Codex input failed: ${err.message}`),
      );
      child.on("error", (err) =>
        this.transportFailed(`Cannot start Codex: ${err.message}`),
      );
      child.on("exit", (code, signal) => {
        if (this.child !== child) return;
        this.child = undefined;
        this.lines?.close();
        this.lines = undefined;
        this.transportFailed(
          this.disposed
            ? "Codex disconnected."
            : `Codex process exited (${signal || code}). Reconnect explicitly; no task is repeated.`,
        );
      });
      await this.request("initialize", {
        clientInfo: {
          name: "jarvis_desktop",
          title: "JARVIS",
          version: "1.0.0",
        },
        capabilities: { experimentalApi: false },
      });
      this.write({ method: "initialized", params: {} });
      this.status.connected = true;
      const [account, models] = await Promise.allSettled([
        this.request("account/read", { refreshToken: false }),
        this.request("model/list", { limit: 100 }),
      ]);
      if (account.status === "fulfilled") {
        this.status.account = account.value.account;
        this.status.requiresOpenaiAuth = account.value.requiresOpenaiAuth;
      } else this.diagnostic(`Account check: ${account.reason.message}`);
      if (models.status === "fulfilled")
        this.status.models = models.value.data || [];
      else this.diagnostic(`Model discovery: ${models.reason.message}`);
      this.publishStatus();
      return this.status;
    } catch (error) {
      this.status.connected = false;
      this.status.error = redactDiagnostic(
        error instanceof Error ? error.message : String(error),
      );
      const child = this.child;
      this.child = undefined;
      child?.kill("SIGTERM");
      this.lines?.close();
      this.lines = undefined;
      this.rejectPending(new Error(this.status.error));
      this.publishStatus();
      return this.status;
    }
  }

  private write(message: Wire) {
    if (!this.child || this.child.killed || !this.child.stdin.writable)
      throw new Error("Codex is disconnected. Use Reconnect.");
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  /** Internal backend escape hatch; never expose this method across the preload bridge. */
  request<T = any>(method: string, params: any = {}): Promise<T> {
    return new Promise<T>((done, fail) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        fail(
          new Error(
            `${method} timed out. Its result is unknown. Reconnect or inspect history before retrying; JARVIS did not repeat it.`,
          ),
        );
      }, this.options.requestTimeoutMs ?? 30000);
      this.pending.set(id, { resolve: done, reject: fail, timer, method });
      try {
        this.write({ id, method, params });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        fail(error);
      }
    });
  }

  private receive(line: string) {
    let message: Wire;
    try {
      message = JSON.parse(line);
    } catch {
      this.diagnostic("Ignored non-JSON protocol output.");
      return;
    }
    if (!message || typeof message !== "object" || Array.isArray(message))
      return;
    if (
      message.id !== undefined &&
      typeof message.id !== "number" &&
      typeof message.id !== "string"
    ) {
      this.diagnostic("Ignored invalid protocol request id.");
      return;
    }
    if (message.id !== undefined && typeof message.method !== "string") {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error)
        pending.reject(
          new Error(
            redactDiagnostic(
              `${pending.method}: ${message.error.message || "Protocol error"} (${message.error.code ?? "unknown"})`,
            ),
          ),
        );
      else pending.resolve(message.result);
      return;
    }
    if (typeof message.method !== "string") return;
    const params =
      message.params && typeof message.params === "object"
        ? message.params
        : {};
    if (message.id !== undefined) {
      if (!approvalMethods.has(message.method)) {
        this.write({
          id: message.id,
          error: {
            code: -32601,
            message: "This JARVIS client does not support this server request.",
          },
        });
        this.diagnostic(`Unsupported server request: ${message.method}`);
        return;
      }
      this.approvals.set(message.id, { method: message.method, params });
      this.emit("event", {
        method: "approval",
        params: { id: message.id, method: message.method, params },
      });
      return;
    }
    if (message.method === "turn/started" && params.threadId && params.turn?.id)
      this.activeTurns.set(params.threadId, params.turn.id);
    if (message.method === "turn/completed" && params.turn?.id) {
      if (this.activeTurns.get(params.threadId) === params.turn.id)
        this.activeTurns.delete(params.threadId);
      this.completedTurns.add(params.turn.id);
      if (this.completedTurns.size > 500)
        this.completedTurns.delete(this.completedTurns.values().next().value!);
      this.emit(`turn:${params.turn.id}`, params.turn);
    }
    if (message.method === "serverRequest/resolved")
      this.approvals.delete(params.requestId);
    if (
      message.method === "account/updated" ||
      message.method === "account/login/completed"
    ) {
      // Refresh metadata after a user-driven login. This is a read, never a task retry.
      void this.request("account/read", { refreshToken: false })
        .then((result) => {
          this.status.account = result.account;
          this.status.requiresOpenaiAuth = result.requiresOpenaiAuth;
          this.publishStatus();
        })
        .catch((err) => this.diagnostic(err.message));
    }
    this.emit("event", { method: message.method, params });
  }

  private rejectPending(error: Error) {
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(error);
    }
    this.pending.clear();
  }

  private transportFailed(message: string) {
    this.rejectPending(new Error(message));
    this.approvals.clear();
    // Do not report active turns stopped merely because the transport closed.
    this.status.connected = false;
    this.status.error = redactDiagnostic(message);
    this.publishStatus();
  }

  private ensureConnected() {
    if (!this.status.connected)
      throw new Error(
        "Codex is disconnected. Open Settings → Codex and connect.",
      );
  }
  private directory(cwd: string) {
    if (!isAbsolute(cwd)) throw new Error("Use an absolute project path.");
    return resolve(cwd);
  }
  private checkBinding(id: string, cwd: string) {
    const bound = this.bindings.get(id);
    if (bound && bound !== this.directory(cwd))
      throw new Error(
        "This conversation belongs to a different project. Its working directory cannot change.",
      );
  }
  private checkPolicy(response: Wire, mode: PermissionMode, cwd: string) {
    const expected = sandboxFor(mode, cwd).type;
    if (
      response.sandbox?.type !== expected ||
      response.approvalPolicy !== "on-request" ||
      response.approvalsReviewer !== "user"
    ) {
      throw new Error(
        "Codex did not apply the requested permissions. JARVIS will not send a task with a weaker policy.",
      );
    }
    if (resolve(response.cwd) !== resolve(cwd))
      throw new Error("Codex returned a different working directory.");
  }

  async startThread(
    cwd: string,
    mode: PermissionMode,
    model?: string,
  ): Promise<any> {
    this.ensureConnected();
    cwd = this.directory(cwd);
    sandboxFor(mode, cwd);
    const params: ThreadStartParams = {
      cwd,
      sandbox: mode === "full" ? "danger-full-access" : mode,
      approvalPolicy: "on-request",
      approvalsReviewer: "user",
      ...(model ? { model } : {}),
    };
    const response = await this.request("thread/start", params);
    this.checkPolicy(response, mode, cwd);
    this.bindings.set(response.thread.id, cwd);
    return response;
  }

  async resumeThread(
    id: string,
    cwd: string,
    mode: PermissionMode,
    model?: string,
  ): Promise<any> {
    this.ensureConnected();
    this.checkBinding(id, cwd);
    const metadata = await this.request("thread/read", {
      threadId: id,
      includeTurns: false,
    });
    if (resolve(metadata.thread.cwd) !== this.directory(cwd))
      throw new Error(
        "The saved Codex conversation belongs to a different working directory.",
      );
    const params: ThreadResumeParams = {
      threadId: id,
      cwd,
      sandbox: mode === "full" ? "danger-full-access" : mode,
      approvalPolicy: "on-request",
      approvalsReviewer: "user",
      excludeTurns: true,
      ...(model ? { model } : {}),
    };
    const response = await this.request("thread/resume", params);
    this.checkPolicy(response, mode, cwd);
    this.bindings.set(id, this.directory(cwd));
    // Bounded history page keeps long conversations usable. Older pages remain in Codex.
    const page = await this.request("thread/turns/list", {
      threadId: id,
      limit: 30,
      sortDirection: "desc",
      itemsView: "full",
    });
    response.thread.turns = [...page.data].reverse();
    const liveTurn = response.thread.turns.findLast(
      (turn: any) => turn.status === "inProgress",
    );
    if (response.thread.status?.type === "active" && liveTurn)
      this.activeTurns.set(id, liveTurn.id);
    else this.activeTurns.delete(id);
    response.historyCursor = page.nextCursor;
    return response;
  }

  async send(
    threadId: string,
    text: string,
    cwd: string,
    mode: PermissionMode,
    model?: string,
  ): Promise<any> {
    this.ensureConnected();
    this.checkBinding(threadId, cwd);
    if (!this.bindings.has(threadId))
      throw new Error("Resume this conversation before sending a message.");
    if (!text.trim() || text.length > 1000000)
      throw new Error("Enter a message of at most 1,000,000 characters.");
    if (this.activeTurns.has(threadId) || this.startingTurns.has(threadId))
      throw new Error(
        "This conversation already has an active turn. Stop it or wait for completion.",
      );
    const params: TurnStartParams = {
      threadId,
      input: [{ type: "text", text, text_elements: [] }],
      cwd,
      approvalPolicy: "on-request",
      approvalsReviewer: "user",
      sandboxPolicy: sandboxFor(mode, cwd),
      ...(model ? { model } : {}),
    };
    this.startingTurns.add(threadId);
    try {
      const result = await this.request("turn/start", params);
      if (result.turn?.id && !this.completedTurns.has(result.turn.id))
        this.activeTurns.set(threadId, result.turn.id);
      return result;
    } finally {
      this.startingTurns.delete(threadId);
    }
  }

  async readThread(id: string): Promise<any> {
    this.ensureConnected();
    const result = await this.request<{ thread: Thread }>("thread/read", {
      threadId: id,
      includeTurns: false,
    });
    const page = await this.request("thread/turns/list", {
      threadId: id,
      limit: 30,
      sortDirection: "desc",
      itemsView: "full",
    });
    result.thread.turns = [...page.data].reverse();
    return { ...result, historyCursor: page.nextCursor };
  }

  async history(id: string, cursor: string): Promise<any> {
    this.ensureConnected();
    const result = await this.request("thread/turns/list", {
      threadId: id,
      cursor,
      limit: 30,
      sortDirection: "desc",
      itemsView: "full",
    });
    return {
      turns: [...result.data].reverse(),
      historyCursor: result.nextCursor,
    };
  }

  async stop(threadId: string): Promise<any> {
    this.ensureConnected();
    const turnId = this.activeTurns.get(threadId);
    if (!turnId)
      return {
        requested: false,
        interrupted: false,
        subprocessTerminationConfirmed: false,
        message:
          "No active turn is known. No subprocess termination was confirmed.",
      };
    let completed: any;
    const listener = (turn: any) => {
      completed = turn;
    };
    this.on(`turn:${turnId}`, listener);
    try {
      await this.request("turn/interrupt", { threadId, turnId });
      if (!completed)
        await new Promise<void>((done) => {
          const timer = setTimeout(() => {
            this.removeListener(`turn:${turnId}`, finished);
            done();
          }, 5000);
          const finished = () => {
            clearTimeout(timer);
            done();
          };
          this.once(`turn:${turnId}`, finished);
        });
      return {
        requested: true,
        turnId,
        interrupted: completed?.status === "interrupted",
        status: completed?.status ?? "awaiting-confirmation",
        subprocessTerminationConfirmed: false,
        message:
          completed?.status === "interrupted"
            ? "Codex confirmed the turn was interrupted. Background subprocess termination is not confirmed."
            : "Interrupt requested. Waiting for Codex completion; subprocess termination is not confirmed.",
      };
    } finally {
      this.removeListener(`turn:${turnId}`, listener);
    }
  }

  async archive(id: string) {
    this.ensureConnected();
    return this.request("thread/archive", { threadId: id });
  }
  async unarchive(id: string) {
    this.ensureConnected();
    return this.request("thread/unarchive", { threadId: id });
  }
  async rename(id: string, title: string) {
    this.ensureConnected();
    return this.request("thread/name/set", {
      threadId: id,
      name: title.slice(0, 200),
    });
  }
  async login() {
    this.ensureConnected();
    return this.request("account/login/start", { type: "chatgpt" });
  }

  respond(id: string | number, result: any) {
    const approval = this.approvals.get(id);
    if (!approval)
      throw new Error("This approval request is no longer pending.");
    if (!result || typeof result !== "object" || Array.isArray(result))
      throw new Error("Invalid approval response.");
    if (
      /requestApproval$|Approval$/.test(approval.method) &&
      approval.method !== "item/permissions/requestApproval"
    ) {
      const valid = [
        "accept",
        "acceptForSession",
        "decline",
        "cancel",
        "approved",
        "approved_for_session",
        "denied",
        "abort",
      ];
      if (!valid.includes(result.decision))
        throw new Error("Unsupported approval decision.");
    } else if (approval.method === "item/permissions/requestApproval") {
      // Restricted modes never acquire new filesystem/network grants through this UI.
      if (JSON.stringify(result.permissions ?? {}) !== "{}")
        throw new Error(
          "Change permission mode explicitly in Settings; this UI only declines additional grants.",
        );
      result = { permissions: {}, scope: "turn" };
    } else if (approval.method === "mcpServer/elicitation/request") {
      if (!["accept", "decline", "cancel"].includes(result.action))
        throw new Error("Invalid elicitation action.");
    } else if (
      approval.method === "item/tool/requestUserInput" &&
      (!result.answers || typeof result.answers !== "object")
    )
      throw new Error("Answers are required.");
    this.write({ id, result });
    this.approvals.delete(id);
  }

  async disconnect(): Promise<void> {
    this.disposed = true;
    const child = this.child;
    if (!child) {
      this.status.connected = false;
      return;
    }
    await new Promise<void>((done) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
      }, 2500);
      const deadline = setTimeout(done, 4000);
      child.once("exit", () => {
        clearTimeout(timer);
        clearTimeout(deadline);
        done();
      });
      child.kill("SIGTERM");
    });
    this.child = undefined;
    this.lines?.close();
    this.lines = undefined;
    this.rejectPending(new Error("Codex disconnected."));
    this.activeTurns.clear();
    this.startingTurns.clear();
    this.bindings.clear();
    this.status.connected = false;
  }
}
