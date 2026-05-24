import { build } from "esbuild";
import { readFile, rm, writeFile } from "node:fs/promises";

const outfile = "dist/index.mjs";

const banner = {
  js: [
    "#!/usr/bin/env node",
    'import { createRequire as __cjsCreateRequire } from "module";',
    "const require = __cjsCreateRequire(import.meta.url);",
  ].join("\n"),
};

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outfile,
  banner,
  sourcemap: false,
  minify: false,
});

const output = await readFile(outfile, "utf8");
await writeFile(outfile, output.replace(/[ \t]+$/gm, ""), "utf8");
await rm(`${outfile}.map`, { force: true });

console.log("Built dist/index.mjs (saguaro-memory MCP server)");
