import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  FileImage,
  FileCode2,
  File,
  RefreshCw,
  Plus,
  Eye,
  EyeOff,
  Search,
  FolderPlus,
  MoreHorizontal,
  X,
} from "lucide-react";
import { api, basename, type FileData, type FileEntry } from "./api";
export default function Explorer({
  project,
  hidden,
  onHidden,
  onOpen,
  onError,
  refreshKey,
}: {
  project: string | null;
  hidden: boolean;
  onHidden(): void;
  onOpen(file: FileData): void;
  onError(text: string): void;
  refreshKey: number;
}) {
  const [filter, setFilter] = useState(""),
    [expanded, setExpanded] = useState<Set<string>>(new Set()),
    [entries, setEntries] = useState<Record<string, FileEntry[]>>({}),
    [context, setContext] = useState<{
      path: string;
      directory: boolean;
      x: number;
      y: number;
    } | null>(null),
    [operation, setOperation] = useState<{
      kind: "file" | "folder" | "rename";
      path: string;
      value: string;
    } | null>(null),
    [busy, setBusy] = useState(false);
  const projectRef = useRef(project);
  projectRef.current = project;
  const load = useCallback(
    async (path: string) => {
      const origin = projectRef.current;
      if (!origin || (path !== origin && !path.startsWith(origin + "/")))
        return;
      try {
        const items = await api<FileEntry[]>("fs.list", { path, hidden });
        if (origin === projectRef.current)
          setEntries((e) => ({ ...e, [path]: items }));
      } catch (e) {
        if (origin === projectRef.current) onError((e as Error).message);
      }
    },
    [hidden, onError],
  );
  useEffect(() => {
    if (project) {
      setExpanded(new Set([project]));
      setEntries({});
      void load(project);
    } else {
      setExpanded(new Set());
      setEntries({});
    }
  }, [project, hidden]);
  useEffect(() => {
    expanded.forEach((p) => void load(p));
  }, [refreshKey]);
  const toggle = async (path: string) => {
    const next = new Set(expanded);
    if (next.has(path)) next.delete(path);
    else {
      next.add(path);
      await load(path);
    }
    setExpanded(next);
  };
  const execute = async (fn: () => Promise<unknown>) => {
    setContext(null);
    try {
      await fn();
      expanded.forEach((p) => void load(p));
    } catch (e) {
      onError((e as Error).message);
    }
  };
  const icon = (e: FileEntry) =>
    e.directory ? (
      expanded.has(e.path) ? (
        <FolderOpen size={15} />
      ) : (
        <Folder size={15} />
      )
    ) : /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(e.name) ? (
      <FileImage size={15} />
    ) : /\.(tsx?|jsx?|json|py|rs|css|html|sh|c|cpp|yaml|yml|toml)$/i.test(
        e.name,
      ) ? (
      <FileCode2 size={15} />
    ) : /\.(md|txt|log|csv)$/i.test(e.name) ? (
      <FileText size={15} />
    ) : (
      <File size={15} />
    );
  const row = (e: FileEntry, depth: number) => (
    <div key={e.path}>
      <button
        className={`tree-row ${e.directory ? "directory" : ""}`}
        style={{ paddingLeft: 12 + depth * 15 }}
        title={`${e.path}${e.symlink ? " (symbolic link)" : ""}`}
        onClick={() =>
          e.directory
            ? void toggle(e.path)
            : void execute(async () =>
                onOpen(await api("fs.read", { path: e.path })),
              )
        }
        onContextMenu={(event) => {
          event.preventDefault();
          setContext({
            ...e,
            x: Math.min(event.clientX, window.innerWidth - 215),
            y: Math.min(event.clientY, window.innerHeight - 270),
          });
        }}
        aria-expanded={e.directory ? expanded.has(e.path) : undefined}
      >
        {e.directory ? (
          expanded.has(e.path) ? (
            <ChevronDown size={12} />
          ) : (
            <ChevronRight size={12} />
          )
        ) : (
          <span className="tree-indent" />
        )}
        {icon(e)}
        <span>{e.name}</span>
        {e.symlink && <small>↗</small>}
      </button>
      {e.directory && expanded.has(e.path) && render(e.path, depth + 1)}
    </div>
  );
  const render = (path: string, depth: number): React.ReactNode => {
    const list = entries[path];
    if (!list)
      return (
        <div className="tree-empty" style={{ paddingLeft: 28 + depth * 15 }}>
          Loading…
        </div>
      );
    const matches = list.filter(
      (e) =>
        !filter ||
        e.name.toLowerCase().includes(filter.toLowerCase()) ||
        e.directory,
    );
    return matches.length ? (
      matches.map((e) => row(e, depth))
    ) : (
      <div className="tree-empty" style={{ paddingLeft: 28 + depth * 15 }}>
        {filter ? "No matching names" : "Empty folder"}
      </div>
    );
  };
  return (
    <aside className="explorer panel" aria-label="Project files">
      <div className="panel-heading">
        <span>EXPLORER</span>
        <div className="icon-actions">
          <button
            title="Create file"
            aria-label="Create file"
            disabled={!project}
            onClick={() =>
              setOperation({ kind: "file", path: project!, value: "" })
            }
          >
            <Plus size={15} />
          </button>
          <button
            title="Refresh files"
            aria-label="Refresh files"
            disabled={!project}
            onClick={() => expanded.forEach((p) => void load(p))}
          >
            <RefreshCw size={14} />
          </button>
          <button
            title={hidden ? "Hide hidden files" : "Show hidden files"}
            aria-label={hidden ? "Hide hidden files" : "Show hidden files"}
            onClick={onHidden}
          >
            {hidden ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
        </div>
      </div>
      {project ? (
        <>
          <div className="project-root" title={project}>
            <button
              className="project-root-toggle"
              onClick={() => void toggle(project)}
            >
              <ChevronDown size={13} />
              <FolderOpen size={15} />
              <span>{basename(project)}</span>
            </button>
            <button
              className="nested-action"
              title="Project actions"
              aria-label="Project actions"
              onClick={(e) => {
                e.stopPropagation();
                setContext({ path: project, directory: true, x: 20, y: 130 });
              }}
            >
              <MoreHorizontal size={14} />
            </button>
          </div>
          <label className="search-box">
            <Search size={13} />
            <input
              placeholder="Filter file names…"
              aria-label="Filter file names"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            {filter && (
              <button
                aria-label="Clear file filter"
                onClick={() => setFilter("")}
              >
                <X size={12} />
              </button>
            )}
          </label>
          <div className="tree" role="group" aria-label="Files">
            {expanded.has(project) && render(project, 0)}
          </div>
          <div className="explorer-footer" title={project}>
            {project}
          </div>
        </>
      ) : (
        <div className="empty-panel">
          <FolderOpen size={29} />
          <h3>Your project, in view.</h3>
          <p>Open a folder to explore and edit its files.</p>
          <button
            className="primary"
            onClick={() => void execute(() => api("project.open"))}
          >
            <FolderOpen size={15} />
            Open folder
          </button>
          <button
            className="text-button"
            onClick={() => void execute(() => api("project.new"))}
          >
            <FolderPlus size={14} />
            Create a folder
          </button>
        </div>
      )}
      {context && (
        <>
          <div
            className="menu-dismiss"
            onClick={() => setContext(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContext(null);
            }}
          />
          <div
            className="context-menu"
            role="menu"
            style={{ left: context.x, top: context.y }}
          >
            {context.directory && (
              <>
                <button
                  role="menuitem"
                  onClick={() => {
                    setOperation({
                      kind: "file",
                      path: context.path,
                      value: "",
                    });
                    setContext(null);
                  }}
                >
                  New file…
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setOperation({
                      kind: "folder",
                      path: context.path,
                      value: "",
                    });
                    setContext(null);
                  }}
                >
                  New folder…
                </button>
                <hr />
              </>
            )}
            <button
              role="menuitem"
              onClick={() => {
                setOperation({
                  kind: "rename",
                  path: context.path,
                  value: basename(context.path),
                });
                setContext(null);
              }}
            >
              Rename…
            </button>
            <button
              role="menuitem"
              onClick={() =>
                void execute(() => api("fs.copyPath", { path: context.path }))
              }
            >
              Copy path
            </button>
            <button
              role="menuitem"
              onClick={() =>
                void execute(() => api("fs.reveal", { path: context.path }))
              }
            >
              Show in file manager
            </button>
            <hr />
            <button
              className="danger-text"
              role="menuitem"
              onClick={() =>
                void execute(() => api("fs.trash", { path: context.path }))
              }
            >
              Move to trash…
            </button>
          </div>
        </>
      )}
      {operation && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOperation(null);
          }}
        >
          <form
            className="small-dialog"
            onSubmit={(e) => {
              e.preventDefault();
              if (busy) return;
              setBusy(true);
              void execute(async () => {
                if (operation.kind === "rename")
                  await api("fs.rename", {
                    path: operation.path,
                    name: operation.value,
                  });
                else
                  await api("fs.create", {
                    parent: operation.path,
                    name: operation.value,
                    directory: operation.kind === "folder",
                  });
                setOperation(null);
              }).finally(() => setBusy(false));
            }}
          >
            <h2>
              {operation.kind === "rename"
                ? "Rename item"
                : `New ${operation.kind}`}
            </h2>
            <p className="muted wrap">{operation.path}</p>
            <label>
              Name
              <input
                autoFocus
                value={operation.value}
                onChange={(e) =>
                  setOperation({ ...operation, value: e.target.value })
                }
                required
                aria-label="Item name"
              />
            </label>
            <div className="dialog-actions">
              <button type="button" onClick={() => setOperation(null)}>
                Cancel
              </button>
              <button
                className="primary"
                disabled={busy || !operation.value.trim()}
              >
                {busy
                  ? "Working…"
                  : operation.kind === "rename"
                    ? "Rename"
                    : "Create"}
              </button>
            </div>
          </form>
        </div>
      )}
    </aside>
  );
}
