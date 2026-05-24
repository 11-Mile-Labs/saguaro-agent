// mcp-servers/saguaro-knowledge/src/__tests__/knowledge-project-scope.test.ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { setEmbeddingsClientFactoryForTests } from "../../../core/src/storage/embeddings-client.js";
import { setSynthesisClientFactoryForTests } from "../../../core/src/storage/synthesis-openai-client.js";

function byName<T extends { name: string }>(items: T[]): Record<string, T> {
  return Object.fromEntries(items.map((item) => [item.name, item]));
}

function installFakes() {
  setEmbeddingsClientFactoryForTests(() => ({
    embed: async () => [1, 0],
    embedBatch: async (texts) => texts.map(() => [1, 0]),
  }));
  setSynthesisClientFactoryForTests(() => ({ synthesize: async () => "answer" }));
}

afterEach(() => {
  setEmbeddingsClientFactoryForTests(undefined);
  setSynthesisClientFactoryForTests(undefined);
});

describe("saguaro-knowledge per-call project scoping", () => {
  it("isolates documents written under different project_id values", async () => {
    installFakes();
    const projectRoot = await mkdtemp(join(tmpdir(), "saguaro-kn-scope-"));
    const { createStorageRuntime } = await import("../../../core/src/storage/config.js");
    const { createKnowledgeToolset } = await import("../tools.js");
    const tools = byName(createKnowledgeToolset({ defaultProjectRoot: projectRoot }));

    await tools.knowledge_ingest.execute({ title: "Alpha", content: "Alpha body.", scope: "project", project_id: "alpha" });
    await tools.knowledge_ingest.execute({ title: "Beta", content: "Beta body.", scope: "project", project_id: "beta" });

    const alpha = await tools.knowledge_list.execute({ scope: "project", project_id: "alpha" });
    const beta = await tools.knowledge_list.execute({ scope: "project", project_id: "beta" });

    expect(alpha.documents.map((d: { title: string }) => d.title)).toEqual(["Alpha"]);
    expect(beta.documents.map((d: { title: string }) => d.title)).toEqual(["Beta"]);
  });

  it("rejects path traversal in project_id", async () => {
    installFakes();
    const projectRoot = await mkdtemp(join(tmpdir(), "saguaro-kn-traversal-"));
    const { createStorageRuntime } = await import("../../../core/src/storage/config.js");
    const { createKnowledgeToolset } = await import("../tools.js");
    const tools = byName(createKnowledgeToolset({ defaultProjectRoot: projectRoot }));

    await expect(
      tools.knowledge_ingest.execute({ title: "X", content: "Y", scope: "project", project_id: "../escape" }),
    ).rejects.toThrow(/Invalid project_id/);
  });
});
