// mcp-servers/core/src/storage/knowledge-store.ts
import { randomUUID } from "node:crypto";
import { collectionKey } from "./backend.js";
import type { CollectionKey, StorageBackend } from "./backend.js";
import { cosineScore } from "./vector-score.js";
import { createEmbeddingsClient, type SaguaroEmbeddingsClient } from "./embeddings-client.js";
import {
  chunkRecordId,
  knowledgeDocumentToStored,
  storedToKnowledgeDocuments,
} from "./record-mappers.js";
import { redactSecrets } from "./redaction.js";
import { createOpenAiCompatibleSynthesisClient, type SaguaroSynthesisClient } from "./synthesis-openai-client.js";
import { chunkDocument, truncateText } from "./tokenize.js";
import { KNOWLEDGE_SCOPES } from "./types.js";
import type {
  KnowledgeChunk,
  KnowledgeDocumentRecord,
  KnowledgeListFilter,
  KnowledgeScope,
  StorageRuntime,
} from "./types.js";

interface IngestKnowledgeInput {
  title: string;
  content: string;
  scope?: KnowledgeScope;
  tags?: string[];
  sourceUrl?: string;
  projectId?: string;
}

interface QueryKnowledgeInput {
  prompt: string;
  scope?: KnowledgeScope;
  maxChunks?: number;
  projectId?: string;
}

interface SearchKnowledgeInput {
  query: string;
  scope?: KnowledgeScope;
  limit?: number;
  projectId?: string;
}

interface RankedChunk {
  record: KnowledgeDocumentRecord;
  chunk: KnowledgeChunk;
  score: number;
}

export class KnowledgeStorage {
  private embeddings?: SaguaroEmbeddingsClient;
  private synthesis?: SaguaroSynthesisClient;

  constructor(
    private readonly runtime: StorageRuntime,
    private readonly backend: StorageBackend,
  ) {}

  /** Collection key for a scope; an absent projectId falls back to the runtime's. */
  private key(scope: KnowledgeScope, projectId?: string): CollectionKey {
    return collectionKey("knowledge", scope, projectId ?? this.runtime.projectId);
  }

  private embedder(): SaguaroEmbeddingsClient {
    this.embeddings ??= createEmbeddingsClient(this.runtime);
    return this.embeddings;
  }

  private synthesizer(): SaguaroSynthesisClient {
    this.synthesis ??= createOpenAiCompatibleSynthesisClient(this.runtime);
    return this.synthesis;
  }

  private assertScope(scope: string): asserts scope is KnowledgeScope {
    if (!KNOWLEDGE_SCOPES.includes(scope as KnowledgeScope)) {
      throw new Error(`Unsupported knowledge scope: ${scope}`);
    }
  }

  private isActive(record: KnowledgeDocumentRecord): boolean {
    return !record.deletedAt;
  }

  private tagsMatch(recordTags: string[], requestedTags?: string[]): boolean {
    if (!requestedTags || requestedTags.length === 0) return true;
    return requestedTags.every((tag) => recordTags.includes(tag));
  }

  /** Reconstruct all documents in a scope (one StoredRecord per chunk). */
  private async readScope(
    scope: KnowledgeScope,
    projectId?: string,
  ): Promise<KnowledgeDocumentRecord[]> {
    const stored = await this.backend.list(this.key(scope, projectId));
    return storedToKnowledgeDocuments(stored);
  }

  private async locateDocument(
    documentId: string,
    projectId?: string,
  ): Promise<{ scope: KnowledgeScope; record: KnowledgeDocumentRecord }> {
    for (const scope of KNOWLEDGE_SCOPES) {
      const head = await this.backend.get(this.key(scope, projectId), chunkRecordId(documentId, 0));
      if (head) {
        const [record] = storedToKnowledgeDocuments(
          await this.scopedChunks(scope, documentId, projectId),
        );
        if (record) return { scope, record };
      }
    }
    throw new Error(`Knowledge document not found: ${documentId}`);
  }

  /** Every StoredRecord chunk belonging to one document within a scope. */
  private async scopedChunks(scope: KnowledgeScope, documentId: string, projectId?: string) {
    const all = await this.backend.list(this.key(scope, projectId));
    return all.filter((record) => record.metadata.documentId === documentId);
  }

