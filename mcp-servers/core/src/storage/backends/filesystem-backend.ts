// mcp-servers/core/src/storage/backends/filesystem-backend.ts
import { dirname, join } from "node:path";
import { assertProjectId } from "../backend.js";
import type { CollectionKey, ScoredRecord, StorageBackend, StoredRecord } from "../backend.js";
import { readJsonFile, writeJsonFileAtomic } from "../filesystem.js";
import { cosineScore } from "../vector-score.js";

export interface FilesystemBackendPaths {
  /** Boot-time memory data dir, e.g. <root>/.saguaro/data/memory */
  memoryDir: string;
  /** Boot-time knowledge data dir, e.g. <root>/.saguaro/data/knowledge */
  knowledgeDir: string;
}

/** The no-config storage fallback: one JSON file per collection. */
export class FilesystemBackend implements StorageBackend {
  readonly name = "local-json";

  constructor(private readonly paths: FilesystemBackendPaths) {}

  async healthCheck(): Promise<void> {
    // The local filesystem is always reachable.
  }

  private filePath(key: CollectionKey): string {
    const namespaceDir = key.namespace === "memory" ? this.paths.memoryDir : this.paths.knowledgeDir;
    if (!key.projectId) {
      return join(namespaceDir, `${key.scope}.json`);
    }
    // Per-call project scope lands in a sibling projects/ subtree under .saguaro/data.
    const dataDir = dirname(namespaceDir);
    return join(dataDir, "projects", assertProjectId(key.projectId), key.namespace, `${key.scope}.json`);
  }

  private async read(key: CollectionKey): Promise<StoredRecord[]> {
    return readJsonFile<StoredRecord[]>(this.filePath(key), []);
  }

  private async write(key: CollectionKey, records: StoredRecord[]): Promise<void> {
    await writeJsonFileAtomic(this.filePath(key), records);
  }

  async upsert(key: CollectionKey, records: StoredRecord[]): Promise<void> {
    if (records.length === 0) return;
    const byId = new Map((await this.read(key)).map((r) => [r.id, r]));
    for (const record of records) {
      byId.set(record.id, record);
    }
    await this.write(key, [...byId.values()]);
  }

  async query(key: CollectionKey, vector: number[], limit: number): Promise<ScoredRecord[]> {
    return (await this.read(key))
      .map((record) => ({ ...record, score: cosineScore(record.vector, vector) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(0, limit));
  }

  async get(key: CollectionKey, id: string): Promise<StoredRecord | undefined> {
    return (await this.read(key)).find((r) => r.id === id);
  }

  async list(key: CollectionKey): Promise<StoredRecord[]> {
    return this.read(key);
  }

  async delete(key: CollectionKey, id: string): Promise<void> {
    const existing = await this.read(key);
    const next = existing.filter((r) => r.id !== id);
    if (next.length !== existing.length) {
      await this.write(key, next);
    }
  }
}
