import { appendDispatchLog } from "../../core/src/storage/dispatch-log.js";
import { KnowledgeStorage } from "../../core/src/storage/knowledge-store.js";
import { resolveStorageBackend } from "../../core/src/storage/backend-factory.js";
import { assertProjectId } from "../../core/src/storage/backend.js";
import type { DispatchContextInput, KnowledgeScope, StorageRuntime } from "../../core/src/storage/types.js";
import { z } from "zod";

interface KnowledgeToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, z.ZodTypeAny>;
  execute(args: Record<string, unknown>): Promise<any>;
}

const dispatchContextSchema = {
  run_id: z.string().trim().min(1).optional().describe("Workflow run identifier for dispatch logging."),
  phase_id: z.string().trim().min(1).optional().describe("Workflow phase identifier for dispatch logging."),
};

const projectScopeSchema = {
  project_id: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Optional project selector so one server can serve multiple workspaces."),
};

const knowledgeScopeSchema = z.enum(["project", "global"]);

function asDispatchContext(args: Record<string, unknown>): DispatchContextInput {
  return {
    run_id: typeof args.run_id === "string" ? args.run_id : undefined,
    phase_id: typeof args.phase_id === "string" ? args.phase_id : undefined,
  };
}

function resolveProjectId(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) return undefined;
  return assertProjectId(value.trim());
}

function normalizeTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

