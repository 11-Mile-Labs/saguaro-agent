// mcp-servers/core/src/storage/memory-store.ts
import { randomUUID } from "node:crypto";
import { collectionKey } from "./backend.js";
import type { CollectionKey, StorageBackend } from "./backend.js";
import { cosineScore } from "./vector-score.js";
import { createEmbeddingsClient, type SaguaroEmbeddingsClient } from "./embeddings-client.js";
import { memoryToStored, storedToMemory } from "./record-mappers.js";
import { redactSecrets } from "./redaction.js";
import { MEMORY_SCOPES } from "./types.js";
import type { MemoryListFilter, MemoryRecord, MemoryScope, StorageRuntime } from "./types.js";

interface StoreMemoryInput {
  content: string;
  scope?: MemoryScope;
  tags?: string[];
  runId?: string;
  projectId?: string;
}

interface RetrieveMemoryInput {
  query: string;
  scope?: MemoryScope;
  limit?: number;
  tags?: string[];
  runId?: string;
  projectId?: string;
}

interface ListMemoryInput {
  scope: MemoryScope;
  filter?: MemoryListFilter;
  runId?: string;
  projectId?: string;
}

export class MemoryStorage {
  private embeddings?: SaguaroEmbeddingsClient;

  constructor(
    private readonly runtime: StorageRuntime,
    private readonly backend: StorageBackend,
  ) {}

  /** Collection key for a scope; an absent projectId falls back to the runtime's. */
  private key(scope: MemoryScope, projectId?: string): CollectionKey {
    return collectionKey("memory", scope, projectId ?? this.runtime.projectId);
  }

  private embedder(): SaguaroEmbeddingsClient {
    this.embeddings ??= createEmbeddingsClient(this.runtime);
    return this.embeddings;
  }

  private async readScope(scope: MemoryScope, projectId?: string): Promise<MemoryRecord[]> {
    return (await this.backend.list(this.key(scope, projectId))).map(storedToMemory);
  }

  private assertScope(scope: string): asserts scope is MemoryScope {
    if (!MEMORY_SCOPES.includes(scope as MemoryScope)) {
      throw new Error(`Unsupported memory scope: ${scope}`);
    }
  }

  private tagsMatch(recordTags: string[], requestedTags?: string[]): boolean {
    if (!requestedTags || requestedTags.length === 0) return true;
    return requestedTags.every((tag) => recordTags.includes(tag));
  }

  private visibleInRun(record: MemoryRecord, runId?: string): boolean {
    if (record.scope !== "run" || !runId) return true;
    return !record.runId || record.runId === runId;
  }

  private isActive(record: MemoryRecord): boolean {
    return !record.deletedAt;
  }

  private async locateRecord(
    id: string,
    projectId?: string,
  ): Promise<{ scope: MemoryScope; record: MemoryRecord }> {
    for (const scope of MEMORY_SCOPES) {
      const stored = await this.backend.get(this.key(scope, projectId), id);
      if (stored) {
        return { scope, record: storedToMemory(stored) };
      }
    }
    throw new Error(`Memory not found: ${id}`);
  }

  async store(input: StoreMemoryInput) {
    const scope = input.scope ?? "run";
    this.assertScope(scope);

    const now = new Date().toISOString();
    const tags = [...new Set((input.tags ?? []).map((tag) => tag.trim()).filter(Boolean))].sort();
    const redacted = redactSecrets(input.content.trim(), {
      enabled: this.runtime.config.redaction?.enabled,
      disabledRules: this.runtime.config.redaction?.disabled_rules,
      additionalAllowPatterns: this.runtime.config.redaction?.additional_allow_patterns,
    });
    const record: MemoryRecord = {
      id: `mem_${randomUUID()}`,
      vectorId: `vec_${randomUUID()}`,
      content: redacted.content,
      embedding: await this.embedder().embed(redacted.content),
      scope,
      tags,
      storedAt: now,
      updatedAt: now,
      ...(redacted.redactions.length ? { redactions: redacted.redactions, redactedAt: now } : {}),
      ...(input.runId ? { runId: input.runId } : {}),
    };

    await this.backend.upsert(this.key(scope, input.projectId), [memoryToStored(record)]);

    return {
      id: record.id,
      vector_id: record.vectorId,
      stored_at: record.storedAt,
      redactions_applied: redacted.redactions,
    };
  }

