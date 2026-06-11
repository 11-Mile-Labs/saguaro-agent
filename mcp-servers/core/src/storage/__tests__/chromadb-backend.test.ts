// mcp-servers/core/src/storage/__tests__/chromadb-backend.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChromaDbBackend } from "../backends/chromadb-backend.js";
import type { CollectionKey } from "../backend.js";

const KEY: CollectionKey = { namespace: "memory", scope: "project" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeBackend(): ChromaDbBackend {
  return new ChromaDbBackend({
    baseUrl: "http://chroma.test:8000",
    memoryCollection: "saguaro_memory",
    knowledgeCollection: "saguaro_knowledge",
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ChromaDbBackend", () => {
  it("resolves a collection id then upserts records", async () => {
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      if (url.endsWith("/collections")) return jsonResponse({ id: "col-1", name: "x" });
      if (url.endsWith("/upsert")) return jsonResponse({});
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const backend = makeBackend();
    await backend.upsert(KEY, [
      { id: "a", vector: [1, 0], document: "hello", metadata: { scope: "project" } },
    ]);

    const create = calls.find((c) => c.url.endsWith("/collections"));
    expect(create?.body).toMatchObject({
      name: "saguaro_memory___shared__memory__project",
      get_or_create: true,
      configuration: { hnsw: { space: "cosine" } },
    });
    const upsert = calls.find((c) => c.url.includes("/collections/col-1/upsert"));
    expect(upsert?.body).toEqual({
      ids: ["a"],
      embeddings: [[1, 0]],
      documents: ["hello"],
      metadatas: [{ scope: "project" }],
    });
  });

  it("maps query distances to [0,1] similarity scores", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/collections")) return jsonResponse({ id: "col-1", name: "x" });
        if (url.endsWith("/query")) {
          return jsonResponse({
            ids: [["near", "far"]],
            documents: [["n", "f"]],
            metadatas: [[{ scope: "project" }, { scope: "project" }]],
            embeddings: [[[1, 0], [0, 1]]],
            distances: [[0.1, 0.9]],
          });
        }
        throw new Error(`unexpected url ${url}`);
      }),
    );

    const results = await makeBackend().query(KEY, [1, 0], 2);
    expect(results[0]?.id).toBe("near");
    expect(results[0]?.score).toBeCloseTo(0.9, 5);
    expect(results[1]?.score).toBeCloseTo(0.1, 5);
  });

  it("re-resolves the collection by name and retries once when a cached id 404s", async () => {
    // Simulates the collection being deleted and recreated externally while
    // the backend still holds the stale UUID from first resolution.
    let resolves = 0;
    const upsertAttempts: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/collections")) {
          resolves += 1;
          return jsonResponse({ id: `col-${resolves}`, name: "x" });
        }
        if (url.endsWith("/upsert")) {
          const collectionId = url.match(/collections\/([^/]+)\/upsert/)?.[1] ?? "";
          upsertAttempts.push(collectionId);
          return collectionId === "col-1"
            ? new Response("collection not found", { status: 404 })
            : jsonResponse({});
        }
        throw new Error(`unexpected url ${url}`);
      }),
    );

    const backend = makeBackend();
    await backend.upsert(KEY, [
      { id: "a", vector: [1, 0], document: "hello", metadata: { scope: "project" } },
    ]);

    expect(upsertAttempts).toEqual(["col-1", "col-2"]);
    expect(resolves).toBe(2);
  });

  it("propagates a 404 that persists after one re-resolution", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/collections")) return jsonResponse({ id: "col-1", name: "x" });
        if (url.endsWith("/upsert")) return new Response("collection not found", { status: 404 });
        throw new Error(`unexpected url ${url}`);
      }),
    );

    await expect(
      makeBackend().upsert(KEY, [
        { id: "a", vector: [1, 0], document: "hello", metadata: { scope: "project" } },
      ]),
    ).rejects.toThrow(/request failed \(404/);
  });

  it("does not retry non-404 data-op failures", async () => {
    let upserts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/collections")) return jsonResponse({ id: "col-1", name: "x" });
        if (url.endsWith("/upsert")) {
          upserts += 1;
          return new Response("boom", { status: 500 });
        }
        throw new Error(`unexpected url ${url}`);
      }),
    );

    await expect(
      makeBackend().upsert(KEY, [
        { id: "a", vector: [1, 0], document: "hello", metadata: { scope: "project" } },
      ]),
    ).rejects.toThrow(/request failed \(500/);
    expect(upserts).toBe(1);
  });

  it("wraps connection failures in a clear no-fallback error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    await expect(makeBackend().healthCheck()).rejects.toThrow(
      /chromadb.*unreachable.*does not fall back to filesystem/s,
    );
  });

  it("surfaces non-2xx responses as request failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 })),
    );
    await expect(makeBackend().healthCheck()).rejects.toThrow(/request failed \(500/);
  });
});
