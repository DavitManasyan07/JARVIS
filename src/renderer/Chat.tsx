import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft,
  Plus,
  Search,
  MoreHorizontal,
  MessageSquare,
  Send,
  Square,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Terminal,
  FileDiff,
  ArrowDown,
  ShieldAlert,
  Download,
  Archive,
  Trash2,
  Pencil,
  Folder,
  AudioLines,
} from "lucide-react";
import {
  api,
  basename,
  permissionLabel,
  type Conversation,
  type FileData,
  type Settings,
} from "./api";
export type ChatItem = { id: string; type: string; [key: string]: any };
export type Approval = { id: string | number; method: string; params: any };
function CopyButton({ text }: { text: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <button
      className="copy-button"
      title={
        status === "failed"
          ? "Copy failed"
          : status === "copied"
            ? "Copied"
            : "Copy text"
      }
      aria-label={status === "failed" ? "Copy failed" : "Copy text"}
      onClick={() => {
        void api("clipboard.writeText", { text })
          .then(() => {
            setStatus("copied");
            setTimeout(() => setStatus("idle"), 1500);
          })
          .catch(() => {
            setStatus("failed");
            setTimeout(() => setStatus("idle"), 2500);
          });
      }}
    >
      {status === "copied" ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}
export function MessageMarkdown({ text }: { text: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      skipHtml
      components={{
        pre: ({ children }) => {
          const element = Array.isArray(children) ? children[0] : children,
            props = (element as any)?.props || {},
            code = String(props.children || "").replace(/\n$/, "");
          return (
            <pre className="message-code">
              <span className="code-language">
                {props.className?.replace("language-", "") || "code"}
              </span>
              <CopyButton text={code} />
              {children}
            </pre>
          );
        },
        code: ({ children, className }) => (
          <code className={className}>{children}</code>
        ),
        a: ({ children, href }) => (
          <a
            href={href}
            onClick={(e) => {
              e.preventDefault();
              if (href && /^https:\/\//i.test(href))
                void api("external.open", { url: href }).catch(() => {});
            }}
            rel="noreferrer"
          >
            {children}
          </a>
        ),
        img: ({ alt }) => (
          <span className="muted">
            [Image: {alt || "remote image omitted"}]
          </span>
        ),
      }}
    >
      {text}
    </Markdown>
  );
}
function Activity({
  item,
  onOpen,
  onError,
}: {
  item: ChatItem;
  onOpen(f: FileData): void;
  onError(t: string): void;
}) {
  const [open, setOpen] = useState(false),
    isCommand = item.type === "commandExecution",
    isFile = item.type === "fileChange";
  const title = isCommand
    ? item.command
    : isFile
      ? `${item.changes?.length || 0} file change${item.changes?.length === 1 ? "" : "s"}`
      : item.type === "mcpToolCall"
        ? `${item.server} · ${item.tool}`
        : item.type === "reasoning"
          ? "Task reasoning"
          : item.type === "plan"
            ? "Plan"
            : item.type === "imageView"
              ? `Viewed ${basename(item.path || "image")}`
              : item.tool || item.type;
  return (
    <div className="activity">
      <button
        className="activity-heading"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}{" "}
        {isCommand ? (
          <Terminal size={13} />
        ) : isFile ? (
          <FileDiff size={13} />
        ) : (
          <span className="activity-dot" />
        )}
        <span title={title}>{title}</span>
        <small>
          {item.status || ""}
          {typeof item.exitCode === "number" ? ` · exit ${item.exitCode}` : ""}
        </small>
      </button>
      {open && (
        <div className="activity-body">
          {isCommand ? (
            <>
              <small className="wrap">{item.cwd}</small>
              <pre>{item.aggregatedOutput || "No output reported."}</pre>
            </>
          ) : isFile ? (
            <>
              {(item.changes || []).map((c: any, i: number) => (
                <details key={i} open>
                  <summary>
                    {c.path} ·{" "}
                    {typeof c.kind === "string"
                      ? c.kind
                      : c.kind?.type || "change"}
                  </summary>
                  {c.diff && (
                    <pre className="diff">
                      {String(c.diff)
                        .split("\n")
                        .map((line, j) => (
                          <span
                            key={j}
                            className={
                              line.startsWith("+")
                                ? "added"
                                : line.startsWith("-")
                                  ? "removed"
                                  : ""
                            }
                          >
                            {line}
                            {"\n"}
                          </span>
                        ))}
                    </pre>
                  )}
                  <button
                    className="text-button"
                    onClick={() =>
                      void api<FileData>("fs.read", { path: c.path })
                        .then(onOpen)
                        .catch((e) => onError(e.message))
                    }
                  >
                    Open file
                  </button>
                </details>
              ))}
            </>
          ) : item.type === "reasoning" ? (
            <p>
              {(item.summary || []).join("\n") || "No public summary reported."}
            </p>
          ) : item.type === "plan" ? (
            <MessageMarkdown text={item.text || ""} />
          ) : item.type === "imageView" ? (
            <button
              onClick={() =>
                void api<FileData>("fs.read", { path: item.path })
                  .then(onOpen)
                  .catch((e) => onError(e.message))
              }
            >
              Preview image
            </button>
          ) : (
            <pre>
              {JSON.stringify(
                item.result || item.error || item.contentItems || item,
                null,
                2,
              ).slice(0, 20000)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
function ApprovalCard({
  approval,
  onError,
  onResolved,
}: {
  approval: Approval;
  onError(t: string): void;
  onResolved(id: string | number): void;
}) {
  const [busy, setBusy] = useState(false),
    [answers, setAnswers] = useState<Record<string, string>>({}),
    p = approval.params,
    questions = p.questions || [],
    input = approval.method.includes("requestUserInput"),
    extra = approval.method === "item/permissions/requestApproval",
    elicitation = approval.method === "mcpServer/elicitation/request";
  const respond = async (result: any) => {
    setBusy(true);
    try {
      await api("approval.respond", { id: approval.id, result });
      onResolved(approval.id);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="approval-card">
      <header>
        <ShieldAlert size={17} />
        <strong>
          {input ? "Agent needs your input" : "Approval required"}
        </strong>
      </header>
      <p>
        {p.reason ||
          p.justification ||
          "Review this action before you continue."}
      </p>
      {p.command && <pre>{p.command}</pre>}
      {p.cwd && <small className="wrap">Working directory: {p.cwd}</small>}
      {p.grantRoot && (
        <small className="wrap">Requested path: {p.grantRoot}</small>
      )}
      {!input && !p.command && (
        <pre>{JSON.stringify(p, null, 2).slice(0, 8000)}</pre>
      )}
      {input &&
        questions.map((q: any) => (
          <label className="approval-question" key={q.id}>
            <strong>{q.header || q.question}</strong>
            <span>{q.question}</span>
            {q.options?.length ? (
              <select
                value={answers[q.id] || ""}
                onChange={(e) =>
                  setAnswers({ ...answers, [q.id]: e.target.value })
                }
              >
                <option value="">Select an answer…</option>
                {q.options.map((o: any) => (
                  <option key={o.label} value={o.label}>
                    {o.label} — {o.description}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={answers[q.id] || ""}
                onChange={(e) =>
                  setAnswers({ ...answers, [q.id]: e.target.value })
                }
              />
            )}
          </label>
        ))}
      {extra && (
        <p>
          Additional grants cannot be approved here. Decline this request, then
          review the permission mode in Settings.
        </p>
      )}
      {elicitation && (
        <p>
          This provider form is not supported by JARVIS. You can decline or
          cancel it.
        </p>
      )}
      <div className="button-row">
        {extra ? (
          <button
            disabled={busy}
            onClick={() => void respond({ permissions: {}, scope: "turn" })}
          >
            Decline additional grants
          </button>
        ) : elicitation ? (
          <>
            <button
              disabled={busy}
              onClick={() => void respond({ action: "decline" })}
            >
              Decline form
            </button>
            <button
              disabled={busy}
              onClick={() => void respond({ action: "cancel" })}
            >
              Cancel form
            </button>
          </>
        ) : input ? (
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              void respond({
                answers: Object.fromEntries(
                  questions.map((q: any) => [
                    q.id,
                    { answers: [answers[q.id] || ""] },
                  ]),
                ),
              })
            }
          >
            Submit answer
          </button>
        ) : (
          <>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void respond({ decision: "accept" })}
            >
              Approve once
            </button>
            <button
              disabled={busy}
              onClick={() => void respond({ decision: "decline" })}
            >
              Decline
            </button>
          </>
        )}
        {!extra && !elicitation && (
          <button
            disabled={busy}
            onClick={() =>
              void respond(input ? { answers: {} } : { decision: "cancel" })
            }
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
export default function Chat({
  hasEarlier,
  onLoadEarlier,
  conversations,
  active,
  items,
  draft,
  running,
  approvals,
  settings,
  codex,
  project,
  onSelect,
  onNew,
  onDraft,
  onSend,
  onStop,
  onBack,
  onReload,
  onOpen,
  onError,
  onResolved,
  onSpeak,
}: {
  hasEarlier: boolean;
  onLoadEarlier(): void;
  conversations: Conversation[];
  active: Conversation | null;
  items: ChatItem[];
  draft: string;
  running: boolean;
  approvals: Approval[];
  settings: Settings;
  codex: any;
  project: string | null;
  onSelect(id: string): void;
  onNew(): void;
  onDraft(t: string): void;
  onSend(): void;
  onStop(): void;
  onBack(): void;
  onReload(): void;
  onOpen(f: FileData): void;
  onError(t: string): void;
  onResolved(id: string | number): void;
  onSpeak(text: string): void;
}) {
  const [query, setQuery] = useState(""),
    [menu, setMenu] = useState(false),
    [renaming, setRenaming] = useState(false),
    [title, setTitle] = useState(""),
    [nearBottom, setNearBottom] = useState(true),
    [limit, setLimit] = useState(100),
    [loading, setLoading] = useState(false);
  const scroll = useRef<HTMLDivElement>(null),
    composer = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    setLimit(100);
    setNearBottom(true);
    requestAnimationFrame(() => {
      if (scroll.current)
        scroll.current.scrollTop = scroll.current.scrollHeight;
    });
  }, [active?.id]);
  useEffect(() => {
    if (nearBottom && scroll.current)
      scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [items, approvals]);
  const action = async (method: string) => {
    if (!active) return;
    setMenu(false);
    setLoading(true);
    try {
      await api(method, { id: active.id });
      onReload();
      if (method !== "conversations.export") onBack();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  const preview = (c: Conversation) =>
    `${new Date(c.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${basename(c.project)}`;
  return (
    <aside className="chat-panel panel" aria-label="Conversations">
      <div className="panel-heading">
        <div className="heading-with-back">
          {active && (
            <button
              title="All conversations"
              aria-label="All conversations"
              onClick={onBack}
            >
              <ArrowLeft size={15} />
            </button>
          )}
          <span>{active ? "CONVERSATION" : "CONVERSATIONS"}</span>
        </div>
        <div className="icon-actions">
          <button
            title="New conversation"
            aria-label="New conversation"
            onClick={onNew}
            disabled={!project}
          >
            <Plus size={17} />
          </button>
          {active && (
            <button
              title="Conversation actions"
              aria-label="Conversation actions"
              onClick={() => setMenu(!menu)}
            >
              <MoreHorizontal size={17} />
            </button>
          )}
        </div>
      </div>
      {!active ? (
        <>
          <div className="conversation-search">
            <label className="search-box">
              <Search size={14} />
              <input
                aria-label="Search conversations"
                placeholder="Search conversations…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>
          <div className="conversation-list">
            {conversations
              .filter(
                (c) =>
                  !c.archived &&
                  `${c.title} ${c.project}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
              )
              .map((c) => (
                <button
                  key={c.id}
                  className="conversation-row"
                  onClick={() => onSelect(c.id)}
                >
                  <span className="conversation-icon">
                    <MessageSquare size={16} />
                  </span>
                  <span>
                    <strong>{c.title}</strong>
                    <small>{preview(c)}</small>
                    <span className="conversation-path" title={c.project}>
                      {c.project}
                    </span>
                  </span>
                  <ChevronRight size={14} />
                </button>
              ))}
            {!conversations.length && (
              <div className="empty-panel">
                <MessageSquare size={30} />
                <h3>A place to think and build.</h3>
                <p>
                  Start a conversation in a project. Your work stays connected
                  to its folder.
                </p>
                <button className="primary" onClick={onNew} disabled={!project}>
                  <Plus size={15} />
                  New conversation
                </button>
                {!project && <small>Open a project first.</small>}
              </div>
            )}
            {!!conversations.length &&
              !conversations.some(
                (c) =>
                  !c.archived &&
                  `${c.title} ${c.project}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
              ) && <p className="empty-search">No matching conversations.</p>}
          </div>
          <div className="chat-list-footer">
            <ShieldAlert size={13} />
            <span>{permissionLabel(settings.permissionMode)}</span>
            <span>LOCAL HISTORY</span>
          </div>
        </>
      ) : (
        <>
          <div className="conversation-title">
            <h2 title={active.title}>{active.title}</h2>
            <span title={active.project}>
              <Folder size={12} />
              {active.project}
            </span>
          </div>
          <div className="conversation-policy">
            <span>
              {settings.model ||
                (codex?.models || []).find((m: any) => m.isDefault)
                  ?.displayName ||
                "Account default"}
            </span>
            <span>{permissionLabel(settings.permissionMode)}</span>
          </div>
          <div
            ref={scroll}
            className="messages"
            onScroll={(e) => {
              const el = e.currentTarget;
              setNearBottom(
                el.scrollHeight - el.scrollTop - el.clientHeight < 90,
              );
            }}
          >
            {hasEarlier && (
              <button className="load-earlier" onClick={onLoadEarlier}>
                Load earlier turns from Codex
              </button>
            )}
            {items.length > limit && (
              <button
                className="load-earlier"
                onClick={() => {
                  const height = scroll.current?.scrollHeight || 0;
                  setLimit(limit + 100);
                  requestAnimationFrame(() => {
                    if (scroll.current)
                      scroll.current.scrollTop +=
                        scroll.current.scrollHeight - height;
                  });
                }}
              >
                Show 100 earlier items
              </button>
            )}
            {!items.length && (
              <div className="conversation-welcome">
                <div className="mini-orb">J</div>
                <h3>What shall we work on?</h3>
                <p>Ask a question, explore your project, or describe a task.</p>
                <small>Working directory: {active.project}</small>
                {active.threadId && !codex?.connected && (
                  <div className="info-box">
                    The saved thread is unavailable while Codex is disconnected.
                    Your draft is available. Reconnect in Settings to load its
                    history.
                  </div>
                )}
                {!codex?.account && (
                  <div className="info-box">
                    Sign in through Settings → Codex to use online tasks. Local
                    project and file tools are ready.
                  </div>
                )}
              </div>
            )}
            {items.slice(-limit).map((item) =>
              item.type === "userMessage" ? (
                <article className="message user-message" key={item.id}>
                  <header>YOU</header>
                  <div className="user-text">
                    {item.text ||
                      (item.content || [])
                        .map((c: any) => c.text || "")
                        .join("\n")}
                  </div>
                </article>
              ) : item.type === "agentMessage" ? (
                <article className="message assistant-message" key={item.id}>
                  <header>
                    <span className="assistant-mark">◉</span> JARVIS
                    {item.streaming && <span className="streaming-dot" />}
                    <div className="message-actions">
                      <button
                        title="Read response with AI-generated voice"
                        aria-label="Read response with AI-generated voice"
                        onClick={() => onSpeak(item.text || "")}
                      >
                        <AudioLines size={13} />
                      </button>
                      <CopyButton text={item.text || ""} />
                    </div>
                  </header>
                  <div className="markdown">
                    <MessageMarkdown text={item.text || ""} />
                    {!item.text && item.streaming && (
                      <span className="muted">Waiting for response…</span>
                    )}
                  </div>
                </article>
              ) : (
                <Activity
                  key={item.id}
                  item={item}
                  onOpen={onOpen}
                  onError={onError}
                />
              ),
            )}
            {approvals.map((a) => (
              <ApprovalCard
                key={a.id}
                approval={a}
                onError={onError}
                onResolved={onResolved}
              />
            ))}
            {running && (
              <div className="turn-status">
                <i />
                Codex is working<span>Stop requests an interruption.</span>
              </div>
            )}
          </div>
          {!nearBottom && (
            <button
              className="latest-message"
              onClick={() => {
                if (scroll.current)
                  scroll.current.scrollTop = scroll.current.scrollHeight;
                setNearBottom(true);
              }}
            >
              <ArrowDown size={13} />
              Latest message
            </button>
          )}
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              onSend();
            }}
          >
            <textarea
              ref={composer}
              rows={3}
              value={draft}
              onChange={(e) => onDraft(e.target.value)}
              placeholder={
                codex?.connected
                  ? "Ask JARVIS anything about this project…"
                  : "Connect Codex in Settings to start a task…"
              }
              aria-label="Message JARVIS"
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  if (!running && draft.trim()) onSend();
                }
              }}
            />
            <div className="composer-footer">
              <small>Enter to send · Shift+Enter for a new line</small>
              {running ? (
                <button type="button" className="stop-button" onClick={onStop}>
                  <Square size={12} fill="currentColor" />
                  Stop
                </button>
              ) : (
                <button
                  className="send-button"
                  disabled={!draft.trim() || loading || !codex?.connected}
                  title="Send message"
                  aria-label="Send message"
                >
                  <Send size={16} />
                </button>
              )}
            </div>
          </form>
          <div className="composer-note">
            Responses can contain errors. Review commands and changes.
          </div>
        </>
      )}
      {menu && active && (
        <>
          <div className="menu-dismiss" onClick={() => setMenu(false)} />
          <div className="context-menu conversation-menu" role="menu">
            <button
              onClick={() => {
                setTitle(active.title);
                setRenaming(true);
                setMenu(false);
              }}
            >
              <Pencil size={13} />
              Rename…
            </button>
            <button onClick={() => void action("conversations.export")}>
              <Download size={13} />
              Export…
            </button>
            <button onClick={() => void action("conversations.archive")}>
              <Archive size={13} />
              Archive in Codex
            </button>
            <hr />
            <button
              className="danger-text"
              onClick={() => void action("conversations.delete")}
            >
              <Trash2 size={13} />
              Remove local reference…
            </button>
          </div>
        </>
      )}
      {renaming && active && (
        <div className="modal-backdrop">
          <form
            className="small-dialog"
            onSubmit={(e) => {
              e.preventDefault();
              void api("conversations.update", { id: active.id, title })
                .then(() => {
                  setRenaming(false);
                  onReload();
                })
                .catch((e) => onError(e.message));
            }}
          >
            <h2>Rename conversation</h2>
            <label>
              Title
              <input
                autoFocus
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <div className="dialog-actions">
              <button type="button" onClick={() => setRenaming(false)}>
                Cancel
              </button>
              <button className="primary">Save title</button>
            </div>
          </form>
        </div>
      )}
    </aside>
  );
}
