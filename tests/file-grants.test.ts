import { afterEach, describe, expect, it } from "vitest";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  symlink,
  unlink,
  rm,
  lstat,
  rename,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Files } from "../src/main/files";
const roots: string[] = [];
const services: Files[] = [];
afterEach(async () => {
  services.splice(0).forEach((files) => files.close());
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "jarvis-grants-"));
  roots.push(root);
  const project = path.join(root, "project with spaces");
  await mkdir(project);
  const files = new Files();
  services.push(files);
  await files.openProject(project);
  return { root, project, files };
}

describe("explicit file grants and symbolic link safety", () => {
  it("rejects a selected file that is later replaced with a link to another location", async () => {
    const { root, files } = await fixture();
    const selected = path.join(root, "selected.txt"),
      privateFile = path.join(root, "private.txt");
    await writeFile(selected, "selected contents");
    await writeFile(privateFile, "private contents");
    await files.grant(selected);
    expect((await files.read(selected)).content).toBe("selected contents");
    await unlink(selected);
    await symlink(privateFile, selected);
    await expect(files.read(selected)).rejects.toThrow("different location");
    await expect(files.save(selected, "must not write")).rejects.toThrow(
      "symbolic link",
    );
    expect(await readFile(privateFile, "utf8")).toBe("private contents");
  });
  it("binds a selected link to its original canonical target and rejects retargeting", async () => {
    const { root, project, files } = await fixture();
    const first = path.join(root, "first.txt"),
      second = path.join(root, "second.txt"),
      selected = path.join(project, "chosen link");
    await writeFile(first, "first");
    await writeFile(second, "second");
    await symlink(first, selected);
    expect(await files.grant(selected)).toBe(first);
    expect(await files.read(selected)).toMatchObject({
      path: first,
      content: "first",
    });
    await unlink(selected);
    await symlink(second, selected);
    await expect(files.read(selected)).rejects.toThrow("different location");
    expect((await files.read(first)).content).toBe("first");
    await expect(files.read(second)).rejects.toThrow("outside");
  });
  it("supports Save As to a selected new filename without granting the whole directory", async () => {
    const { root, files } = await fixture();
    const selected = path.join(root, "new selected file.txt"),
      sibling = path.join(root, "not selected.txt");
    await files.grant(selected);
    await files.save(selected, "saved");
    await writeFile(sibling, "other");
    expect((await files.read(selected)).content).toBe("saved");
    await expect(files.read(sibling)).rejects.toThrow("outside");
  });
  it("rejects a granted parent path redirected through a symlink after selection", async () => {
    const { root, files } = await fixture();
    const parent = path.join(root, "selected parent"),
      moved = path.join(root, "original parent"),
      replacement = path.join(root, "replacement parent");
    await mkdir(parent);
    await mkdir(replacement);
    const selected = path.join(parent, "file.txt");
    await writeFile(selected, "original");
    await writeFile(path.join(replacement, "file.txt"), "replacement");
    await files.grant(selected);
    await rename(parent, moved);
    await symlink(replacement, parent);
    await expect(files.read(selected)).rejects.toThrow("different location");
    await expect(files.save(selected, "must not write")).rejects.toThrow(
      "different location",
    );
    expect(await readFile(path.join(replacement, "file.txt"), "utf8")).toBe(
      "replacement",
    );
  });
  it("refuses renaming, overwriting, or trash-target resolution for a symbolic link", async () => {
    const { project, files } = await fixture();
    const target = path.join(project, "original.txt"),
      link = path.join(project, "link.txt");
    await writeFile(target, "original");
    await symlink(target, link);
    await expect(files.rename(link, "renamed.txt")).rejects.toThrow(
      "symbolic link",
    );
    await expect(files.save(link, "replacement")).rejects.toThrow(
      "symbolic link",
    );
    await expect(files.mutationTarget(link)).rejects.toThrow("symbolic link");
    expect((await lstat(link)).isSymbolicLink()).toBe(true);
    expect(await readFile(target, "utf8")).toBe("original");
  });
});
