#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const required = [
  "marketplaces/claude/.claude-plugin/marketplace.json",
  "marketplaces/claude/plugins/saguaro-agent/.claude-plugin/plugin.json",
  "marketplaces/claude/plugins/saguaro-agent/.cursor-plugin/plugin.json",
  "marketplaces/claude/plugins/saguaro-agent/mcp.json",
  "marketplaces/claude/plugins/saguaro-agent/mcp-servers/saguaro-workflow/dist/index.mjs",
  "marketplaces/claude/plugins/saguaro-agent/mcp-servers/saguaro-memory/dist/index.mjs",
  "marketplaces/claude/plugins/saguaro-agent/mcp-servers/saguaro-knowledge/dist/index.mjs",
  "marketplaces/codex/.agents/plugins/marketplace.json",
  "marketplaces/codex/plugins/saguaro-agent/.codex-plugin/plugin.json",
  "marketplaces/codex/plugins/saguaro-agent/.mcp.json",
  "marketplaces/codex/plugins/saguaro-agent/mcp-servers/saguaro-workflow/dist/index.mjs",
  "marketplaces/codex/plugins/saguaro-agent/mcp-servers/saguaro-memory/dist/index.mjs",
  "marketplaces/codex/plugins/saguaro-agent/mcp-servers/saguaro-knowledge/dist/index.mjs",
  "marketplaces/gemini/extensions/saguaro-agent/gemini-extension.json",
  "marketplaces/gemini/extensions/saguaro-agent/mcp-servers/saguaro-workflow/dist/index.mjs",
  "marketplaces/gemini/extensions/saguaro-agent/mcp-servers/saguaro-memory/dist/index.mjs",
  "marketplaces/gemini/extensions/saguaro-agent/mcp-servers/saguaro-knowledge/dist/index.mjs",
];

async function readJson(path) {
  return JSON.parse(await readFile(resolve(repoRoot, path), "utf8"));
}

function assertStringArray(value, message) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(message);
  }
}

function assertNoForbiddenCodexManifestContent(rawManifest) {
  const forbidden = [
    "~/.localrc",
    "source ~/.localrc",
    "/Users/",
    "/home/",
    "C:\\Users\\",
    "${EMBEDDINGS_",
    "${LLM_",
  ];

  for (const value of forbidden) {
    if (rawManifest.includes(value)) {
      throw new Error(`Codex MCP manifest must not contain ${value}.`);
    }
  }
}

function assertNoPlaceholderEnvValues(name, env) {
  if (!env || typeof env !== "object" || Array.isArray(env)) {
    throw new Error(`${name} env must be an object.`);
  }

  for (const [envName, envValue] of Object.entries(env)) {
    if (typeof envValue !== "string") {
      throw new Error(`${name} env.${envName} must be a string.`);
    }
    if (/^\$\{[^}]+\}$/.test(envValue)) {
      throw new Error(`${name} env.${envName} must not be a literal placeholder.`);
    }
  }
}

const codexExpected = {
  "saguaro-workflow": {
    args: ["mcp-servers/saguaro-workflow/dist/index.mjs"],
    env: { SAGUARO_BUNDLED_WORKFLOWS_DIR: "workflows" },
    env_vars: [
      "EMBEDDINGS_API_KEY",
      "EMBEDDINGS_BASE_URL",
      "EMBEDDINGS_MODEL",
      "SAGUARO_STORAGE_BACKEND",
      "VECTOR_STORE_BASE_URL",
      "VECTOR_STORE_API_KEY",
      "LLM_API_KEY",
      "LLM_BASE_URL",
      "LLM_MODEL",
    ],
  },
  "saguaro-memory": {
    args: ["mcp-servers/saguaro-memory/dist/index.mjs"],
    env: {},
    env_vars: [
      "EMBEDDINGS_API_KEY",
      "EMBEDDINGS_BASE_URL",
      "EMBEDDINGS_MODEL",
      "SAGUARO_STORAGE_BACKEND",
      "VECTOR_STORE_BASE_URL",
      "VECTOR_STORE_API_KEY",
    ],
  },
  "saguaro-knowledge": {
    args: ["mcp-servers/saguaro-knowledge/dist/index.mjs"],
    env: {},
    env_vars: [
      "EMBEDDINGS_API_KEY",
      "EMBEDDINGS_BASE_URL",
      "EMBEDDINGS_MODEL",
      "SAGUARO_STORAGE_BACKEND",
      "VECTOR_STORE_BASE_URL",
      "VECTOR_STORE_API_KEY",
      "LLM_API_KEY",
      "LLM_BASE_URL",
      "LLM_MODEL",
    ],
  },
};

