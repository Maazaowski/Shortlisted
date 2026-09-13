// Bundles the extension into dist/. Load dist/ as an unpacked extension.
import * as esbuild from "esbuild";
import { cpSync, mkdirSync } from "node:fs";

const watch = process.argv.includes("--watch");
mkdirSync("dist", { recursive: true });

const options = {
  entryPoints: ["src/background.ts", "src/sidepanel.ts"],
  bundle: true,
  format: "iife",
  target: "chrome120",
  outdir: "dist",
  sourcemap: watch ? "inline" : false,
  logLevel: "info",
};

function copyStatic() {
  for (const f of ["manifest.json", "sidepanel.html", "sidepanel.css"]) cpSync(f, `dist/${f}`);
  cpSync("icons", "dist/icons", { recursive: true, filter: (src) => !src.endsWith(".svg") });
  cpSync("fonts", "dist/fonts", { recursive: true });
}

if (watch) {
  const ctx = await esbuild.context(options);
  copyStatic();
  await ctx.watch();
} else {
  await esbuild.build(options);
  copyStatic();
}
