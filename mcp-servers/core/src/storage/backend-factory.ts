// mcp-servers/core/src/storage/backend-factory.ts
import type { StorageBackend } from "./backend.js";
import { ChromaDbBackend } from "./backends/chromadb-backend.js";
import { FilesystemBackend } from "./backends/filesystem-backend.js";
import type { StorageRuntime } from "./types.js";

export type StorageBackendFactory = (runtime: StorageRuntime) => StorageBackend;

let testFactory: StorageBackendFactory | undefined;

/** Test seam: force a backend regardless of env/config. Pass undefined to restore. */
export function setStorageBackendFactoryForTests(factory: StorageBackendFactory | undefined): void {
  testFactory = factory;
}

function envValue(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

/**
 * Resolution order: explicit selector (config or SAGUARO_STORAGE_BACKEND) ->
 * inferred from VECTOR_STORE_BASE_URL presence -> filesystem fallback.
 */
export function resolveStorageBackendName(runtime: StorageRuntime): "filesystem" | "chromadb" {
  const explicit = runtime.config.storage?.backend ?? envValue("SAGUARO_STORAGE_BACKEND");
  if (explicit) {
    const normalized = explicit.toLowerCase();
    if (normalized !== "filesystem" && normalized !== "chromadb") {
      throw new Error(
        `Unknown SAGUARO_STORAGE_BACKEND "${explicit}". Expected "chromadb" or "filesystem".`,
      );
    }
    return normalized;
  }
  return envValue("SAGUARO_VECTOR_STORE_BASE_URL", "VECTOR_STORE_BASE_URL") ? "chromadb" : "filesystem";
}

/** Construct the configured storage backend. */
export function resolveStorageBackend(runtime: StorageRuntime): StorageBackend {
  if (testFactory) return testFactory(runtime);

  if (resolveStorageBackendName(runtime) === "filesystem") {
    return new FilesystemBackend({
      memoryDir: runtime.paths.memoryDataDir,
      knowledgeDir: runtime.paths.knowledgeDataDir,
    });
  }

  const baseUrl =
    envValue("SAGUARO_VECTOR_STORE_BASE_URL", "VECTOR_STORE_BASE_URL") ??
    runtime.config.storage?.vector_store_base_url;
  if (!baseUrl) {
    throw new Error(
      'Storage backend "chromadb" is selected but VECTOR_STORE_BASE_URL is not set. ' +
        "Set VECTOR_STORE_BASE_URL or switch SAGUARO_STORAGE_BACKEND to filesystem.",
    );
  }
  return new ChromaDbBackend({
    baseUrl,
    apiKey: envValue("SAGUARO_VECTOR_STORE_API_KEY", "VECTOR_STORE_API_KEY"),
    memoryCollection: runtime.config.memory?.collection ?? "saguaro_memory",
    knowledgeCollection: runtime.config.knowledge?.collection ?? "saguaro_knowledge",
  });
}
