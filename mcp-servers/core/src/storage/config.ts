import { existsSync, readFileSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import { findProjectRoot } from "../config.js";
import type { SaguaroConfig, StorageRuntime } from "./types.js";

interface CreateStorageRuntimeOptions {
  projectRoot?: string;
  configPath?: string;
}

function resolveProjectPath(projectRoot: string, rawPath: string): string {
  return isAbsolute(rawPath) ? rawPath : resolve(projectRoot, rawPath);
}

function resolveConfigPath(projectRoot: string, configPath?: string): string {
  if (!configPath) {
    return join(projectRoot, ".saguaro", "config.yaml");
  }
  return isAbsolute(configPath) ? configPath : resolve(projectRoot, configPath);
}

function parseScalar(rawValue: string): unknown {
  const value = rawValue.trim();
  if (!value.length) {
    return "";
  }
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (value === "null") {
    return null;
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }
  return value;
}

function parseSimpleYaml(raw: string): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  const stack: Array<{ indent: number; target: Record<string, unknown> }> = [{ indent: -1, target: root }];

  for (const rawLine of raw.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) {
      continue;
    }

    const indent = rawLine.length - rawLine.trimStart().length;
    const line = rawLine.trim();
    const colonIndex = line.indexOf(":");

    if (colonIndex < 0) {
      continue;
    }

    const key = line.slice(0, colonIndex).trim();
    const remainder = line.slice(colonIndex + 1).trim();

    while (stack.length > 1 && indent <= stack[stack.length - 1]!.indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1]!.target;
    if (!remainder.length) {
      const nested: Record<string, unknown> = {};
      parent[key] = nested;
      stack.push({ indent, target: nested });
      continue;
    }

    parent[key] = parseScalar(remainder);
  }

  return root;
}

function loadConfig(configPath: string): SaguaroConfig {
  if (!existsSync(configPath)) {
    return {};
  }

  const raw = readFileSync(configPath, "utf8");
  const parsed = parseSimpleYaml(raw);

  if (!parsed) {
    return {};
  }

  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Expected ${configPath} to contain a YAML object.`);
  }

  return parsed as SaguaroConfig;
}

const PROJECT_ID_SLUG = /^[a-z0-9][a-z0-9._-]*$/;

/** The project-root basename, lowercased to a slug. Undefined when it cannot form one. */
function deriveProjectId(projectRoot: string): string | undefined {
  const slug = basename(projectRoot).toLowerCase();
  return PROJECT_ID_SLUG.test(slug) ? slug : undefined;
}

export function createStorageRuntime(options: CreateStorageRuntimeOptions = {}): StorageRuntime {
  const projectRoot = resolve(
    options.projectRoot ?? process.env.SAGUARO_PROJECT_ROOT ?? findProjectRoot(),
  );
  const configPath = resolveConfigPath(projectRoot, options.configPath ?? process.env.SAGUARO_CONFIG_PATH);
  const config = loadConfig(configPath);

  return {
    config,
    paths: {
      projectRoot,
      configPath,
      runsDir: resolveProjectPath(projectRoot, config.runs_dir ?? ".saguaro/runs"),
      memoryDataDir: resolveProjectPath(
        projectRoot,
        config.memory?.data_dir ?? config.memory?.path ?? ".saguaro/data/memory",
      ),
      knowledgeDataDir: resolveProjectPath(
        projectRoot,
        config.knowledge?.data_dir ?? config.knowledge?.path ?? ".saguaro/data/knowledge",
      ),
    },
    projectId: deriveProjectId(projectRoot),
  };
}

/** Resolve project-local storage paths for a tool call (same root semantics as workflow_* project_path). */
export function resolveStorageRuntimeForToolArgs(
  args: Record<string, unknown>,
  options: CreateStorageRuntimeOptions = {},
): StorageRuntime {
  const projectPath = typeof args.project_path === "string" ? args.project_path.trim() : undefined;
  return createStorageRuntime({
    ...options,
    projectRoot: projectPath || options.projectRoot,
  });
}
