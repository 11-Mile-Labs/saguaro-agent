// mcp-servers/core/src/storage/backend.ts

/** Which logical store a collection belongs to. */
export type StorageNamespace = "memory" | "knowledge";

export const STORAGE_BACKEND_NAMES = ["filesystem", "chromadb"] as const;
export type StorageBackendName = (typeof STORAGE_BACKEND_NAMES)[number];

/** Identifies one logical collection: a namespace + scope, optionally project-scoped. */
export interface CollectionKey {
  namespace: StorageNamespace;
  /** "run" | "project" | "global" — kept as a string so memory and knowledge share the type. */
  scope: string;
  /** Optional per-call project selector. Absent => the boot-time project. */
  projectId?: string;
}

/** Backend-agnostic stored record. Metadata values must be JSON scalars (ChromaDB constraint). */
export interface StoredRecord {
  id: string;
  vector: number[];
  document: string;
  metadata: Record<string, string | number | boolean>;
}

export interface ScoredRecord extends StoredRecord {
  /** Cosine similarity in [0,1]. Higher is closer. */
  score: number;
}

/**
 * Record-oriented persistence + similarity search. `MemoryStorage` and
 * `KnowledgeStorage` depend on this instead of importing `filesystem.ts`.
 */
export interface StorageBackend {
  /** Stable label surfaced in tool responses as `vector_store`. */
  readonly name: string;
  /** Throws a clear error if the backend is configured but unreachable. */
  healthCheck(): Promise<void>;
  /** Insert or replace records by id. */
  upsert(key: CollectionKey, records: StoredRecord[]): Promise<void>;
  /** Vector similarity search; returns up to `limit` records, score-ranked descending. */
  query(key: CollectionKey, vector: number[], limit: number): Promise<ScoredRecord[]>;
  /** Fetch one record by id, or undefined if absent. */
  get(key: CollectionKey, id: string): Promise<StoredRecord | undefined>;
  /** Return every record in the collection. */
  list(key: CollectionKey): Promise<StoredRecord[]>;
  /** Hard-delete one record by id. No-op if absent. */
  delete(key: CollectionKey, id: string): Promise<void>;
}

const PROJECT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Validates a per-call project id, rejecting path traversal and unsafe characters. */
export function assertProjectId(value: string): string {
  if (!PROJECT_ID_RE.test(value) || value.includes("..")) {
    throw new Error(
      `Invalid project_id "${value}". Use letters, digits, dot, dash, underscore; ` +
        `it must start alphanumeric and contain no path separators or "..".`,
    );
  }
  return value;
}

/** Deterministic collection name: base__project__namespace__scope. */
export function collectionName(base: string, key: CollectionKey): string {
  const project = key.projectId ? assertProjectId(key.projectId) : "_shared";
  return `${base}__${project}__${key.namespace}__${key.scope}`;
}

/**
 * Build a CollectionKey. The `global` scope is always cross-project: it never
 * carries a projectId, so any projectId argument is dropped for global records.
 * Every store and the migration build keys through this one helper.
 */
export function collectionKey(
  namespace: StorageNamespace,
  scope: string,
  projectId?: string,
): CollectionKey {
  return {
    namespace,
    scope,
    ...(projectId && scope !== "global" ? { projectId } : {}),
  };
}
