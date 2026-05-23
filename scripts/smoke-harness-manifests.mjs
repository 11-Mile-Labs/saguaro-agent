#!/usr/bin/env node
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function createProject() {
  const projectRoot = await mkdtemp(join(tmpdir(), "saguaro-harness-smoke-"));
  await mkdir(join(projectRoot, ".saguaro"), { recursive: true });
  await writeFile(join(projectRoot, ".saguaro", "config.yaml"), `embeddings:
  base_url: http://127.0.0.1:65535/v1
  model: smoke-embedding
  api_key_env: EMBEDDINGS_API_KEY
llm:
  base_url: http://127.0.0.1:65535/v1
  model: smoke-chat
  api_key_env: LLM_API_KEY
model_tiers:
  claude:
    standard: claude-standard-smoke
    deep: claude-deep-smoke
    surgeon: claude-surgeon-smoke
  codex:
    standard: codex-standard-smoke
    deep: codex-deep-smoke
    surgeon: codex-surgeon-smoke
  gemini:
    standard: gemini-standard-smoke
    deep: gemini-deep-smoke
    surgeon: gemini-surgeon-smoke
workflows_dir: .saguaro/workflows
runs_dir: .saguaro/runs
`, "utf8");
  return projectRoot;
}

function replacePlaceholders(value, packageRoot) {
  return value
    .replaceAll("${CLAUDE_PLUGIN_ROOT}", packageRoot)
    .replaceAll("${CODEX_PLUGIN_ROOT}", packageRoot)
    .replaceAll("${GEMINI_EXTENSION_ROOT}", packageRoot)
    .replaceAll("${extensionPath}", packageRoot);
}

function resolveCommand(entry, packageRoot) {
  const command = replacePlaceholders(entry.command, packageRoot);
  const args = (entry.args ?? []).map((arg) => {
    const replaced = replacePlaceholders(arg, packageRoot);
    return replaced.endsWith(".mjs") && !replaced.startsWith("/")
      ? resolve(packageRoot, replaced)
      : replaced;
  });
  return { command, args };
}

function resolveEnv(entry, projectRoot, harness, packageRoot) {
  const env = {
    ...process.env,
    SAGUARO_PROJECT_ROOT: projectRoot,
    SAGUARO_HARNESS: harness,
    EMBEDDINGS_API_KEY: "smoke-embeddings",
    EMBEDDINGS_BASE_URL: "http://127.0.0.1:65535/v1",
    EMBEDDINGS_MODEL: "smoke-embedding",
    LLM_API_KEY: "smoke-llm",
    LLM_BASE_URL: "http://127.0.0.1:65535/v1",
    LLM_MODEL: "smoke-chat",
    SAGUARO_STORAGE_BACKEND: "filesystem",
    VECTOR_STORE_BASE_URL: "",
    VECTOR_STORE_API_KEY: "",
  };

  for (const [key, raw] of Object.entries(entry.env ?? {})) {
    if (typeof raw === "string" && raw.startsWith("${") && raw.endsWith("}")) {
      env[key] = env[raw.slice(2, -1)] ?? "";
    } else if (typeof raw === "string") {
      env[key] = replacePlaceholders(raw, packageRoot);
    }
  }

  return env;
}

class JsonRpcProcess {
  constructor(entry, projectRoot, harness, packageRoot) {
    const { command, args } = resolveCommand(entry, packageRoot);
    this.child = spawn(command, args, {
      cwd: entry.cwd === "." ? packageRoot : projectRoot,
      env: resolveEnv(entry, projectRoot, harness, packageRoot),
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = "";
    this.stderr = "";

    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => {
      this.buffer += chunk;
      this.drain();
    });
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (chunk) => {
      this.stderr += chunk;
    });
    this.child.on("exit", (code) => {
      for (const reject of this.pending.values()) {
        reject(new Error(`MCP process exited with ${code}: ${this.stderr}`));
      }
      this.pending.clear();
    });
  }

  drain() {
    while (this.buffer.includes("\n")) {
      const index = this.buffer.indexOf("\n");
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      if (message.id && this.pending.has(message.id)) {
        const resolveMessage = this.pending.get(message.id);
        this.pending.delete(message.id);
        resolveMessage(message);
      }
    }
  }

  call(method, params = {}) {
    const id = this.nextId++;
    const payload = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolveMessage, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for ${method}: ${this.stderr}`));
      }, 10_000);
      this.pending.set(id, (message) => {
        clearTimeout(timer);
        if (message.error) {
          reject(new Error(`${method} failed: ${JSON.stringify(message.error)}`));
        } else {
          resolveMessage(message.result);
        }
      });
      this.child.stdin.write(`${JSON.stringify(payload)}\n`);
    });
  }

  notify(method, params = {}) {
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }

  async close() {
    this.child.kill("SIGTERM");
  }
}

async function loadHarnessManifest(name) {
  if (name === "claude") {
    const packageRoot = resolve(repoRoot, "marketplaces", "claude", "plugins", "saguaro-agent");
    const plugin = await readJson(resolve(packageRoot, ".claude-plugin", "plugin.json"));
    return { packageRoot, servers: plugin.mcpServers };
  }
  if (name === "codex") {
    const packageRoot = resolve(repoRoot, "marketplaces", "codex", "plugins", "saguaro-agent");
    const plugin = await readJson(resolve(packageRoot, ".codex-plugin", "plugin.json"));
    const mcp = await readJson(resolve(packageRoot, plugin.mcpServers));
    return { packageRoot, servers: mcp.mcpServers };
  }
  const packageRoot = resolve(repoRoot, "marketplaces", "gemini", "extensions", "saguaro-agent");
  const extension = await readJson(resolve(packageRoot, "gemini-extension.json"));
  return { packageRoot, servers: extension.mcpServers };
}

async function smokeServer(harness, serverName, entry, projectRoot, packageRoot) {
  const client = new JsonRpcProcess(entry, projectRoot, harness, packageRoot);
  try {
    await client.call("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "saguaro-harness-smoke", version: "0.0.0" },
    });
    client.notify("notifications/initialized");
    const tools = await client.call("tools/list");
    const toolNames = new Set((tools.tools ?? []).map((tool) => tool.name));
    const expected = {
      "saguaro-workflow": "workflow_list",
      "saguaro-memory": "memory_status",
      "saguaro-knowledge": "knowledge_list",
    }[serverName];
    if (!toolNames.has(expected)) {
      throw new Error(`${harness}/${serverName} did not expose ${expected}`);
    }
    await client.call("tools/call", {
      name: expected,
      arguments: serverName === "saguaro-workflow" ? { project_path: projectRoot } : {},
    });
    console.log(`ok ${harness}/${serverName}`);
  } finally {
    await client.close();
  }
}

const projectRoot = await createProject();
try {
  for (const harness of ["claude", "codex", "gemini"]) {
    const { packageRoot, servers } = await loadHarnessManifest(harness);
    for (const serverName of ["saguaro-workflow", "saguaro-memory", "saguaro-knowledge"]) {
      if (!servers[serverName]) {
        throw new Error(`${harness} manifest is missing ${serverName}`);
      }
      await smokeServer(harness, serverName, servers[serverName], projectRoot, packageRoot);
    }
  }
} finally {
  await rm(projectRoot, { recursive: true, force: true });
}
