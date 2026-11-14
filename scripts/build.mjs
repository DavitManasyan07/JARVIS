import { build } from "esbuild";
await build({
  entryPoints: ["src/main/main.ts"],
  outfile: "dist/main.cjs",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  external: ["electron"],
  sourcemap: true,
});
await build({
  entryPoints: ["src/main/preload.ts"],
  outfile: "dist/preload.cjs",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  external: ["electron"],
});
