// mcp-servers/core/src/storage/__tests__/backend-factory.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveStorageBackendName } from "../backend-factory.js";
import type { StorageRuntime } from "../types.js";

function runtime(config: StorageRuntime["config"] = {}): StorageRuntime {
  return {
    config,
    paths: {
      projectRoot: "/tmp/x",
      configPath: "/tmp/x/.saguaro/config.yaml",
      runsDir: "/tmp/x/.saguaro/runs",
      memoryDataDir: "/tmp/x/.saguaro/data/memory",
      knowledgeDataDir: "/tmp/x/.saguaro/data/knowledge",
    },
  };
}

const STORAGE_ENV = ["SAGUARO_STORAGE_BACKEND", "VECTOR_STORE_BASE_URL", "SAGUARO_VECTOR_STORE_BASE_URL"];

function clearStorageEnv() {
  for (const key of STORAGE_ENV) delete process.env[key];
}

beforeEach(clearStorageEnv);
afterEach(clearStorageEnv);

describe("resolveStorageBackendName", () => {
  it("defaults to filesystem when nothing is configured", () => {
    expect(resolveStorageBackendName(runtime())).toBe("filesystem");
  });

  it("infers chromadb from VECTOR_STORE_BASE_URL", () => {
    process.env.VECTOR_STORE_BASE_URL = "http://chroma.test:8000";
    expect(resolveStorageBackendName(runtime())).toBe("chromadb");
  });

  it("honors an explicit SAGUARO_STORAGE_BACKEND over inference", () => {
    process.env.VECTOR_STORE_BASE_URL = "http://chroma.test:8000";
    process.env.SAGUARO_STORAGE_BACKEND = "filesystem";
    expect(resolveStorageBackendName(runtime())).toBe("filesystem");
  });

  it("honors an explicit config selector", () => {
    expect(resolveStorageBackendName(runtime({ storage: { backend: "chromadb" } }))).toBe("chromadb");
  });

  it("rejects an unknown selector value", () => {
    process.env.SAGUARO_STORAGE_BACKEND = "weaviate";
    expect(() => resolveStorageBackendName(runtime())).toThrow(/Unknown SAGUARO_STORAGE_BACKEND/);
  });
});
