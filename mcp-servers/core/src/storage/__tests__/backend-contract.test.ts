// mcp-servers/core/src/storage/__tests__/backend-contract.test.ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { CollectionKey, StorageBackend, StoredRecord } from "../backend.js";
import { ChromaDbBackend } from "../backends/chromadb-backend.js";
import { FilesystemBackend } from "../backends/filesystem-backend.js";

const KEY: CollectionKey = { namespace: "memory", scope: "project" };

function record(id: string, vector: number[], doc = id): StoredRecord {
  return { id, vector, document: doc, metadata: { scope: "project" } };
}

/** Shared adapter-contract assertions. Reused by the ChromaDB integration test. */
export function runBackendContract(name: string, makeBackend: () => Promise<StorageBackend>): void {
  describe(`StorageBackend contract: ${name}`, () => {
    it("upserts then lists records", async () => {
      const backend = await makeBackend();
      await backend.upsert(KEY, [record("a", [1, 0]), record("b", [0, 1])]);
      const all = await backend.list(KEY);
      expect(all.map((r) => r.id).sort()).toEqual(["a", "b"]);
    });

    it("upsert replaces a record with the same id", async () => {
      const backend = await makeBackend();
      await backend.upsert(KEY, [record("a", [1, 0], "first")]);
      await backend.upsert(KEY, [record("a", [1, 0], "second")]);
      const all = await backend.list(KEY);
      expect(all).toHaveLength(1);
      expect(all[0]?.document).toBe("second");
    });

    it("gets a record by id and returns undefined when absent", async () => {
      const backend = await makeBackend();
      await backend.upsert(KEY, [record("a", [1, 0])]);
      expect((await backend.get(KEY, "a"))?.id).toBe("a");
      expect(await backend.get(KEY, "missing")).toBeUndefined();
    });

    it("ranks query results by cosine similarity", async () => {
      const backend = await makeBackend();
      await backend.upsert(KEY, [record("near", [1, 0]), record("far", [0, 1])]);
      const results = await backend.query(KEY, [1, 0], 2);
      expect(results[0]?.id).toBe("near");
      expect(results[0]?.score).toBeGreaterThan(results[1]?.score ?? 1);
    });

    it("deletes a record by id", async () => {
      const backend = await makeBackend();
      await backend.upsert(KEY, [record("a", [1, 0]), record("b", [0, 1])]);
      await backend.delete(KEY, "a");
      expect((await backend.list(KEY)).map((r) => r.id)).toEqual(["b"]);
    });

    it("isolates collections by scope and projectId", async () => {
      const backend = await makeBackend();
      await backend.upsert({ namespace: "memory", scope: "project" }, [record("shared", [1, 0])]);
      await backend.upsert({ namespace: "memory", scope: "project", projectId: "other" }, [record("scoped", [1, 0])]);
      const shared = await backend.list({ namespace: "memory", scope: "project" });
      const scoped = await backend.list({ namespace: "memory", scope: "project", projectId: "other" });
      expect(shared.map((r) => r.id)).toEqual(["shared"]);
      expect(scoped.map((r) => r.id)).toEqual(["scoped"]);
    });
  });
}

runBackendContract("filesystem", async () => {
  const root = await mkdtemp(join(tmpdir(), "saguaro-fs-backend-"));
  return new FilesystemBackend({
    memoryDir: join(root, ".saguaro", "data", "memory"),
    knowledgeDir: join(root, ".saguaro", "data", "knowledge"),
  });
});

const chromaUrl = process.env.VECTOR_STORE_BASE_URL ?? process.env.SAGUARO_VECTOR_STORE_BASE_URL;

// Guarded: only runs when a ChromaDB server is configured.
(chromaUrl ? runBackendContract : (() => {}))("chromadb", async () => {
  // Unique prefixes per run keep repeated test runs from colliding in shared collections.
  const stamp = `it${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  return new ChromaDbBackend({
    baseUrl: chromaUrl as string,
    apiKey: process.env.VECTOR_STORE_API_KEY ?? process.env.SAGUARO_VECTOR_STORE_API_KEY,
    memoryCollection: `${stamp}_memory`,
    knowledgeCollection: `${stamp}_knowledge`,
  });
});
