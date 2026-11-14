import { promises as fs, watch, type FSWatcher } from "node:fs";
import path from "node:path";
import { type FileContent, type FileEntry } from "../shared";

export class Files {
  project: string | null = null;
  private grants = new Map<string, string>();
  private watchers = new Map<string, FSWatcher>();
  private revisions = new Map<string, number>();
  constructor(private changed: (path: string) => void = () => {}) {}
  async openProject(input: string) {
    const resolved = await fs.realpath(input);
    if (resolved === path.parse(resolved).root)
      throw new Error("Select a project folder below the filesystem root.");
    if (!(await fs.stat(resolved)).isDirectory())
      throw new Error("The project must be a folder.");
    this.unwatch();
    this.project = resolved;
    return resolved;
  }
  async grant(file: string) {
    const absolute = path.resolve(file);
    let canonical: string;
    try {
      canonical = await fs.realpath(absolute);
      if (!(await fs.stat(canonical)).isFile())
        throw new Error("Select a regular file.");
    } catch (error: any) {
      if (error.code !== "ENOENT") throw error;
      canonical = path.join(
        await fs.realpath(path.dirname(absolute)),
        path.basename(absolute),
      );
    }
    this.grants.set(absolute, canonical);
    this.grants.set(canonical, canonical);
    return canonical;
  }
  async allowed(input: string, creating = false) {
    const absolute = path.resolve(input);
    const granted = this.grants.get(absolute);
    if (granted) {
      const current = creating
        ? path.join(
            await fs.realpath(path.dirname(absolute)),
            path.basename(absolute),
          )
        : await fs.realpath(absolute);
      if (current !== granted)
        throw new Error(
          "The selected file path now points to a different location. Select the file again with Open File or Save As.",
        );
      return granted;
    }
    if (!this.project)
      throw new Error("Open a project or select a file first.");
    const resolved = creating
      ? path.join(
          await fs.realpath(path.dirname(absolute)),
          path.basename(absolute),
        )
      : await fs.realpath(absolute);
    const relative = path.relative(this.project, resolved);
    if (
      relative.startsWith(".." + path.sep) ||
      relative === ".." ||
      path.isAbsolute(relative)
    )
      throw new Error(
        "This symbolic link or path is outside the open project. Use Open File to select it.",
      );
    return resolved;
  }
  async list(input: string, hidden = false): Promise<FileEntry[]> {
    const root = await this.allowed(input);
    if (!this.watchers.has(root) && this.watchers.size < 128) {
      try {
        const w = watch(root, () => this.changed(root));
        w.on("error", () => {
          w.close();
          this.watchers.delete(root);
        });
        this.watchers.set(root, w);
      } catch {
        /* A manual refresh remains available. */
      }
    }
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries
      .filter((e) => hidden || !e.name.startsWith("."))
      .slice(0, 10000)
      .map((e) => ({
        name: e.name,
        path: path.join(root, e.name),
        directory: e.isDirectory(),
        symlink: e.isSymbolicLink(),
      }))
      .sort(
        (a, b) =>
          Number(b.directory) - Number(a.directory) ||
          a.name.localeCompare(b.name),
      );
  }
  async read(input: string): Promise<FileContent> {
    const target = await this.allowed(input);
    const st = await fs.stat(target);
    if (!st.isFile()) throw new Error("This item is not a regular file.");
    const base = { path: target, size: st.size };
    const ext = path.extname(target).toLowerCase();
    const mime: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".gif": "image/gif",
      ".avif": "image/avif",
      ".bmp": "image/bmp",
    };
    if (mime[ext] && st.size <= 16 * 1024 * 1024)
      return {
        ...base,
        kind: "image",
        dataUrl: `data:${mime[ext]};base64,${(await fs.readFile(target)).toString("base64")}`,
      };
    if (st.size > 2 * 1024 * 1024) return { ...base, kind: "binary" };
    const bytes = await fs.readFile(target);
    if (bytes.includes(0)) return { ...base, kind: "binary" };
    let content: string;
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return { ...base, kind: "binary" };
    }
    this.revisions.set(target, st.mtimeMs);
    return { ...base, kind: "text", content };
  }
  async mutationTarget(input: string, creating = false) {
    try {
      if ((await fs.lstat(path.resolve(input))).isSymbolicLink())
        throw new Error(
          "JARVIS cannot modify a symbolic link directly. Open its target file, or use the system file manager to change the link.",
        );
    } catch (error: any) {
      if (error.code !== "ENOENT") throw error;
    }
    return this.allowed(input, creating);
  }
  async changedOnDisk(input: string) {
    const target = await this.mutationTarget(input, true);
    try {
      const st = await fs.stat(target);
      return (
        this.revisions.has(target) && st.mtimeMs !== this.revisions.get(target)
      );
    } catch {
      return false;
    }
  }
  async save(input: string, content: string) {
    const target = await this.mutationTarget(input, true);
    let mode = 0o600;
    try {
      mode = (await fs.stat(target)).mode;
    } catch {
      /* New file. */
    }
    const temporary = path.join(
      path.dirname(target),
      `.${path.basename(target)}.jarvis-${process.pid}-${Date.now()}`,
    );
    try {
      await fs.writeFile(temporary, content, {
        encoding: "utf8",
        mode,
        flag: "wx",
      });
      await fs.rename(temporary, target);
    } finally {
      await fs.unlink(temporary).catch(() => {});
    }
    this.revisions.set(target, (await fs.stat(target)).mtimeMs);
    return target;
  }
  async create(parent: string, name: string, directory: boolean) {
    const root = await this.allowed(parent);
    const target = path.join(root, name);
    if (directory) await fs.mkdir(target);
    else await fs.writeFile(target, "", { flag: "wx", mode: 0o600 });
    return target;
  }
  async rename(input: string, name: string) {
    const from = await this.mutationTarget(input);
    if (from === this.project)
      throw new Error(
        "Use the system file manager to rename the active project.",
      );
    const target = path.join(path.dirname(from), name);
    try {
      await fs.lstat(target);
      throw new Error("An item with this name already exists.");
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
    }
    await fs.rename(from, target);
    return target;
  }
  close() {
    this.project = null;
    this.unwatch();
  }
  private unwatch() {
    for (const watcher of this.watchers.values()) watcher.close();
    this.watchers.clear();
  }
}
