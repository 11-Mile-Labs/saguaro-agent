#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const command = process.argv[2] ?? "help";

function env(name, fallback = "") {
  return process.env[name] ?? fallback;
}

function storageBackend() {
  const explicit = process.env.SAGUARO_STORAGE_BACKEND?.trim().toLowerCase();
  if (explicit === "chromadb" || explicit === "filesystem") {
    return explicit;
  }

  return process.env.SAGUARO_VECTOR_STORE_BASE_URL || process.env.VECTOR_STORE_BASE_URL
    ? "chromadb"
    : "filesystem";
}

function configTemplate() {
  return `embeddings:
  base_url: "${env("EMBEDDINGS_BASE_URL", "http://localhost:1234/v1")}"
  model: "${env("EMBEDDINGS_MODEL", "text-embedding-bge-m3")}"
  api_key_env: EMBEDDINGS_API_KEY

llm:
  base_url: "${env("LLM_BASE_URL", "http://localhost:1234/v1")}"
  model: "${env("LLM_MODEL", "local-chat")}"
  api_key_env: LLM_API_KEY
  temperature: 0

redaction:
  enabled: true
  disabled_rules: ""
  additional_allow_patterns: ""

storage:
  backend: ${storageBackend()}

memory:
  collection: "saguaro_memory"

knowledge:
  collection: "saguaro_knowledge"
  chunk_size: 900

workflows_dir: .saguaro/workflows
runs_dir: .saguaro/runs
`;
}

async function init() {
  const root = resolve(process.cwd());
  const saguaroDir = resolve(root, ".saguaro");
  const workflowsDir = resolve(saguaroDir, "workflows");
  const configPath = resolve(saguaroDir, "config.yaml");

  await mkdir(workflowsDir, { recursive: true });
  if (!existsSync(configPath)) {
    await writeFile(configPath, configTemplate(), "utf8");
    console.log(`Created ${configPath}`);
  } else {
    console.log(`${configPath} already exists`);
  }
}

function runScript(name) {
  const child = spawn(process.execPath, [new URL(`../scripts/${name}`, import.meta.url).pathname], {
    stdio: "inherit",
    env: process.env,
  });
  child.on("exit", (code) => process.exit(code ?? 1));
}

switch (command) {
  case "init":
    await init();
    break;
  case "doctor":
    runScript("doctor.mjs");
    break;
  case "smoke":
    runScript("smoke-local.mjs");
    break;
  default:
    console.log("Usage: saguaro <init|doctor|smoke>");
    break;
}
