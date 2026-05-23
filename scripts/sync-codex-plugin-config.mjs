#!/usr/bin/env node
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const codexHome = process.env.CODEX_HOME || join(homedir(), ".codex");
const configPath = join(codexHome, "config.toml");
const version = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8")).version;
const canonicalPlugin = '[plugins."saguaro-agent@saguaro"]';
const legacyPlugin = '[plugins."saguaro-agent@saguaro-agent"]';
const legacyMarketplace = "[marketplaces.saguaro-agent]";
const sourcePluginRoot = join(repoRoot, "marketplaces", "codex", "plugins", "saguaro-agent");
const cacheRoot = join(codexHome, "plugins", "cache");
const canonicalCacheRoot = join(cacheRoot, "saguaro", "saguaro-agent");
const canonicalCacheVersionRoot = join(canonicalCacheRoot, version);
const legacyCacheRoot = join(cacheRoot, "saguaro-agent");

function removeTable(content, header) {
  const lines = content.split("\n");
  const next = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] !== header) {
      next.push(lines[index]);
      continue;
    }

    index += 1;
    while (index < lines.length && !lines[index].startsWith("[")) {
      index += 1;
    }
    index -= 1;
  }
  return next.join("\n");
}

function insertEnabledPlugin(content, header) {
  const lines = content.split("\n");
  const firstPlugin = lines.findIndex((line) => line.startsWith("[plugins."));

  if (firstPlugin === -1) {
    const firstTable = lines.findIndex((line) => line.startsWith("["));
    const insertAt = firstTable === -1 ? lines.length : firstTable;
    return [
      ...lines.slice(0, insertAt),
      header,
      "enabled = true",
      "",
      ...lines.slice(insertAt),
    ].join("\n");
  }

  let insertAt = firstPlugin;
  while (insertAt < lines.length) {
    if (lines[insertAt].startsWith("[") && !lines[insertAt].startsWith("[plugins.")) {
      break;
    }
    insertAt += 1;
  }

  return [
    ...lines.slice(0, insertAt),
    "",
    header,
    "enabled = true",
    ...lines.slice(insertAt),
  ].join("\n");
}

let config = "";
try {
  config = await readFile(configPath, "utf8");
} catch (error) {
  if (error.code !== "ENOENT") {
    throw error;
  }
}

config = removeTable(config, legacyPlugin);
config = removeTable(config, legacyMarketplace);
config = removeTable(config, canonicalPlugin);
config = insertEnabledPlugin(config, canonicalPlugin);

await mkdir(dirname(configPath), { recursive: true });
await writeFile(configPath, config, "utf8");

await rm(legacyCacheRoot, { recursive: true, force: true });
await rm(canonicalCacheRoot, { recursive: true, force: true });
await mkdir(canonicalCacheRoot, { recursive: true });
await cp(sourcePluginRoot, canonicalCacheVersionRoot, { recursive: true });
await cp(
  join(canonicalCacheVersionRoot, ".codex-plugin", "plugin.json"),
  join(canonicalCacheVersionRoot, "plugin.json")
);

console.log(`Synced Codex plugin config at ${configPath}`);
console.log(`Synced Codex plugin cache at ${canonicalCacheVersionRoot}`);