function assertSameStringSet(name, actual, expected, label) {
  assertStringArray(actual, `${name} ${label} must be an array of strings.`);
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);

  for (const value of expectedSet) {
    if (!actualSet.has(value)) {
      throw new Error(`${name} ${label} must include ${value}.`);
    }
  }
  for (const value of actualSet) {
    if (!expectedSet.has(value)) {
      throw new Error(`${name} ${label} must not include unexpected value ${value}.`);
    }
  }
}

for (const file of required) {
  await access(resolve(repoRoot, file));
}

const claudeMarketplace = await readJson("marketplaces/claude/.claude-plugin/marketplace.json");
if (claudeMarketplace.plugins[0].source !== "./plugins/saguaro-agent") {
  throw new Error("Claude marketplace must reference a plugin inside the marketplace root.");
}

const codexMarketplace = await readJson("marketplaces/codex/.agents/plugins/marketplace.json");
if (codexMarketplace.plugins[0].source.path !== "./plugins/saguaro-agent") {
  throw new Error("Codex marketplace must reference a plugin inside the marketplace root.");
}

const codexPlugin = await readJson("marketplaces/codex/plugins/saguaro-agent/.codex-plugin/plugin.json");
if (codexPlugin.mcpServers !== "./.mcp.json") {
  throw new Error("Codex plugin must reference the plugin-local .mcp.json.");
}

const codexMcpPath = "marketplaces/codex/plugins/saguaro-agent/.mcp.json";
const codexMcpRaw = await readFile(resolve(repoRoot, codexMcpPath), "utf8");
assertNoForbiddenCodexManifestContent(codexMcpRaw);

const codexMcp = JSON.parse(codexMcpRaw);
assertSameStringSet("Codex MCP manifest", Object.keys(codexMcp.mcpServers ?? {}), Object.keys(codexExpected), "servers");

for (const [name, entry] of Object.entries(codexMcp.mcpServers)) {
  const expected = codexExpected[name];

  if (entry.command !== "node") {
    throw new Error(`${name} must launch node directly, not a shell wrapper.`);
  }
  assertSameStringSet(name, entry.args, expected.args, "args");
  if (entry.cwd !== ".") {
    throw new Error(`${name} must run with cwd "." so relative MCP paths resolve in Codex's plugin cache.`);
  }
  if (entry.args.some((arg) => arg.includes("${CODEX_PLUGIN_ROOT}"))) {
    throw new Error(`${name} must not rely on unsupported CODEX_PLUGIN_ROOT expansion.`);
  }
  assertNoPlaceholderEnvValues(name, entry.env);
  assertSameStringSet(name, Object.keys(entry.env), Object.keys(expected.env), "env names");
  for (const [envName, envValue] of Object.entries(expected.env)) {
    if (entry.env[envName] !== envValue) {
      throw new Error(`${name} env.${envName} must be ${envValue}.`);
    }
  }
  assertSameStringSet(name, entry.env_vars, expected.env_vars, "env_vars");
}

const cursorPlugin = await readJson("marketplaces/claude/plugins/saguaro-agent/.cursor-plugin/plugin.json");
if (cursorPlugin.mcpServers !== "./mcp.json") {
  throw new Error("Cursor plugin must reference the plugin-local mcp.json.");
}

const cursorMcpPath = "marketplaces/claude/plugins/saguaro-agent/mcp.json";
const cursorMcpRaw = await readFile(resolve(repoRoot, cursorMcpPath), "utf8");
assertNoForbiddenCodexManifestContent(cursorMcpRaw);

const cursorMcp = JSON.parse(cursorMcpRaw);
assertSameStringSet("Cursor MCP manifest", Object.keys(cursorMcp.mcpServers ?? {}), Object.keys(codexExpected), "servers");

for (const [name, entry] of Object.entries(cursorMcp.mcpServers)) {
  const expected = codexExpected[name];

  if (entry.command !== "node") {
    throw new Error(`Cursor ${name} must launch node directly, not a shell wrapper.`);
  }
  assertSameStringSet(`Cursor ${name}`, entry.args, expected.args, "args");
  if (entry.cwd !== ".") {
    throw new Error(`Cursor ${name} must run with cwd "." so relative MCP paths resolve at the plugin root.`);
  }
  assertNoPlaceholderEnvValues(`Cursor ${name}`, entry.env);
  assertSameStringSet(`Cursor ${name}`, Object.keys(entry.env), Object.keys(expected.env), "env names");
  for (const [envName, envValue] of Object.entries(expected.env)) {
    if (entry.env[envName] !== envValue) {
      throw new Error(`Cursor ${name} env.${envName} must be ${envValue}.`);
    }
  }
}

console.log("Marketplace artifact validation passed.");
