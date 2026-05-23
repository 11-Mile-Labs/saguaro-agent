#!/usr/bin/env node
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const marketplacesRoot = resolve(repoRoot, "marketplaces");
const version = JSON.parse(await readFile(resolve(repoRoot, "package.json"), "utf8")).version;

const servers = {
  "saguaro-workflow": {
    path: "mcp-servers/saguaro-workflow/dist/index.mjs",
    needsChat: true,
    needsBundledWorkflows: true,
  },
  "saguaro-memory": {
    path: "mcp-servers/saguaro-memory/dist/index.mjs",
    needsChat: false,
    needsBundledWorkflows: false,
  },
  "saguaro-knowledge": {
    path: "mcp-servers/saguaro-knowledge/dist/index.mjs",
    needsChat: true,
    needsBundledWorkflows: false,
  },
};

function commonEnv({ needsChat, workflowsDir }) {
  return {
    EMBEDDINGS_API_KEY: "${EMBEDDINGS_API_KEY}",
    EMBEDDINGS_BASE_URL: "${EMBEDDINGS_BASE_URL}",
    EMBEDDINGS_MODEL: "${EMBEDDINGS_MODEL}",
    SAGUARO_STORAGE_BACKEND: "${SAGUARO_STORAGE_BACKEND}",
    VECTOR_STORE_BASE_URL: "${VECTOR_STORE_BASE_URL}",
    VECTOR_STORE_API_KEY: "${VECTOR_STORE_API_KEY}",
    ...(workflowsDir ? { SAGUARO_BUNDLED_WORKFLOWS_DIR: workflowsDir } : {}),
    ...(needsChat
      ? {
          LLM_API_KEY: "${LLM_API_KEY}",
          LLM_BASE_URL: "${LLM_BASE_URL}",
          LLM_MODEL: "${LLM_MODEL}",
        }
      : {}),
  };
}

function forwardedEnvVarNames({ needsChat }) {
  return Object.keys(commonEnv({ needsChat }));
}

function absoluteMcpServers(rootPlaceholder) {
  return Object.fromEntries(
    Object.entries(servers).map(([name, server]) => [
      name,
      {
        command: "node",
        args: [`${rootPlaceholder}/${server.path}`],
        env: commonEnv({
          needsChat: server.needsChat,
          workflowsDir: server.needsBundledWorkflows ? `${rootPlaceholder}/workflows` : undefined,
        }),
      },
    ])
  );
}

function codexMcpServers() {
  return Object.fromEntries(
    Object.entries(servers).map(([name, server]) => [
      name,
      {
        command: "node",
        args: [server.path],
        cwd: ".",
        env: server.needsBundledWorkflows ? { SAGUARO_BUNDLED_WORKFLOWS_DIR: "workflows" } : {},
        env_vars: forwardedEnvVarNames({ needsChat: server.needsChat }),
      },
    ])
  );
}

function geminiMcpServers() {
  return Object.fromEntries(
    Object.entries(servers).map(([name, server]) => [
      name,
      {
        command: "node",
        args: [`${"${extensionPath}"}/${server.path}`],
        env: server.needsBundledWorkflows
          ? { SAGUARO_BUNDLED_WORKFLOWS_DIR: `${"${extensionPath}"}/workflows` }
          : {},
      },
    ])
  );
}

async function writeJson(path, value) {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function copyDist(target, serverName) {
  const source = resolve(repoRoot, "mcp-servers", serverName, "dist");
  const destination = resolve(target, "mcp-servers", serverName, "dist");
  await mkdir(resolve(destination, ".."), { recursive: true });
  await cp(source, destination, { recursive: true });
}

async function copyCommon(target) {
  await mkdir(target, { recursive: true });
  await cp(resolve(repoRoot, "skills"), resolve(target, "skills"), { recursive: true });
  await cp(resolve(repoRoot, "workflows"), resolve(target, "workflows"), { recursive: true });
  await cp(resolve(repoRoot, "docs"), resolve(target, "docs"), { recursive: true });
  await cp(resolve(repoRoot, "README.md"), resolve(target, "README.md"));
  await cp(resolve(repoRoot, "LICENSE"), resolve(target, "LICENSE"));
  for (const serverName of Object.keys(servers)) {
    await copyDist(target, serverName);
  }
}

function pluginMetadata() {
  return {
    name: "saguaro-agent",
    version,
    description: "Saguaro workflow, memory, and knowledge MCP servers.",
    author: {
      name: "11 Mile Labs",
      url: "https://github.com/11-Mile-Labs",
    },
    homepage: "https://github.com/11-Mile-Labs/saguaro-agent",
    repository: "https://github.com/11-Mile-Labs/saguaro-agent",
    license: "MIT",
    keywords: ["mcp", "workflow", "memory", "knowledge"],
  };
}

async function buildClaude() {
  const target = resolve(marketplacesRoot, "claude", "plugins", "saguaro-agent");
  await copyCommon(target);
  await writeJson(resolve(target, ".claude-plugin", "plugin.json"), {
    ...pluginMetadata(),
    skills: "./skills",
    mcpServers: absoluteMcpServers("${CLAUDE_PLUGIN_ROOT}"),
  });
}

async function buildCodex() {
  const target = resolve(marketplacesRoot, "codex", "plugins", "saguaro-agent");
  await copyCommon(target);
  await writeJson(resolve(target, ".mcp.json"), { mcpServers: codexMcpServers() });
  await writeJson(resolve(target, ".codex-plugin", "plugin.json"), {
    ...pluginMetadata(),
    displayName: "Saguaro",
    skills: "./skills",
    mcpServers: "./.mcp.json",
  });
}

async function buildGemini() {
  const target = resolve(marketplacesRoot, "gemini", "extensions", "saguaro-agent");
  await copyCommon(target);
  await cp(resolve(repoRoot, "GEMINI.md"), resolve(target, "GEMINI.md"));
  await writeJson(resolve(target, "gemini-extension.json"), {
    name: "saguaro-agent",
    version,
    description:
      "Saguaro provides project-local workflow orchestration, persistent memory, and durable knowledge for AI coding harnesses.",
    contextFileName: "GEMINI.md",
    skillsDir: "skills",
    mcpServers: geminiMcpServers(),
  });
}

async function buildMarketplaceCatalogs() {
  await writeJson(resolve(marketplacesRoot, "claude", ".claude-plugin", "marketplace.json"), {
    name: "saguaro",
    description: "Saguaro plugin marketplace for Claude Code.",
    owner: {
      name: "11 Mile Labs",
      url: "https://github.com/11-Mile-Labs",
    },
    plugins: [
      {
        name: "saguaro-agent",
        version,
        description: "Saguaro workflow, memory, and knowledge MCP servers.",
        source: "./plugins/saguaro-agent",
        category: "Coding",
      },
    ],
  });

  await writeJson(resolve(marketplacesRoot, "codex", ".agents", "plugins", "marketplace.json"), {
    name: "saguaro",
    interface: {
      displayName: "Saguaro",
    },
    plugins: [
      {
        name: "saguaro-agent",
        version,
        description: "Saguaro workflow, memory, and knowledge MCP servers.",
        source: {
          source: "local",
          path: "./plugins/saguaro-agent",
        },
        policy: {
          installation: "AVAILABLE",
          authentication: "ON_INSTALL",
        },
        category: "Coding",
      },
    ],
  });
}

await rm(marketplacesRoot, { recursive: true, force: true });
await buildClaude();
await buildCodex();
await buildGemini();
await buildMarketplaceCatalogs();
console.log("Generated Saguaro marketplace install artifacts.");
