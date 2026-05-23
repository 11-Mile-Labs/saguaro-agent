// mcp-servers/core/src/storage/migrate.ts
import { join } from "node:path";
import { collectionKey } from "./backend.js";
import type { StorageBackend } from "./backend.js";
import { readJsonFile } from "./filesystem.js";
import { knowledgeDocumentToStored, memoryToStored } from "./record-mappers.js";
import { KNOWLEDGE_SCOPES, MEMORY_SCOPES } from "./types.js";
import type { KnowledgeDocumentRecord, MemoryRecord } from "./types.js";

export interface MigrateLegacyPaths {
  /** Legacy memory data dir, e.g. <root>/.saguaro/data/memory */
  memoryDir: string;
  /** Legacy knowledge data dir, e.g. <root>/.saguaro/data/knowledge */
  knowledgeDir: string;
}

export interface MigrateLegacyOptions {
  /**
   * Project the legacy single-project data belongs to. `run` and `project`
   * scopes migrate under this id; `global` stays cross-project regardless.
   * Omit it to migrate `run`/`project` data unscoped (`_shared`).
   */
  projectId?: string;
}

export interface MigrationSummary {
  memoriesMigrated: number;
  knowledgeDocumentsMigrated: number;
  chunksMigrated: number;
}

/**
 * One-time import of legacy `.saguaro/data/{memory,knowledge}/<scope>.json`
 * records into a storage backend. Embedding vectors in the records are reused
 * directly — no re-embedding. Idempotent: re-running upserts the same ids.
 *
 * Legacy filesystem data is single-project; `options.projectId` gives it an
 * identity in the durable backend. `global`-scoped records stay cross-project
 * regardless — see `collectionKey`.
 *
 * Throws if a legacy JSON file exists but is malformed — intentional loud
 * failure so operators can correct the data before retrying the migration.
 */
export async function migrateLegacyData(
  paths: MigrateLegacyPaths,
  backend: StorageBackend,
  options: MigrateLegacyOptions = {},
): Promise<MigrationSummary> {
  const summary: MigrationSummary = {
    memoriesMigrated: 0,
    knowledgeDocumentsMigrated: 0,
    chunksMigrated: 0,
  };

  for (const scope of MEMORY_SCOPES) {
    const records = await readJsonFile<MemoryRecord[]>(join(paths.memoryDir, `${scope}.json`), []);
    if (records.length === 0) continue;
    await backend.upsert(
      collectionKey("memory", scope, options.projectId),
      records.map((record) => memoryToStored(record)),
    );
    summary.memoriesMigrated += records.length;
  }

  for (const scope of KNOWLEDGE_SCOPES) {
    const documents = await readJsonFile<KnowledgeDocumentRecord[]>(
      join(paths.knowledgeDir, `${scope}.json`),
      [],
    );
    if (documents.length === 0) continue;
    const allStored = documents.flatMap((document) => knowledgeDocumentToStored(document));
    await backend.upsert(collectionKey("knowledge", scope, options.projectId), allStored);
    summary.knowledgeDocumentsMigrated += documents.length;
    summary.chunksMigrated += allStored.length;
  }

  return summary;
}