async function withDispatchLog(
  runtime: StorageRuntime,
  toolName: string,
  args: Record<string, unknown>,
  action: () => Promise<any>,
): Promise<any> {
  const startedAt = Date.now();
  try {
    const result = await action();
    await appendDispatchLog(runtime.paths, asDispatchContext(args), {
      server: "saguaro-knowledge",
      tool: toolName,
      args,
      durationMs: Date.now() - startedAt,
      ok: true,
    });
    return result;
  } catch (error) {
    await appendDispatchLog(runtime.paths, asDispatchContext(args), {
      server: "saguaro-knowledge",
      tool: toolName,
      args,
      durationMs: Date.now() - startedAt,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export function createKnowledgeToolset(runtime: StorageRuntime): KnowledgeToolDefinition[] {
  const backend = resolveStorageBackend(runtime);
  const storage = new KnowledgeStorage(runtime, backend);

  return [
    {
      name: "knowledge_ingest",
      description:
        "Add a document to the durable knowledge corpus. If there is even a 1% chance this artifact will help a future run, ingest it instead of letting it vanish into chat history.",
      inputSchema: {
        ...dispatchContextSchema,
        ...projectScopeSchema,
        title: z.string().trim().min(1).describe("Human-readable title for the ingested document."),
        content: z.string().trim().min(1).describe("Full durable document content to ingest."),
        scope: knowledgeScopeSchema.optional().describe("Knowledge scope. Defaults to project."),
        tags: z.array(z.string().trim().min(1)).optional().describe("Optional tags for discovery and filtering."),
        source_url: z.string().trim().url().optional().describe("Optional source URL for provenance."),
      },
      execute: async (args) =>
        withDispatchLog(runtime, "knowledge_ingest", args, async () =>
          storage.ingest({
            title: String(args.title),
            content: String(args.content),
            scope: args.scope as KnowledgeScope | undefined,
            tags: normalizeTags(args.tags),
            sourceUrl: typeof args.source_url === "string" ? args.source_url : undefined,
            projectId: resolveProjectId(args.project_id),
          })),
    },
    {
      name: "knowledge_query",
      description:
        "Query the durable knowledge corpus before researching from scratch. If there is even a 1% chance the answer already exists in ingested docs, call this FIRST.",
      inputSchema: {
        ...dispatchContextSchema,
        ...projectScopeSchema,
        prompt: z.string().trim().min(1).describe("Question or prompt to answer from durable knowledge."),
        scope: knowledgeScopeSchema.optional().describe("Optional single scope restriction."),
        max_chunks: z.number().int().min(1).max(25).optional().describe("Maximum matching chunks to return."),
      },
      execute: async (args) =>
        withDispatchLog(runtime, "knowledge_query", args, async () =>
          storage.query({
            prompt: String(args.prompt),
            scope: args.scope as KnowledgeScope | undefined,
            maxChunks: typeof args.max_chunks === "number" ? args.max_chunks : undefined,
            projectId: resolveProjectId(args.project_id),
          })),
    },
    {
      name: "knowledge_search",
      description:
        "Search the durable knowledge corpus to discover what documents exist on a topic. If there is even a 1% chance prior work already covered this, search before guessing.",
      inputSchema: {
        ...dispatchContextSchema,
        ...projectScopeSchema,
        query: z.string().trim().min(1).describe("Search query for document discovery."),
        scope: knowledgeScopeSchema.optional().describe("Optional single scope restriction."),
        limit: z.number().int().min(1).max(25).optional().describe("Maximum matching documents to return."),
      },
      execute: async (args) =>
        withDispatchLog(runtime, "knowledge_search", args, async () =>
          storage.search({
            query: String(args.query),
            scope: args.scope as KnowledgeScope | undefined,
            limit: typeof args.limit === "number" ? args.limit : undefined,
            projectId: resolveProjectId(args.project_id),
          })),
    },
    {
      name: "knowledge_list",
      description:
        "List the durable knowledge corpus so the agent can see what already exists before spending time rebuilding context that may already be preserved.",
      inputSchema: {
        ...dispatchContextSchema,
        ...projectScopeSchema,
        scope: knowledgeScopeSchema.optional().describe("Optional single scope restriction."),
        filter: z
          .object({
            tags: z.array(z.string().trim().min(1)).optional(),
            since: z.string().trim().min(1).optional(),
          })
          .optional()
          .describe("Optional filters for listing durable knowledge."),
      },
      execute: async (args) =>
        withDispatchLog(runtime, "knowledge_list", args, async () =>
          storage.list(
            args.scope as KnowledgeScope | undefined,
            args.filter as { tags?: string[]; since?: string } | undefined,
            resolveProjectId(args.project_id),
          )),
    },
    {
      name: "knowledge_get",
      description:
        "Fetch a single durable knowledge document when there is even a 1% chance its exact source material matters more than a paraphrase.",
      inputSchema: {
        ...dispatchContextSchema,
        ...projectScopeSchema,
        document_id: z.string().trim().min(1).describe("Document identifier to fetch."),
      },
      execute: async (args) =>
        withDispatchLog(runtime, "knowledge_get", args, async () => storage.get(String(args.document_id), resolveProjectId(args.project_id))),
    },
    {
      name: "knowledge_update",
      description:
        "Refresh a durable knowledge document so future 1% rule lookups hit the current truth instead of stale guidance.",
      inputSchema: {
        ...dispatchContextSchema,
        ...projectScopeSchema,
        document_id: z.string().trim().min(1).describe("Document identifier to update."),
        content: z.string().trim().min(1).optional().describe("Optional replacement content."),
        tags: z.array(z.string().trim().min(1)).optional().describe("Optional replacement tags."),
      },
      execute: async (args) =>
        withDispatchLog(runtime, "knowledge_update", args, async () =>
          storage.update(
            String(args.document_id),
            typeof args.content === "string" ? args.content : undefined,
            normalizeTags(args.tags),
            resolveProjectId(args.project_id),
          )),
    },
    {
      name: "knowledge_delete",
      description:
        "Delete a durable knowledge document when it should no longer shape future work, keeping 1% rule retrieval grounded in current sources.",
      inputSchema: {
        ...dispatchContextSchema,
        ...projectScopeSchema,
        document_id: z.string().trim().min(1).describe("Document identifier to delete."),
      },
      execute: async (args) =>
        withDispatchLog(runtime, "knowledge_delete", args, async () => storage.delete(String(args.document_id), resolveProjectId(args.project_id))),
    },
  ];
}
