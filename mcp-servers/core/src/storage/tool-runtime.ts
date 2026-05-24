import { createStorageRuntime, resolveStorageRuntimeForToolArgs } from "./config.js";
import { resolveStorageBackend } from "./backend-factory.js";
import { MemoryStorage } from "./memory-store.js";
import { KnowledgeStorage } from "./knowledge-store.js";
import type { StorageRuntime } from "./types.js";

export interface ToolRuntimeOptions {
  /** Test hook: default project root when tool args omit project_path. */
  defaultProjectRoot?: string;
}

interface CachedMemoryContext {
  runtime: StorageRuntime;
  storage: MemoryStorage;
}

interface CachedKnowledgeContext {
  runtime: StorageRuntime;
  storage: KnowledgeStorage;
}

const memoryCache = new Map<string, CachedMemoryContext>();
const knowledgeCache = new Map<string, CachedKnowledgeContext>();

function resolveRuntime(args: Record<string, unknown>, options: ToolRuntimeOptions): StorageRuntime {
  return options.defaultProjectRoot
    ? resolveStorageRuntimeForToolArgs(args, { projectRoot: options.defaultProjectRoot })
    : resolveStorageRuntimeForToolArgs(args);
}

export function resolveMemoryToolContext(
  args: Record<string, unknown>,
  options: ToolRuntimeOptions = {},
): CachedMemoryContext {
  const runtime = resolveRuntime(args, options);
  const key = runtime.paths.projectRoot;
  const cached = memoryCache.get(key);
  if (cached) {
    return cached;
  }

  const context: CachedMemoryContext = {
    runtime,
    storage: new MemoryStorage(runtime, resolveStorageBackend(runtime)),
  };
  memoryCache.set(key, context);
  return context;
}

export function resolveKnowledgeToolContext(
  args: Record<string, unknown>,
  options: ToolRuntimeOptions = {},
): CachedKnowledgeContext {
  const runtime = resolveRuntime(args, options);
  const key = runtime.paths.projectRoot;
  const cached = knowledgeCache.get(key);
  if (cached) {
    return cached;
  }

  const context: CachedKnowledgeContext = {
    runtime,
    storage: new KnowledgeStorage(runtime, resolveStorageBackend(runtime)),
  };
  knowledgeCache.set(key, context);
  return context;
}

/** @internal test helper */
export function clearToolRuntimeCaches(): void {
  memoryCache.clear();
  knowledgeCache.clear();
}
