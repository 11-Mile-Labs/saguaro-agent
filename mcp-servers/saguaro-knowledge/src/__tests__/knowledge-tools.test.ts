import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { setEmbeddingsClientFactoryForTests } from "../../../core/src/storage/embeddings-client.js";
import { setSynthesisClientFactoryForTests } from "../../../core/src/storage/synthesis-openai-client.js";

function byName<T extends { name: string }>(items: T[]): Record<string, T> {
  return Object.fromEntries(items.map((item) => [item.name, item]));
}

function fakeEmbedding(text: string): number[] {
  const lower = text.toLowerCase();
  return [
    lower.includes("queue") ? 1 : 0,
    lower.includes("retry") ? 1 : 0,
    lower.includes("worker") ? 1 : 0,
    lower.includes("config") ? 1 : 0,
  ];
}

function installFakeBackends() {
  setEmbeddingsClientFactoryForTests(() => ({
    embed: async (text) => fakeEmbedding(text),
    embedBatch: async (texts) => texts.map(fakeEmbedding),
  }));
  setSynthesisClientFactoryForTests(() => ({
    synthesize: async ({ prompt, chunks }) => `Answer for ${prompt}: ${chunks[0]?.title ?? "no source"}`,
  }));
}

afterEach(() => {
  setEmbeddingsClientFactoryForTests(undefined);
  setSynthesisClientFactoryForTests(undefined);
});

describe("saguaro-knowledge tool behavior", () => {
  it("ingests, queries, updates, and deletes durable knowledge with dispatch logging", async () => {
    installFakeBackends();
    const projectRoot = await mkdtemp(join(tmpdir(), "saguaro-knowledge-"));

    const { createKnowledgeToolset } = await import("../tools.js");

    const tools = byName(createKnowledgeToolset({ defaultProjectRoot: projectRoot }));

    const ingested = await tools.knowledge_ingest.execute({
      title: "Queue Retry Notes",
      content: [
        "When the queue looks wedged, inspect the retry delay before escalating.",
        "A zero retry budget usually means the worker config was not loaded.",
      ].join("\n\n"),
      scope: "project",
      tags: ["queue", "retry"],
      source_url: "https://example.com/queue-retries",
      run_id: "run-456",
      phase_id: "research",
    });

    expect(ingested.chunks_created).toBeGreaterThan(0);

    const searched = await tools.knowledge_search.execute({
      query: "retry delay worker config",
      limit: 3,
      run_id: "run-456",
      phase_id: "research",
    });

    expect(searched.results[0]?.document_id).toBe(ingested.document_id);

    const queried = await tools.knowledge_query.execute({
      prompt: "What should I inspect before escalating a wedged queue?",
      max_chunks: 2,
      run_id: "run-456",
      phase_id: "research",
    });

    expect(queried.answer).toContain("Queue Retry Notes");
    expect(queried.chunks[0]?.document_id).toBe(ingested.document_id);

    const listed = await tools.knowledge_list.execute({
      scope: "project",
      filter: { tags: ["queue"] },
      run_id: "run-456",
      phase_id: "research",
    });

    expect(listed.documents).toHaveLength(1);

    const updated = await tools.knowledge_update.execute({
      document_id: ingested.document_id,
      content: "Inspect the retry delay and confirm the worker config loaded before escalating.",
      tags: ["queue", "retry", "ops"],
      run_id: "run-456",
      phase_id: "research",
    });

    expect(updated.chunks_recreated).toBeGreaterThan(0);

    const fetched = await tools.knowledge_get.execute({
      document_id: ingested.document_id,
      run_id: "run-456",
      phase_id: "research",
    });

    expect(fetched.tags).toContain("ops");

    await tools.knowledge_delete.execute({
      document_id: ingested.document_id,
      run_id: "run-456",
      phase_id: "research",
    });

    const afterDelete = await tools.knowledge_list.execute({
      scope: "project",
      run_id: "run-456",
      phase_id: "research",
    });

    expect(afterDelete.documents).toHaveLength(0);

    const dispatchLogPath = join(projectRoot, ".saguaro", "runs", "run-456", "_dispatch.jsonl");
    const dispatchLog = await readFile(dispatchLogPath, "utf8");
    const entries = dispatchLog.trim().split("\n").map((line) => JSON.parse(line) as { tool: string });

    expect(entries.map((entry) => entry.tool)).toEqual([
      "knowledge_ingest",
      "knowledge_search",
      "knowledge_query",
      "knowledge_list",
      "knowledge_update",
      "knowledge_get",
      "knowledge_delete",
      "knowledge_list",
    ]);
  });
});
