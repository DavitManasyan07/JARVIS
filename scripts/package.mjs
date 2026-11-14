import {
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const target = path.join(root, "build", "linux-unpacked");
const staging = path.join(root, "build", "linux-unpacked.staging");
await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });
try {
  await cp(path.join(root, "node_modules/electron/dist"), staging, {
    recursive: true,
  });
  await rename(
    path.join(staging, "electron"),
    path.join(staging, "jarvis-bin"),
  );
  await rm(path.join(staging, "resources/default_app.asar"), { force: true });
  const app = path.join(staging, "resources/app");
  await mkdir(app, { recursive: true });
  await cp(path.join(root, "dist"), path.join(app, "dist"), {
    recursive: true,
  });
  await cp(path.join(root, "assets"), path.join(app, "assets"), {
    recursive: true,
  });
  await cp(path.join(root, "docs"), path.join(app, "docs"), {
    recursive: true,
  });
  await cp(path.join(root, "README.md"), path.join(app, "README.md"));
  await cp(path.join(root, "LICENSE"), path.join(app, "LICENSE"));
  await writeFile(
    path.join(app, "package.json"),
    JSON.stringify(
      {
        name: pkg.name,
        productName: "JARVIS",
        version: pkg.version,
        main: "dist/main.cjs",
        license: pkg.license,
      },
      null,
      2,
    ) + "\n",
  );
  const licenseDir = path.join(app, "THIRD_PARTY_LICENSES");
  await mkdir(licenseDir, { recursive: true });
  const modules = path.join(root, "node_modules");
  const packageDirs = [];
  for (const entry of await readdir(modules, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    if (entry.name.startsWith("@")) {
      for (const child of await readdir(path.join(modules, entry.name), {
        withFileTypes: true,
      })) {
        if (child.isDirectory())
          packageDirs.push(path.join(modules, entry.name, child.name));
      }
    } else packageDirs.push(path.join(modules, entry.name));
  }
  for (const directory of packageDirs) {
    const label = path.relative(modules, directory).replaceAll(path.sep, "__");
    const files = (await readdir(directory, { withFileTypes: true })).filter(
      (entry) =>
        entry.isFile() &&
        /^(LICENSE|LICENCE|COPYING|NOTICE)([.-]|$)/i.test(entry.name),
    );
    for (const file of files)
      await cp(
        path.join(directory, file.name),
        path.join(licenseDir, `${label}__${file.name}`),
      );
  }
  const electron = JSON.parse(
    await readFile(
      path.join(root, "node_modules/electron/package.json"),
      "utf8",
    ),
  );
  await writeFile(
    path.join(staging, ".jarvis-managed"),
    JSON.stringify({
      application: "io.jarvis.Desktop",
      version: pkg.version,
      electron: electron.version,
    }) + "\n",
  );
  await rm(target, { recursive: true, force: true });
  await rename(staging, target);
  console.log(
    `Packaged JARVIS ${pkg.version} with Electron ${electron.version}: ${target}`,
  );
} catch (error) {
  await rm(staging, { recursive: true, force: true });
  throw error;
}
