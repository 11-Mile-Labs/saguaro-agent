// mcp-servers/core/src/storage/record-mappers.ts
import type { StoredRecord } from "./backend.js";
import type {
  KnowledgeChunk,
  KnowledgeDocumentRecord,
  KnowledgeScope,
  MemoryRecord,
  MemoryScope,
} from "./types.js";

type Meta = Record<string, string | number | boolean>;

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// ---- Memory ---------------------------------------------------------------

export function memoryToStored(record: MemoryRecord): StoredRecord {
  const metadata: Meta = {
    vectorId: record.vectorId,
    scope: record.scope,
    tags: JSON.stringify(record.tags),
    storedAt: record.storedAt,
    updatedAt: record.updatedAt,
  };
  if (record.pinnedAt) metadata.pinnedAt = record.pinnedAt;
  if (record.promotedAt) metadata.promotedAt = record.promotedAt;
  if (record.promotedFrom) metadata.promotedFrom = record.promotedFrom;
  if (record.deletedAt) metadata.deletedAt = record.deletedAt;
  if (record.runId) metadata.runId = record.runId;
  if (record.redactedAt) metadata.redactedAt = record.redactedAt;
  if (record.redactions) metadata.redactions = JSON.stringify(record.redactions);
  return {
    id: record.id,
    vector: record.embedding ?? [],
    document: record.content,
    metadata,
  };
}

export function storedToMemory(record: StoredRecord): MemoryRecord {
  const m = record.metadata;
  return {
    id: record.id,
    vectorId: str(m.vectorId),
    content: record.document,
    embedding: record.vector,
    scope: str(m.scope) as MemoryScope,
    tags: m.tags ? (JSON.parse(str(m.tags)) as string[]) : [],
    storedAt: str(m.storedAt),
    updatedAt: str(m.updatedAt),
    ...(m.pinnedAt ? { pinnedAt: str(m.pinnedAt) } : {}),
    ...(m.promotedAt ? { promotedAt: str(m.promotedAt) } : {}),
    ...(m.promotedFrom ? { promotedFrom: str(m.promotedFrom) as MemoryScope } : {}),
    ...(m.deletedAt ? { deletedAt: str(m.deletedAt) } : {}),
    ...(m.runId ? { runId: str(m.runId) } : {}),
    ...(m.redactions ? { redactions: JSON.parse(str(m.redactions)) as string[] } : {}),
    ...(m.redactedAt ? { redactedAt: str(m.redactedAt) } : {}),
  };
}

// ---- Knowledge ------------------------------------------------------------

/** Stable, deterministic id for a chunk record so updates can target stale chunks. */
export function chunkRecordId(documentId: string, index: number): string {
  return `${documentId}::${index}`;
}

/**
 * Maps a KnowledgeDocumentRecord to an array of StoredRecords, one per chunk.
 *
 * Chunk-id ownership: `chunk.id` from the input is intentionally ignored. The
 * stored record id is always derived as `documentId::index` via `chunkRecordId`,
 * which makes ids stable and deterministic across re-ingestion. On the read path,
 * `storedToKnowledgeDocuments` reconstructs a synthetic `chunk_<recordId>` id.
 * Chunk ids are not part of the durable storage contract; only `document_id`
 * surfaces in tool responses.
 */
export function knowledgeDocumentToStored(doc: KnowledgeDocumentRecord): StoredRecord[] {
  const chunkCount = doc.chunks.length;
  return doc.chunks.map((chunk) => {
    const metadata: Meta = {
      documentId: doc.documentId,
      chunkIndex: chunk.index,
      chunkCount,
      title: doc.title,
      scope: doc.scope,
      tags: JSON.stringify(doc.tags),
      ingestedAt: doc.ingestedAt,
      updatedAt: doc.updatedAt,
    };
    if (doc.sourceUrl) metadata.sourceUrl = doc.sourceUrl;
    if (doc.deletedAt) metadata.deletedAt = doc.deletedAt;
    if (doc.redactedAt) metadata.redactedAt = doc.redactedAt;
    if (doc.redactions) metadata.redactions = JSON.stringify(doc.redactions);
    // Full document content rides only on chunk 0 to avoid N-fold duplication.
    // Invariant: every document must have a chunk at index 0. `chunkDocument()`
    // in tokenize.ts always produces one, so this invariant is guaranteed at
    // ingest time. `storedToKnowledgeDocuments` depends on it: it sorts chunks
    // by index and reads `documentContent` from the lowest-index chunk to
    // recover the full document `content` for the returned record.
    if (chunk.index === 0) metadata.documentContent = doc.content;
    return {
      id: chunkRecordId(doc.documentId, chunk.index),
      vector: chunk.embedding ?? [],
      document: chunk.content,
      metadata,
    };
  });
}

export function storedToKnowledgeDocuments(records: StoredRecord[]): KnowledgeDocumentRecord[] {
  const byDocument = new Map<string, StoredRecord[]>();
  for (const record of records) {
    const documentId = str(record.metadata.documentId);
    if (!documentId) continue;
    const bucket = byDocument.get(documentId) ?? [];
    bucket.push(record);
    byDocument.set(documentId, bucket);
  }

  const documents: KnowledgeDocumentRecord[] = [];
  for (const [documentId, bucket] of byDocument) {
    const sorted = [...bucket].sort(
      (a, b) => Number(a.metadata.chunkIndex) - Number(b.metadata.chunkIndex),
    );
    const head = sorted[0];
    if (!head) continue;
    const m = head.metadata;
    const chunks: KnowledgeChunk[] = sorted.map((record) => ({
      id: `chunk_${record.id}`,
      documentId,
      index: Number(record.metadata.chunkIndex),
      content: record.document,
      embedding: record.vector,
    }));
    documents.push({
      documentId,
      title: str(m.title),
      content: str(m.documentContent),
      scope: str(m.scope) as KnowledgeScope,
      tags: m.tags ? (JSON.parse(str(m.tags)) as string[]) : [],
      ...(m.sourceUrl ? { sourceUrl: str(m.sourceUrl) } : {}),
      ingestedAt: str(m.ingestedAt),
      updatedAt: str(m.updatedAt),
      ...(m.deletedAt ? { deletedAt: str(m.deletedAt) } : {}),
      ...(m.redactions ? { redactions: JSON.parse(str(m.redactions)) as string[] } : {}),
      ...(m.redactedAt ? { redactedAt: str(m.redactedAt) } : {}),
      chunks,
    });
  }
  return documents;
}
