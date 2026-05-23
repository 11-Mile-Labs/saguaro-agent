import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { setEmbeddingsClientFactoryForTests } from "../../../core/src/storage/embeddings-client.js";

function byName<T extends { name: string }>(items: T[]): Record<string, T> {
  return Object.fromEntries(items.map((item) => [item.name, item]));
}

function fakeEmbedding(text: string): number[] {
  return [
    text.toLowerCase().includes("cache") ? 1 : 0,
    text.toLowerCase().includes("retry") ? 1 : 0,
    text.toLowerCase().includes("api") ? 1 : 0,
  ];
}

function installFakeVectorBackends() {
  setEmbeddingsClientFactoryForTests(() => ({
    embed: async (text) => fakeEmbedding(text),
    embedBatch: async (texts) => texts.map(fakeEmbedding),
  }));
}

afterEach(() => {
  setEmbeddingsClientFactoryForTests(undefined);
});

describe("saguaro-memory tool behavior", () => {
  it("stores, retrieves, promotes, and logs dispatch-aware memory lifecycle operations", async () => {
    installFakeVectorBackends();
    const projectRoot = await mkdtemp(join(tmpdir(), "saguaro-memory-"));

    const { createStorageRuntime } = await import("../../../core/src/storage/config.js");
    const { createMemoryToolset } = await import("../tools.js");

    const runtime = createStorageRuntime({ projectRoot });
    const tools = byName(createMemoryToolset(runtime));

    const stored = await tools.memory_store.execute({
      content: "Retry the flaky cache warmup before assuming the API is down.",
      scope: "run",
      tags: ["cache", "retry"],
      run_id: "run-123",
      phase_id: "research",
    });

    await tools.memory_pin.execute({
      id: stored.id,
      run_id: "run-123",
      phase_id: "research",
    });

    const promoted = await tools.memory_promote.execute({
      id: stored.id,
      target_scope: "project",
      run_id: "run-123",
      phase_id: "research",
    });

    expect(promoted.new_scope).toBe("project");

    const retrieved = await tools.memory_retrieve.execute({
      query: "cache retry API down",
      limit: 3,
      run_id: "run-123",
      phase_id: "research",
    });

    expect(retrieved.results[0]?.id).toBe(stored.id);
    expect(retrieved.results[0]?.scope).toBe("project");

    const listed = await tools.memory_list.execute({
      scope: "project",
      filter: { pinned: true, tags: ["cache"] },
      run_id: "run-123",
      phase_id: "research",
    });

    expect(listed.memories).toHaveLength(1);
    expect(listed.memories[0]?.id).toBe(stored.id);

    const status = await tools.memory_status.execute({
      run_id: "run-123",
      phase_id: "research",
    });

    expect(status.count).toBe(1);
    expect(status.by_scope.project).toBe(1);

    await tools.memory_unpin.execute({
      id: stored.id,
      run_id: "run-123",
      phase_id: "research",
    });

    const deleted = await tools.memory_delete.execute({
      id: stored.id,
      run_id: "run-123",
      phase_id: "research",
    });

    expect(deleted.deleted_at).toMatch(/T/);

    const afterDelete = await tools.memory_list.execute({
      scope: "project",
      run_id: "run-123",
      phase_id: "research",
    });

    expect(afterDelete.memories).toHaveLength(0);

    const dispatchLogPath = join(projectRoot, ".saguaro", "runs", "run-123", "_dispatch.jsonl");
    const dispatchLog = await readFile(dispatchLogPath, "utf8");
    const entries = dispatchLog.trim().split("\n").map((line) => JSON.parse(line) as { tool: string; phase_id: string });

    expect(entries.map((entry) => entry.tool)).toEqual([
      "memory_store",
      "memory_pin",
      "memory_promote",
      "memory_retrieve",
      "memory_list",
      "memory_status",
      "memory_unpin",
      "memory_delete",
      "memory_list",
    ]);
    expect(new Set(entries.map((entry) => entry.phase_id))).toEqual(new Set(["research"]));
  });
});