  private async embedChunks(chunks: KnowledgeChunk[]): Promise<KnowledgeChunk[]> {
    const embeddings = await this.embedder().embedBatch(chunks.map((chunk) => chunk.content));
    return chunks.map((chunk, index) => ({ ...chunk, embedding: embeddings[index] ?? [] }));
  }

  private chunkResult(hit: RankedChunk) {
    return {
      document_id: hit.record.documentId,
      title: hit.record.title,
      content: hit.chunk.content,
      score: Number(hit.score.toFixed(4)),
      source_url: hit.record.sourceUrl ?? null,
    };
  }

  /** Rank every chunk of every active document across the requested scope(s). */
  private async rankedChunks(
    query: string,
    scope: KnowledgeScope | undefined,
    limit: number,
    projectId?: string,
  ): Promise<RankedChunk[]> {
    if (scope) this.assertScope(scope);
    const scopes = scope ? [scope] : KNOWLEDGE_SCOPES;
    const embedding = await this.embedder().embed(query);

    // Read the full record set and score in-process — exact parity with the
    // pre-backend in-memory ranking; no vector-search top-k cutoff.
    const hits: RankedChunk[] = [];
    for (const candidateScope of scopes) {
      for (const record of await this.readScope(candidateScope, projectId)) {
        if (!this.isActive(record)) continue;
        for (const chunk of record.chunks) {
          hits.push({ record, chunk, score: cosineScore(chunk.embedding, embedding) });
        }
      }
    }

    return hits
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return right.record.updatedAt.localeCompare(left.record.updatedAt);
      })
      .slice(0, limit);
  }

  async ingest(input: IngestKnowledgeInput) {
    const scope = input.scope ?? "project";
    this.assertScope(scope);

    const now = new Date().toISOString();
    const documentId = `doc_${randomUUID()}`;
    const chunkSize = Number(this.runtime.config.knowledge?.chunk_size) || 900;
    const redacted = redactSecrets(input.content.trim(), {
      enabled: this.runtime.config.redaction?.enabled,
      disabledRules: this.runtime.config.redaction?.disabled_rules,
      additionalAllowPatterns: this.runtime.config.redaction?.additional_allow_patterns,
    });
    const chunks = await this.embedChunks(chunkDocument(documentId, redacted.content, chunkSize));
    const record: KnowledgeDocumentRecord = {
      documentId,
      title: input.title.trim(),
      content: redacted.content,
      scope,
      tags: [...new Set((input.tags ?? []).map((tag) => tag.trim()).filter(Boolean))].sort(),
      ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
      ingestedAt: now,
      updatedAt: now,
      ...(redacted.redactions.length ? { redactions: redacted.redactions, redactedAt: now } : {}),
      chunks,
    };

    await this.backend.upsert(this.key(scope, input.projectId), knowledgeDocumentToStored(record));

    return {
      document_id: documentId,
      chunks_created: chunks.length,
      indexed_at: now,
      vector_store: this.backend.name,
      redactions_applied: redacted.redactions,
    };
  }

  async query(input: QueryKnowledgeInput) {
    const hits = await this.rankedChunks(
      input.prompt,
      input.scope,
      input.maxChunks ?? 5,
      input.projectId,
    );
    const chunks = hits.map((hit) => this.chunkResult(hit));
    const answer = await this.synthesizer().synthesize({
      prompt: input.prompt,
      chunks: chunks.map((chunk) => ({
        documentId: chunk.document_id,
        title: chunk.title,
        content: chunk.content,
        sourceUrl: chunk.source_url,
        score: chunk.score,
      })),
    });

    return { answer, chunks, synthesis: { provider: "openai-compatible" } };
  }

  async search(input: SearchKnowledgeInput) {
    const hits = await this.rankedChunks(
      input.query,
      input.scope,
      Math.max(input.limit ?? 5, 5) * 3,
      input.projectId,
    );
    const bestByDocument = new Map<string, RankedChunk>();
    for (const hit of hits) {
      const existing = bestByDocument.get(hit.record.documentId);
      if (!existing || hit.score > existing.score) {
        bestByDocument.set(hit.record.documentId, hit);
      }
    }

    const ranked = [...bestByDocument.values()]
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return right.record.updatedAt.localeCompare(left.record.updatedAt);
      })
      .slice(0, input.limit ?? 5);

    return {
      results: ranked.map((hit) => ({
        document_id: hit.record.documentId,
        title: hit.record.title,
        snippet: truncateText(hit.chunk.content, 200),
        score: Number(hit.score.toFixed(4)),
        scope: hit.record.scope,
        tags: hit.record.tags,
      })),
    };
  }

  async list(scope?: KnowledgeScope, filter?: KnowledgeListFilter, projectId?: string) {
    if (scope) this.assertScope(scope);
    const scopes = scope ? [scope] : KNOWLEDGE_SCOPES;
    const documents = [];

    for (const candidateScope of scopes) {
      for (const record of await this.readScope(candidateScope, projectId)) {
        if (!this.isActive(record) || !this.tagsMatch(record.tags, filter?.tags)) continue;
        if (filter?.since && record.updatedAt < filter.since) continue;
        documents.push({
          document_id: record.documentId,
          title: record.title,
          scope: record.scope,
          tags: record.tags,
          ingested_at: record.ingestedAt,
          chunk_count: record.chunks.length,
        });
      }
    }

    documents.sort((left, right) => right.ingested_at.localeCompare(left.ingested_at));
    return { documents };
  }

  async get(documentId: string, projectId?: string) {
    const { record } = await this.locateDocument(documentId, projectId);
    if (!this.isActive(record)) throw new Error(`Knowledge document not found: ${documentId}`);
    return {
      document_id: record.documentId,
      title: record.title,
      content: record.content,
      scope: record.scope,
      tags: record.tags,
      source_url: record.sourceUrl ?? null,
      ingested_at: record.ingestedAt,
    };
  }

  async update(documentId: string, content?: string, tags?: string[], projectId?: string) {
    if (!content && (!tags || tags.length === 0)) {
      throw new Error("knowledge_update requires content, tags, or both.");
    }

    const { scope, record } = await this.locateDocument(documentId, projectId);
    if (!this.isActive(record)) throw new Error(`Knowledge document not found: ${documentId}`);

    const now = new Date().toISOString();
    const redacted = content
      ? redactSecrets(content.trim(), {
          enabled: this.runtime.config.redaction?.enabled,
          disabledRules: this.runtime.config.redaction?.disabled_rules,
          additionalAllowPatterns: this.runtime.config.redaction?.additional_allow_patterns,
        })
      : undefined;
    const nextContent = redacted?.content || record.content;
    const nextTags = tags
      ? [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))].sort()
      : record.tags;
    const chunkSize = Number(this.runtime.config.knowledge?.chunk_size) || 900;
    const nextChunks = content
      ? await this.embedChunks(chunkDocument(documentId, nextContent, chunkSize))
      : record.chunks;

    const nextDoc: KnowledgeDocumentRecord = {
      ...record,
      content: nextContent,
      tags: nextTags,
      updatedAt: now,
      ...(redacted?.redactions.length ? { redactions: redacted.redactions, redactedAt: now } : {}),
      chunks: nextChunks,
    };

    await this.backend.upsert(this.key(scope, projectId), knowledgeDocumentToStored(nextDoc));
    // Re-chunking can shrink the chunk count; drop chunk records past the new tail.
    for (let index = nextChunks.length; index < record.chunks.length; index++) {
      await this.backend.delete(this.key(scope, projectId), chunkRecordId(documentId, index));
    }

    return {
      updated_at: now,
      chunks_recreated: content ? nextChunks.length : 0,
      vector_store: this.backend.name,
      redactions_applied: redacted?.redactions ?? [],
    };
  }

  async delete(documentId: string, projectId?: string) {
    const { scope, record } = await this.locateDocument(documentId, projectId);
    if (!this.isActive(record)) throw new Error(`Knowledge document not found: ${documentId}`);
    const now = new Date().toISOString();
    const deletedDoc: KnowledgeDocumentRecord = { ...record, deletedAt: now, updatedAt: now };
    // Soft delete: re-upsert every chunk record with deletedAt set.
    await this.backend.upsert(this.key(scope, projectId), knowledgeDocumentToStored(deletedDoc));
    return { deleted_at: now };
  }
}