  async retrieve(input: RetrieveMemoryInput) {
    const scopes: MemoryScope[] = input.scope ? [input.scope] : [...MEMORY_SCOPES];
    if (input.scope) this.assertScope(input.scope);

    // Read the full record set and rank in-process, so a pinned or tagged
    // record can never be lost to a vector-search top-k cutoff. Exact parity
    // with the pre-backend behavior.
    const candidates: MemoryRecord[] = [];
    for (const scope of scopes) {
      for (const record of await this.readScope(scope, input.projectId)) {
        if (
          !this.isActive(record) ||
          !this.visibleInRun(record, input.runId) ||
          !this.tagsMatch(record.tags, input.tags)
        ) {
          continue;
        }
        candidates.push(record);
      }
    }

    const queryEmbedding = await this.embedder().embed(input.query);
    const ranked = candidates
      .map((record) => ({
        record,
        score: Math.min(
          1,
          cosineScore(record.embedding, queryEmbedding) + (record.pinnedAt ? 0.25 : 0),
        ),
      }))
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return right.record.updatedAt.localeCompare(left.record.updatedAt);
      });

    return {
      results: ranked.slice(0, input.limit ?? 5).map(({ record, score }) => ({
        id: record.id,
        content: record.content,
        score: Number(score.toFixed(4)),
        scope: record.scope,
        tags: record.tags,
        stored_at: record.storedAt,
      })),
    };
  }

  async pin(id: string, projectId?: string) {
    const { scope, record } = await this.locateRecord(id, projectId);
    if (!this.isActive(record)) throw new Error(`Memory not found: ${id}`);
    const now = new Date().toISOString();
    const next: MemoryRecord = { ...record, pinnedAt: now, updatedAt: now };
    await this.backend.upsert(this.key(scope, projectId), [memoryToStored(next)]);
    return { pinned_at: now };
  }

  async unpin(id: string, projectId?: string) {
    const { scope, record } = await this.locateRecord(id, projectId);
    if (!this.isActive(record)) throw new Error(`Memory not found: ${id}`);
    const now = new Date().toISOString();
    const next: MemoryRecord = { ...record, updatedAt: now };
    delete next.pinnedAt;
    await this.backend.upsert(this.key(scope, projectId), [memoryToStored(next)]);
    return { unpinned_at: now };
  }

  async promote(id: string, targetScope: MemoryScope, projectId?: string) {
    this.assertScope(targetScope);
    if (targetScope === "run") {
      throw new Error("Memory promotion target_scope must be project or global.");
    }

    const { scope, record } = await this.locateRecord(id, projectId);
    if (!this.isActive(record)) throw new Error(`Memory not found: ${id}`);

    const now = new Date().toISOString();
    if (scope === targetScope) {
      const next: MemoryRecord = { ...record, promotedAt: now, updatedAt: now };
      await this.backend.upsert(this.key(scope, projectId), [memoryToStored(next)]);
      return { promoted_at: now, new_scope: targetScope };
    }

    const promoted: MemoryRecord = {
      ...record,
      scope: targetScope,
      promotedAt: now,
      promotedFrom: scope,
      updatedAt: now,
    };
    await this.backend.delete(this.key(scope, projectId), id);
    await this.backend.upsert(this.key(targetScope, projectId), [memoryToStored(promoted)]);
    return { promoted_at: now, new_scope: targetScope };
  }

  async list(input: ListMemoryInput) {
    this.assertScope(input.scope);

    const records = (await this.readScope(input.scope, input.projectId))
      .filter((record) => this.isActive(record))
      .filter((record) => this.visibleInRun(record, input.runId))
      .filter((record) => this.tagsMatch(record.tags, input.filter?.tags))
      .filter((record) => !input.filter?.since || record.updatedAt >= input.filter.since)
      .filter(
        (record) =>
          input.filter?.pinned === undefined || Boolean(record.pinnedAt) === input.filter.pinned,
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

    return {
      memories: records.map((record) => ({
        id: record.id,
        content: record.content,
        scope: record.scope,
        tags: record.tags,
        stored_at: record.storedAt,
        pinned_at: record.pinnedAt ?? null,
      })),
    };
  }

  async status(scope?: MemoryScope, runId?: string, projectId?: string) {
    if (scope) this.assertScope(scope);

    const scopes: MemoryScope[] = scope ? [scope] : [...MEMORY_SCOPES];
    const byScope: Record<MemoryScope, number> = { run: 0, project: 0, global: 0 };
    let lastUpdated: string | null = null;

    for (const candidateScope of scopes) {
      for (const record of await this.readScope(candidateScope, projectId)) {
        if (!this.isActive(record) || !this.visibleInRun(record, runId)) continue;
        byScope[candidateScope] += 1;
        if (!lastUpdated || record.updatedAt > lastUpdated) {
          lastUpdated = record.updatedAt;
        }
      }
    }

    return {
      count: scopes.reduce((total, candidateScope) => total + byScope[candidateScope], 0),
      by_scope: byScope,
      last_updated: lastUpdated,
      vector_store: this.backend.name,
    };
  }

  async delete(id: string, projectId?: string) {
    const { scope, record } = await this.locateRecord(id, projectId);
    if (!this.isActive(record)) throw new Error(`Memory not found: ${id}`);
    const now = new Date().toISOString();
    const next: MemoryRecord = { ...record, deletedAt: now, updatedAt: now };
    await this.backend.upsert(this.key(scope, projectId), [memoryToStored(next)]);
    return { deleted_at: now };
  }
}
