import { useEffect, useRef, useState } from "react";
import { X, Save, FileText, ExternalLink, RotateCw } from "lucide-react";
import { api, basename, type FileData } from "./api";
export type EditorTab = FileData & { buffer: string; saved: string };
export default function Editor({
  tabs,
  active,
  onActive,
  onChange,
  onClose,
  onSaved,
  onError,
  saveSignal,
}: {
  tabs: EditorTab[];
  active: string;
  onActive(path: string): void;
  onChange(path: string, value: string): void;
  onClose(path: string): void;
  onSaved(oldPath: string, newPath: string, content: string): void;
  onError(text: string): void;
  saveSignal: { id: number; as: boolean };
}) {
  const tab = tabs.find((t) => t.path === active),
    [saving, setSaving] = useState(false),
    editor = useRef<HTMLTextAreaElement>(null),
    lines = useRef<HTMLDivElement>(null);
  const save = async (as = false) => {
    if (!tab || tab.kind !== "text" || saving) return;
    setSaving(true);
    try {
      const path = await api("fs.save", {
        path: tab.path,
        content: tab.buffer,
        saveAs: as,
      });
      if (path) onSaved(tab.path, path, tab.buffer);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  useEffect(() => {
    if (saveSignal.id) void save(saveSignal.as);
  }, [saveSignal.id]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        void save(e.shiftKey);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [tab, saving]);
  if (!tab) return null;
  return (
    <section className="editor" aria-label="File editor">
      <div className="editor-tabs">
        <button
          className="editor-home"
          onClick={() => onActive("")}
          title="Return to visualization"
          aria-label="Return to visualization"
        >
          ◉
        </button>
        {tabs.map((t) => (
          <div
            className={`editor-tab ${active === t.path ? "active" : ""}`}
            key={t.path}
          >
            <button onClick={() => onActive(t.path)} title={t.path}>
              <FileText size={13} />
              {basename(t.path)}
              {t.buffer !== t.saved && (
                <span className="unsaved" aria-label="Unsaved changes">
                  ●
                </span>
              )}
            </button>
            <button
              aria-label={`Close ${basename(t.path)}`}
              title="Close file"
              onClick={() => onClose(t.path)}
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
      <div className="editor-toolbar">
        <span title={tab.path}>{tab.path}</span>
        <small>{(tab.size / 1024).toFixed(1)} KB</small>
        {tab.kind === "text" && (
          <>
            <button
              title="Save (Ctrl+S)"
              disabled={saving}
              onClick={() => void save()}
            >
              <Save size={14} />
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              title="Save as (Ctrl+Shift+S)"
              onClick={() => void save(true)}
              aria-label="Save file as"
            >
              <ExternalLink size={14} />
            </button>
          </>
        )}
        <button
          title="Reload from disk"
          aria-label="Reload from disk"
          onClick={async () => {
            if (
              tab.buffer !== tab.saved &&
              !window.confirm("Discard unsaved changes and reload this file?")
            )
              return;
            try {
              const fresh = await api<FileData>("fs.read", { path: tab.path });
              onSaved(tab.path, tab.path, fresh.content || "");
            } catch (e) {
              onError((e as Error).message);
            }
          }}
        >
          <RotateCw size={14} />
        </button>
      </div>
      {tab.kind === "text" ? (
        <div className="editor-body">
          <div ref={lines} className="line-numbers" aria-hidden="true">
            {Array.from({ length: tab.buffer.split("\n").length }, (_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
          <textarea
            ref={editor}
            spellCheck={false}
            aria-label={`Edit ${basename(tab.path)}`}
            value={tab.buffer}
            onChange={(e) => onChange(tab.path, e.target.value)}
            onScroll={(e) => {
              if (lines.current)
                lines.current.scrollTop = e.currentTarget.scrollTop;
            }}
            onKeyDown={(e) => {
              if (e.key === "Tab") {
                e.preventDefault();
                const start = e.currentTarget.selectionStart,
                  end = e.currentTarget.selectionEnd;
                onChange(
                  tab.path,
                  tab.buffer.slice(0, start) + "  " + tab.buffer.slice(end),
                );
                requestAnimationFrame(() =>
                  editor.current?.setSelectionRange(start + 2, start + 2),
                );
              }
            }}
          />
        </div>
      ) : tab.kind === "image" ? (
        <div className="image-preview">
          <img src={tab.dataUrl} alt={basename(tab.path)} />
        </div>
      ) : (
        <div className="empty-panel">
          <FileText size={30} />
          <h3>Preview unavailable</h3>
          <p>This is a binary file or a file too large to edit here.</p>
          <button onClick={() => void api("fs.reveal", { path: tab.path })}>
            Show in file manager
          </button>
        </div>
      )}
      <div className="editor-status">
        <span>
          {tab.kind === "text"
            ? "UTF-8 · Plain text"
            : tab.kind === "image"
              ? "Image preview"
              : "Binary file"}
        </span>
        <span>
          {tab.buffer !== tab.saved ? "Unsaved changes" : "Saved to disk"}
        </span>
      </div>
    </section>
  );
}
