import { build } from "esbuild";
import { readFile, rm, writeFile } from "node:fs/promises";

const outfile = "dist/index.mjs";

await build({
  entryPoints: ["src/index.ts"],
  outfile,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  sourcemap: false,
});

const output = await readFile(outfile, "utf8");
await writeFile(outfile, output.replace(/[ \t]+$/gm, ""), "utf8");
await rm(`${outfile}.map`, { force: true });
