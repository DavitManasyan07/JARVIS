import { describe, it, expect, afterEach } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  symlink,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { Store } from "../src/main/store";
import { Files } from "../src/main/files";
import { settingsPatch, name } from "../src/main/validation";
const roots: string[] = [];
async function fixture() {
  const root = await mkdtemp(path.resolve(".dev", "test core "));
  roots.push(root);
  const project = path.join(root, "project with spaces");
  await mkdir(project);
  return { root, project };
}
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
describe("SQLite persistence", () => {
  it("migrates, preserves settings and exact thread references across restarts", async () => {
    const { root, project } = await fixture();
    const filename = path.join(root, "private", "jarvis.sqlite3");
    let db = new Store(filename);
    expect(db.settings().permissionMode).toBe("workspace-write");
    db.updateSettings({ reducedMotion: true, textSize: 17 });
    const c = db.create(project);
    db.update(c.id, {
      threadId: "genuine-thread-reference",
      draft: "unsent draft",
      title: "Saved conversation",
    });
    db.close();
    db = new Store(filename);
    expect(db.settings().reducedMotion).toBe(true);
    expect(db.conversation(c.id)).toMatchObject({
      threadId: "genuine-thread-reference",
      draft: "unsent draft",
      project,
    });
    expect((await stat(filename)).mode & 0o777).toBe(0o600);
    db.update(c.id, { archived: true });
    expect(db.list()[0].archived).toBe(true);
    db.delete(c.id);
    expect(db.list()).toEqual([]);
    db.close();
  });
});
describe("scoped filesystem", () => {
  it("opens non-Git projects, lists hidden files, edits, creates and renames paths with spaces", async () => {
    const { project } = await fixture();
    const files = new Files();
    await files.openProject(project);
    await writeFile(path.join(project, ".hidden"), "x");
    const target = await files.create(project, "sample file.txt", false);
    await files.save(target, "hello");
    expect(await files.read(target)).toMatchObject({
      kind: "text",
      content: "hello",
    });
    expect((await files.list(project)).map((f) => f.name)).toEqual([
      "sample file.txt",
    ]);
    expect(await files.list(project, true)).toHaveLength(2);
    expect(await files.rename(target, "renamed.txt")).toBe(
      path.join(project, "renamed.txt"),
    );
    files.close();
  });
  it("blocks traversal and external symlinks while allowing explicit selected files", async () => {
    const { root, project } = await fixture();
    const outside = path.join(root, "outside.txt");
    await writeFile(outside, "private");
    await symlink(outside, path.join(project, "link"));
    const files = new Files();
    await files.openProject(project);
    await expect(files.read(outside)).rejects.toThrow("outside");
    await expect(files.read(path.join(project, "link"))).rejects.toThrow(
      "outside",
    );
    await expect(
      files.save(path.join(project, "..", "escape.txt"), "x"),
    ).rejects.toThrow("outside");
    await files.grant(outside);
    expect(await files.read(outside)).toMatchObject({ content: "private" });
    files.close();
  });
  it("handles binary, oversized, missing directories, and external save conflicts", async () => {
    const { project } = await fixture();
    const files = new Files();
    await expect(files.openProject(project + "/missing")).rejects.toThrow();
    await files.openProject(project);
    const bin = path.join(project, "binary");
    await writeFile(bin, Buffer.from([0, 1, 2]));
    expect((await files.read(bin)).kind).toBe("binary");
    const huge = path.join(project, "large.txt");
    await writeFile(huge, Buffer.alloc(2 * 1024 * 1024 + 1, 65));
    expect((await files.read(huge)).kind).toBe("binary");
    const file = await files.create(project, "conflict.txt", false);
    await files.read(file);
    await new Promise((r) => setTimeout(r, 5));
    await writeFile(file, "external");
    expect(await files.changedOnDisk(file)).toBe(true);
    files.close();
  });
  it("does not overwrite rename targets", async () => {
    const { project } = await fixture();
    const files = new Files();
    await files.openProject(project);
    const a = await files.create(project, "a", false);
    const b = await files.create(project, "b", false);
    await expect(files.rename(a, "b")).rejects.toThrow("already exists");
    expect(await readFile(b, "utf8")).toBe("");
    files.close();
  });
});
describe("untrusted IPC values", () => {
  it("rejects path injection, unknown settings, invalid ranges and cosmetic permissions", () => {
    for (const value of ["../evil", "/tmp/test", "..", ".", "x\0y", "sub/file"])
      expect(name.safeParse(value).success).toBe(false);
    expect(
      settingsPatch.safeParse({ permissionMode: "pretend-safe" }).success,
    ).toBe(false);
    expect(settingsPatch.safeParse({ nodeIntegration: true }).success).toBe(
      false,
    );
    expect(settingsPatch.safeParse({ volume: 9 }).success).toBe(false);
    expect(
      settingsPatch.safeParse({ permissionMode: "read-only", textSize: 16 })
        .success,
    ).toBe(true);
  });
});
