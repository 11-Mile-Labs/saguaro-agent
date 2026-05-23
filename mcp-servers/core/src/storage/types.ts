export const MEMORY_SCOPES = ["run", "project", "global"] as const;
export const KNOWLEDGE_SCOPES = ["project", "global"] as const;

export type MemoryScope = (typeof MEMORY_SCOPES)[number];
export type KnowledgeScope = (typeof KNOWLEDGE_SCOPES)[number];

export interface SaguaroConfig {
  runs_dir?: string;
  embeddings?: {
    base_url?: string;
    url?: string;
    model?: string;
    api_key_env?: string;
  };
  llm?: {
    base_url?: string;
    url?: string;
    api_key_env?: string;
    model?: string;
    temperature?: number;
  };
  redaction?: {
    enabled?: boolean;
    disabled_rules?: string;
    additional_allow_patterns?: string;
  };
  memory?: {
    data_dir?: string;
    path?: string;
    collection?: string;
  };
  knowledge?: {
    data_dir?: string;
    path?: string;
    collection?: string;
    chunk_size?: number;
  };
  storage?: {
    backend?: string;
    vector_store_base_url?: string;
  };
}

export interface StoragePaths {
  projectRoot: string;
  configPath: string;
  runsDir: string;
  memoryDataDir: string;
  knowledgeDataDir: string;
}

export interface StorageRuntime {
  config: SaguaroConfig;
  paths: StoragePaths;
  /** Stable project identity: the project-root basename, slugified. Undefined when not derivable. */
  projectId?: string;
}

export interface DispatchContextInput {
  run_id?: string;
  phase_id?: string;
}

export interface MemoryRecord {
  id: string;
  vectorId: string;
  content: string;
  embedding?: number[];
  scope: MemoryScope;
  tags: string[];
  storedAt: string;
  updatedAt: string;
  pinnedAt?: string;
  promotedAt?: string;
  promotedFrom?: MemoryScope;
  deletedAt?: string;
  runId?: string;
  redactions?: string[];
  redactedAt?: string;
}

export interface MemoryListFilter {
  tags?: string[];
  since?: string;
  pinned?: boolean;
}

export interface KnowledgeChunk {
  id: string;
  documentId: string;
  index: number;
  content: string;
  embedding?: number[];
}

export interface KnowledgeDocumentRecord {
  documentId: string;
  title: string;
  content: string;
  scope: KnowledgeScope;
  tags: string[];
  sourceUrl?: string;
  ingestedAt: string;
  updatedAt: string;
  deletedAt?: string;
  redactions?: string[];
  redactedAt?: string;
  chunks: KnowledgeChunk[];
}

export interface KnowledgeListFilter {
  tags?: string[];
  since?: string;
}
