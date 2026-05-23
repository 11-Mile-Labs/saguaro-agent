// mcp-servers/core/src/storage/backends/chromadb-backend.ts
import { collectionName } from "../backend.js";
import type { CollectionKey, ScoredRecord, StorageBackend, StoredRecord } from "../backend.js";

const TENANT = "default_tenant";
const DATABASE = "default_database";

export interface ChromaDbBackendOptions {
  /** VECTOR_STORE_BASE_URL, e.g. http://localhost:8000 */
  baseUrl: string;
  /** VECTOR_STORE_API_KEY — optional; omit for an unauthenticated LAN server. */
  apiKey?: string;
  /** Collection-name prefix for memory collections (config `memory.collection`). */
  memoryCollection: string;
  /** Collection-name prefix for knowledge collections (config `knowledge.collection`). */
  knowledgeCollection: string;
}

interface ChromaCollection {
  id: string;
  name: string;
}

interface ChromaGetResult {
  ids: string[];
  documents: (string | null)[];
  metadatas: (Record<string, string | number | boolean> | null)[];
  embeddings: (number[] | null)[];
}

interface ChromaQueryResult {
  ids: string[][];
  documents: (string | null)[][];
  metadatas: (Record<string, string | number | boolean> | null)[][];
  embeddings: (number[] | null)[][];
  distances: number[][];
}

/** ChromaDB v2 REST adapter. Persistence + similarity search; Saguaro owns embeddings. */
export class ChromaDbBackend implements StorageBackend {
  readonly name = "chromadb";
  private readonly apiBase: string;
  private readonly root: string;
  private readonly collectionIds = new Map<string, string>();

  constructor(private readonly options: ChromaDbBackendOptions) {
    const base = options.baseUrl.replace(/\/+$/, "");
    this.apiBase = `${base}/api/v2`;
    this.root = `${this.apiBase}/tenants/${TENANT}/databases/${DATABASE}`;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.options.apiKey) {
      headers.Authorization = `Bearer ${this.options.apiKey}`;
    }
    return headers;
  }

  private async request(method: string, url: string, body?: unknown): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: this.headers(),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (cause) {
      throw new Error(
        `Saguaro storage backend "chromadb" at ${this.options.baseUrl} is unreachable: ` +
          `${cause instanceof Error ? cause.message : String(cause)}. ` +
          `The backend is configured but not responding; Saguaro does not fall back to filesystem.`,
      );
    }
    if (!response.ok) {
      throw new Error(
        `Saguaro storage backend "chromadb" request failed ` +
          `(${response.status} ${method} ${url}): ${await response.text()}`,
      );
    }
    if (response.status === 204) return undefined;
    const text = await response.text();
    return text ? (JSON.parse(text) as unknown) : undefined;
  }

  async healthCheck(): Promise<void> {
    await this.request("GET", `${this.apiBase}/heartbeat`);
  }

  private baseFor(namespace: CollectionKey["namespace"]): string {
    return namespace === "memory"
      ? this.options.memoryCollection
      : this.options.knowledgeCollection;
  }

  /** Get-or-create the collection and cache its UUID (data ops key on the id). */
  private async collectionId(key: CollectionKey): Promise<string> {
    const name = collectionName(this.baseFor(key.namespace), key);
    const cached = this.collectionIds.get(name);
    if (cached) return cached;
    const created = (await this.request("POST", `${this.root}/collections`, {
      name,
      get_or_create: true,
      configuration: { hnsw: { space: "cosine" } },
    })) as ChromaCollection;
    this.collectionIds.set(name, created.id);
    return created.id;
  }

  private toStored(result: ChromaGetResult): StoredRecord[] {
    return result.ids.map((id, index) => ({
      id,
      vector: result.embeddings[index] ?? [],
      document: result.documents[index] ?? "",
      metadata: result.metadatas[index] ?? {},
    }));
  }

  async upsert(key: CollectionKey, records: StoredRecord[]): Promise<void> {
    if (records.length === 0) return;
    const id = await this.collectionId(key);
    await this.request("POST", `${this.root}/collections/${id}/upsert`, {
      ids: records.map((record) => record.id),
      embeddings: records.map((record) => record.vector),
      documents: records.map((record) => record.document),
      metadatas: records.map((record) => record.metadata),
    });
  }

  async query(key: CollectionKey, vector: number[], limit: number): Promise<ScoredRecord[]> {
    const id = await this.collectionId(key);
    const result = (await this.request("POST", `${this.root}/collections/${id}/query`, {
      query_embeddings: [vector],
      n_results: Math.max(1, limit),
      include: ["documents", "metadatas", "embeddings", "distances"],
    })) as ChromaQueryResult;

    const ids = result.ids[0] ?? [];
    return ids.map((recordId, index) => ({
      id: recordId,
      vector: result.embeddings[0]?.[index] ?? [],
      document: result.documents[0]?.[index] ?? "",
      metadata: result.metadatas[0]?.[index] ?? {},
      // ChromaDB cosine "space" returns distance = 1 - similarity.
      score: Math.max(0, Math.min(1, 1 - (result.distances[0]?.[index] ?? 1))),
    }));
  }

  async get(key: CollectionKey, recordId: string): Promise<StoredRecord | undefined> {
    const id = await this.collectionId(key);
    const result = (await this.request("POST", `${this.root}/collections/${id}/get`, {
      ids: [recordId],
      include: ["documents", "metadatas", "embeddings"],
    })) as ChromaGetResult;
    return this.toStored(result)[0];
  }

  async list(key: CollectionKey): Promise<StoredRecord[]> {
    const id = await this.collectionId(key);
    const result = (await this.request("POST", `${this.root}/collections/${id}/get`, {
      include: ["documents", "metadatas", "embeddings"],
    })) as ChromaGetResult;
    return this.toStored(result);
  }

  async delete(key: CollectionKey, recordId: string): Promise<void> {
    const id = await this.collectionId(key);
    await this.request("POST", `${this.root}/collections/${id}/delete`, { ids: [recordId] });
  }
}
