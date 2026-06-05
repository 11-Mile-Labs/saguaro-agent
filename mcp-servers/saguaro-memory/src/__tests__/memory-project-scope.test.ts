// mcp-servers/saguaro-memory/src/__tests__/memory-project-scope.test.ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setEmbeddingsClientFactoryForTests } from "../../../core/src/storage/embeddings-client.js";

function byName<T extends { name: string }>(items: T[]): Record<string, T> {
  return Object.fromEntries(items.map((item) => [item.name, item]));
}

const STORAGE_ENV = ["SAGUARO_STORAGE_BACKEND", "VECTOR_STORE_BASE_URL", "SAGUARO_VECTOR_STORE_BASE_URL"];

function clearStorageEnv() {
  for (const key of STORAGE_ENV) delete process.env[key];
}

beforeEach(clearStorageEnv);

afterEach(() => {
  clearStorageEnv();
  setEmbeddingsClientFactoryForTests(undefined);
});

describe("saguaro-memory per-call project scoping", () => {
  it("isolates memories written under different project_id values", async () => {
    setEmbeddingsClientFactoryForTests(() => ({
      embed: async () => [1, 0, 0],
      embedBatch: async (texts) => texts.map(() => [1, 0, 0]),
    }));
    const projectRoot = await mkdtemp(join(tmpdir(), "saguaro-mem-scope-"));

    const { createStorageRuntime } = await import("../../../core/src/storage/config.js");
    const { createMemoryToolset } = await import("../tools.js");
    const tools = byName(createMemoryToolset({ defaultProjectRoot: projectRoot }));

    await tools.memory_store.execute({ content: "Belongs to alpha.", scope: "project", project_id: "alpha" });
    await tools.memory_store.execute({ content: "Belongs to beta.", scope: "project", project_id: "beta" });

    const alpha = await tools.memory_list.execute({ scope: "project", project_id: "alpha" });
    const beta = await tools.memory_list.execute({ scope: "project", project_id: "beta" });

    expect(alpha.memories).toHaveLength(1);
    expect(alpha.memories[0]?.content).toBe("Belongs to alpha.");
    expect(beta.memories).toHaveLength(1);
    expect(beta.memories[0]?.content).toBe("Belongs to beta.");

    const alphaRetrieve = await tools.memory_retrieve.execute({ query: "anything", project_id: "alpha" });
    expect(alphaRetrieve.results.every((r: { content: string }) => r.content === "Belongs to alpha.")).toBe(true);
  });

  it("preserves single-project behavior when project_id is omitted", async () => {
    setEmbeddingsClientFactoryForTests(() => ({
      embed: async () => [1, 0, 0],
      embedBatch: async (texts) => texts.map(() => [1, 0, 0]),
    }));
    const projectRoot = await mkdtemp(join(tmpdir(), "saguaro-mem-noscope-"));

    const { createStorageRuntime } = await import("../../../core/src/storage/config.js");
    const { createMemoryToolset } = await import("../tools.js");
    const tools = byName(createMemoryToolset({ defaultProjectRoot: projectRoot }));

    await tools.memory_store.execute({ content: "Unscoped memory.", scope: "project" });
    const listed = await tools.memory_list.execute({ scope: "project" });
    expect(listed.memories).toHaveLength(1);
  });

  it("rejects path traversal in project_id", async () => {
    setEmbeddingsClientFactoryForTests(() => ({
      embed: async () => [1, 0, 0],
      embedBatch: async (texts) => texts.map(() => [1, 0, 0]),
    }));
    const projectRoot = await mkdtemp(join(tmpdir(), "saguaro-mem-traversal-"));

    const { createStorageRuntime } = await import("../../../core/src/storage/config.js");
    const { createMemoryToolset } = await import("../tools.js");
    const tools = byName(createMemoryToolset({ defaultProjectRoot: projectRoot }));

    await expect(
      tools.memory_store.execute({ content: "Evil.", scope: "project", project_id: "../escape" }),
    ).rejects.toThrow(/Invalid project_id/);
  });

  it("keeps global-scoped memory cross-project regardless of project_id", async () => {
    setEmbeddingsClientFactoryForTests(() => ({
      embed: async () => [1, 0, 0],
      embedBatch: async (texts) => texts.map(() => [1, 0, 0]),
    }));
    const projectRoot = await mkdtemp(join(tmpdir(), "saguaro-mem-global-"));

    const { createStorageRuntime } = await import("../../../core/src/storage/config.js");
    const { createMemoryToolset } = await import("../tools.js");
    const tools = byName(createMemoryToolset({ defaultProjectRoot: projectRoot }));

    await tools.memory_store.execute({
      content: "A truly global lesson.",
      scope: "global",
      project_id: "alpha",
    });

    // A different project_id, and no project_id, must both still see it.
    const fromBeta = await tools.memory_list.execute({ scope: "global", project_id: "beta" });
    const fromNone = await tools.memory_list.execute({ scope: "global" });
    expect(fromBeta.memories).toHaveLength(1);
    expect(fromBeta.memories[0]?.content).toBe("A truly global lesson.");
    expect(fromNone.memories).toHaveLength(1);
  });
});
