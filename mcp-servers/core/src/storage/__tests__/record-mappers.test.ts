// mcp-servers/core/src/storage/__tests__/record-mappers.test.ts
import { describe, expect, it } from "vitest";
import {
  knowledgeDocumentToStored,
  memoryToStored,
  storedToKnowledgeDocuments,
  storedToMemory,
} from "../record-mappers.js";
import type { KnowledgeDocumentRecord, MemoryRecord } from "../types.js";

const memory: MemoryRecord = {
  id: "mem_1",
  vectorId: "vec_1",
  content: "Retry the cache warmup before assuming the API is down.",
  embedding: [0.1, 0.2, 0.3],
  scope: "project",
  tags: ["cache", "retry"],
  storedAt: "2026-05-21T00:00:00.000Z",
  updatedAt: "2026-05-21T00:00:00.000Z",
  pinnedAt: "2026-05-21T01:00:00.000Z",
  runId: "run-1",
  redactions: ["openai-style-token"],
  redactedAt: "2026-05-21T00:00:00.000Z",
};

const doc: KnowledgeDocumentRecord = {
  documentId: "doc_1",
  title: "Queue Notes",
  content: "Para one.\n\nPara two.",
  scope: "project",
  tags: ["queue"],
  sourceUrl: "https://example.com/q",
  ingestedAt: "2026-05-21T00:00:00.000Z",
  updatedAt: "2026-05-21T00:00:00.000Z",
  chunks: [
    { id: "chunk_doc_1::0", documentId: "doc_1", index: 0, content: "Para one.", embedding: [1, 0] },
    { id: "chunk_doc_1::1", documentId: "doc_1", index: 1, content: "Para two.", embedding: [0, 1] },
  ],
};

describe("memory mappers", () => {
  it("round-trips a memory record losslessly", () => {
    const restored = storedToMemory(memoryToStored(memory));
    expect(restored).toEqual(memory);
  });

  it("stores tags and redactions as JSON scalars in metadata", () => {
    const stored = memoryToStored(memory);
    expect(stored.metadata.tags).toBe('["cache","retry"]');
    expect(stored.metadata.redactions).toBe('["openai-style-token"]');
    expect(stored.vector).toEqual([0.1, 0.2, 0.3]);
    expect(stored.document).toBe(memory.content);
  });
});

describe("knowledge mappers", () => {
  it("explodes a document into one StoredRecord per chunk", () => {
    const stored = knowledgeDocumentToStored(doc);
    expect(stored).toHaveLength(2);
    expect(stored[0]?.id).toBe("doc_1::0");
    expect(stored[1]?.id).toBe("doc_1::1");
    expect(stored[0]?.metadata.documentContent).toBe(doc.content);
    expect(stored[1]?.metadata.documentContent).toBeUndefined();
  });

  it("round-trips a document through stored chunks", () => {
    const [restored] = storedToKnowledgeDocuments(knowledgeDocumentToStored(doc));
    expect(restored).toEqual(doc);
  });

  it("groups multiple documents and sorts chunks by index", () => {
    const stored = [
      ...knowledgeDocumentToStored(doc),
      ...knowledgeDocumentToStored({ ...doc, documentId: "doc_2", chunks: [
        { id: "x", documentId: "doc_2", index: 0, content: "Solo.", embedding: [1, 1] },
      ] }),
    ];
    const docs = storedToKnowledgeDocuments(stored);
    expect(docs.map((d) => d.documentId).sort()).toEqual(["doc_1", "doc_2"]);
  });
});
