#!/usr/bin/env node
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStorageRuntime } from "../mcp-servers/core/dist/storage/config.mjs";
import { MemoryStorage } from "../mcp-servers/core/dist/storage/memory-store.mjs";
import { KnowledgeStorage } from "../mcp-servers/core/dist/storage/knowledge-store.mjs";

const projectRoot = await mkdtemp(join(tmpdir(), "saguaro-smoke-"));
const collectionSuffix = Date.now().toString(36);

try {
  await mkdir(join(projectRoot, ".saguaro"), { recursive: true });
  await writeFile(join(projectRoot, ".saguaro", "config.yaml"), `embeddings:
  base_url: "${process.env.SAGUARO_EMBEDDINGS_BASE_URL ?? process.env.EMBEDDINGS_BASE_URL ?? "http://localhost:1234/v1"}"
  model: "${process.env.SAGUARO_EMBEDDINGS_MODEL ?? process.env.EMBEDDINGS_MODEL ?? "text-embedding-bge-m3"}"
  api_key_env: EMBEDDINGS_API_KEY
llm:
  base_url: "${process.env.SAGUARO_LLM_BASE_URL ?? process.env.LLM_BASE_URL ?? "http://localhost:1234/v1"}"
  model: "${process.env.SAGUARO_LLM_MODEL ?? process.env.LLM_MODEL ?? "local-chat"}"
  api_key_env: LLM_API_KEY
memory:
  collection: "saguaro_smoke_memory_${collectionSuffix}"
knowledge:
  collection: "saguaro_smoke_knowledge_${collectionSuffix}"
  chunk_size: 500
`, "utf8");

  const runtime = createStorageRuntime({ projectRoot });
  const memory = new MemoryStorage(runtime);
  const knowledge = new KnowledgeStorage(runtime);

  const storedMemory = await memory.store({
    content: `Saguaro smoke memory: retry semantic retrieval before assuming context is absent. api_key=${"sk-"}smoketest1234567890`,
    scope: "project",
    tags: ["smoke", "retrieval"],
  });
  const retrievedMemory = await memory.retrieve({
    query: "retry retrieval context",
    scope: "project",
    limit: 3,
  });
  if (!retrievedMemory.results.some((result) => result.id === storedMemory.id)) {
    throw new Error("memory_retrieve smoke did not return the stored memory.");
  }
  if (retrievedMemory.results.some((result) => result.content.includes(`${"sk-"}smoketest`))) {
    throw new Error("memory redaction smoke failed.");
  }

  const ingested = await knowledge.ingest({
    title: "Saguaro Smoke Knowledge",
    content: "For Saguaro smoke tests, local vector manifests store knowledge chunks and an OpenAI-compatible chat endpoint synthesizes answers.",
    scope: "project",
    tags: ["smoke", "knowledge"],
  });
  const searched = await knowledge.search({
    query: "who synthesizes answers",
    scope: "project",
    limit: 3,
  });
  if (!searched.results.some((result) => result.document_id === ingested.document_id)) {
    throw new Error("knowledge_search smoke did not return the ingested document.");
  }
  const queried = await knowledge.query({
    prompt: "What synthesizes answers for Saguaro knowledge?",
    scope: "project",
    maxChunks: 3,
  });
  if (!queried.answer || queried.chunks.length === 0) {
    throw new Error("knowledge_query smoke did not return an answer and sources.");
  }

  console.log(JSON.stringify({
    ok: true,
    memory_id: storedMemory.id,
    knowledge_document_id: ingested.document_id,
    answer_preview: queried.answer.slice(0, 160),
  }, null, 2));
} finally {
  await rm(projectRoot, { recursive: true, force: true });
}
