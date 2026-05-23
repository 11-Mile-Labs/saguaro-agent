// mcp-servers/core/src/storage/__tests__/migrate.test.ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FilesystemBackend } from "../backends/filesystem-backend.js";
import { writeJsonFileAtomic } from "../filesystem.js";
import { migrateLegacyData } from "../migrate.js";
import { storedToKnowledgeDocuments, storedToMemory } from "../record-mappers.js";
import type { KnowledgeDocumentRecord, MemoryRecord } from "../types.js";

const memory: MemoryRecord = {
  id: "mem_legacy",
  vectorId: "vec_legacy",
  content: "Legacy memory content.",
  embedding: [0.4, 0.5, 0.6],
  scope: "project",
  tags: ["legacy"],
  storedAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const doc: KnowledgeDocumentRecord = {
  documentId: "doc_legacy",
  title: "Legacy Doc",
  content: "Legacy body.",
  scope: "project",
  tags: ["legacy"],
  ingestedAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  chunks: [{ id: "c0", documentId: "doc_legacy", index: 0, content: "Legacy body.", embedding: [0.7, 0.8] }],
};

describe("migrateLegacyData", () => {
  it("imports memory and knowledge JSON, preserving embedding vectors", async () => {
    const root = await mkdtemp(join(tmpdir(), "saguaro-migrate-"));
    const memoryDir = join(root, ".saguaro", "data", "memory");
    const knowledgeDir = join(root, ".saguaro", "data", "knowledge");
    await writeJsonFileAtomic(join(memoryDir, "project.json"), [memory]);
    await writeJsonFileAtomic(join(knowledgeDir, "project.json"), [doc]);

    // Migrate into a *separate* filesystem backend to prove the records moved.
    const targetMemoryDir = join(root, "target", "memory");
    const targetKnowledgeDir = join(root, "target", "knowledge");
    const backend = new FilesystemBackend({ memoryDir: targetMemoryDir, knowledgeDir: targetKnowledgeDir });

    const summary = await migrateLegacyData({ memoryDir, knowledgeDir }, backend);

    expect(summary).toEqual({ memoriesMigrated: 1, knowledgeDocumentsMigrated: 1, chunksMigrated: 1 });

    const migratedMemory = (await backend.list({ namespace: "memory", scope: "project" })).map(storedToMemory);
    expect(migratedMemory).toHaveLength(1);
    expect(migratedMemory[0]?.embedding).toEqual([0.4, 0.5, 0.6]);

    const migratedDocs = storedToKnowledgeDocuments(
      await backend.list({ namespace: "knowledge", scope: "project" }),
    );
    expect(migratedDocs[0]?.chunks[0]?.embedding).toEqual([0.7, 0.8]);
  });

  it("is a no-op when there is no legacy data", async () => {
    const root = await mkdtemp(join(tmpdir(), "saguaro-migrate-empty-"));
    const backend = new FilesystemBackend({
      memoryDir: join(root, "t", "memory"),
      knowledgeDir: join(root, "t", "knowledge"),
    });
    const summary = await migrateLegacyData(
      { memoryDir: join(root, "missing", "memory"), knowledgeDir: join(root, "missing", "knowledge") },
      backend,
    );
    expect(summary).toEqual({ memoriesMigrated: 0, knowledgeDocumentsMigrated: 0, chunksMigrated: 0 });
  });

  it("routes run/project data under projectId but keeps global cross-project", async () => {
    const root = await mkdtemp(join(tmpdir(), "saguaro-migrate-scoped-"));
    const memoryDir = join(root, ".saguaro", "data", "memory");
    const knowledgeDir = join(root, ".saguaro", "data", "knowledge");
    await writeJsonFileAtomic(join(memoryDir, "project.json"), [memory]);
    await writeJsonFileAtomic(join(memoryDir, "global.json"), [
      { ...memory, id: "mem_global", scope: "global" },
    ]);

    const backend = new FilesystemBackend({
      memoryDir: join(root, "target", "memory"),
      knowledgeDir: join(root, "target", "knowledge"),
    });
    await migrateLegacyData({ memoryDir, knowledgeDir }, backend, { projectId: "dotman" });

    const scoped = await backend.list({ namespace: "memory", scope: "project", projectId: "dotman" });
    const shared = await backend.list({ namespace: "memory", scope: "global" });
    expect(scoped.map((r) => r.id)).toEqual(["mem_legacy"]);
    expect(shared.map((r) => r.id)).toEqual(["mem_global"]);
  });
});
