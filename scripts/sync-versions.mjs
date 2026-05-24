#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const rootPkgPath = resolve(repoRoot, "package.json");
const rootPkg = JSON.parse(await readFile(rootPkgPath, "utf8"));
const version = rootPkg.version;

if (!version || typeof version !== "string") {
  throw new Error(`Missing version in ${rootPkgPath}`);
}

const packagePaths = [
  "mcp-servers/core/package.json",
  "mcp-servers/saguaro-memory/package.json",
  "mcp-servers/saguaro-knowledge/package.json",
  "mcp-servers/saguaro-workflow/package.json",
];

for (const relativePath of packagePaths) {
  const path = resolve(repoRoot, relativePath);
  const pkg = JSON.parse(await readFile(path, "utf8"));
  if (pkg.version === version) {
    continue;
  }
  pkg.version = version;
  await writeFile(path, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
  console.log(`synced ${relativePath} -> ${version}`);
}
