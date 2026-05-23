import { appendDispatchLog } from "../../core/src/storage/dispatch-log.js";
import { MemoryStorage } from "../../core/src/storage/memory-store.js";
import { resolveStorageBackend } from "../../core/src/storage/backend-factory.js";
import { assertProjectId } from "../../core/src/storage/backend.js";
import type { DispatchContextInput, MemoryScope, StorageRuntime } from "../../core/src/storage/types.js";
import { z } from "zod";

interface MemoryToolDefinition {
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

const memoryScopeSchema = z.enum(["run", "project", "global"]);

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
      server: "saguaro-memory",
      tool: toolName,
      args,
      durationMs: Date.now() - startedAt,
      ok: true,
    });
    return result;
  } catch (error) {
    await appendDispatchLog(runtime.paths, asDispatchContext(args), {
      server: "saguaro-memory",
      tool: toolName,
      args,
      durationMs: Date.now() - startedAt,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export function createMemoryToolset(runtime: StorageRuntime): MemoryToolDefinition[] {
  const backend = resolveStorageBackend(runtime);
  const storage = new MemoryStorage(runtime, backend);

  return [
    {
      name: "memory_store",
      description:
        "Capture a durable lesson, observation, or outcome so future runs can build on it. If there is even a 1% chance this finding matters later, store it now instead of trusting a future agent to rediscover it.",
      inputSchema: {
        ...dispatchContextSchema,
        ...projectScopeSchema,
        content: z.string().trim().min(1).describe("Sentence-to-paragraph memory content to store."),
        scope: memoryScopeSchema.optional().describe("Memory scope. Defaults to run."),
        tags: z.array(z.string().trim().min(1)).optional().describe("Optional tags for retrieval and filtering."),
      },
      execute: async (args) =>
        withDispatchLog(runtime, "memory_store", args, async () =>
          storage.store({
            content: String(args.content),
            scope: args.scope as MemoryScope | undefined,
            tags: normalizeTags(args.tags),
            runId: typeof args.run_id === "string" ? args.run_id : undefined,
            projectId: resolveProjectId(args.project_id),
          })),
    },
    {
      name: "memory_retrieve",
      description:
        "Search persistent agent memory for relevant lessons, observations, and prior outcomes. If there is even a 1% chance the agent has seen something related before, call this FIRST before doing other work.",
      inputSchema: {
        ...dispatchContextSchema,
        ...projectScopeSchema,
        query: z.string().trim().min(1).describe("What you want to learn from durable memory."),
        scope: memoryScopeSchema.optional().describe("Optional single scope restriction."),
        limit: z.number().int().min(1).max(25).optional().describe("Maximum results to return."),
        tags: z.array(z.string().trim().min(1)).optional().describe("Optional tag filter."),
      },
      execute: async (args) =>
        withDispatchLog(runtime, "memory_retrieve", args, async () =>
          storage.retrieve({
            query: String(args.query),
            scope: args.scope as MemoryScope | undefined,
            limit: typeof args.limit === "number" ? args.limit : undefined,
            tags: normalizeTags(args.tags),
            runId: typeof args.run_id === "string" ? args.run_id : undefined,
            projectId: resolveProjectId(args.project_id),
          })),
    },
    {
      name: "memory_pin",
      description:
        "Pin a critical memory so it rises to the top when there is even a 1% chance it should shape future work.",
      inputSchema: {
        ...dispatchContextSchema,
        ...projectScopeSchema,
        id: z.string().trim().min(1).describe("Memory identifier to pin."),
      },
      execute: async (args) =>
        withDispatchLog(runtime, "memory_pin", args, async () => storage.pin(String(args.id), resolveProjectId(args.project_id))),
    },
    {
      name: "memory_unpin",
      description:
        "Remove the forced priority from a pinned memory when the 1% rule no longer justifies surfacing it first.",
      inputSchema: {
        ...dispatchContextSchema,
        ...projectScopeSchema,
        id: z.string().trim().min(1).describe("Memory identifier to unpin."),
      },
      execute: async (args) =>
        withDispatchLog(runtime, "memory_unpin", args, async () => storage.unpin(String(args.id), resolveProjectId(args.project_id))),
    },
    {
      name: "memory_promote",
      description:
        "Promote a memory from a narrower scope to a broader one when there is even a 1% chance future runs beyond the current context should inherit it.",
      inputSchema: {
        ...dispatchContextSchema,
        ...projectScopeSchema,
        id: z.string().trim().min(1).describe("Memory identifier to promote."),
        target_scope: z.enum(["project", "global"]).describe("Broader scope to promote this memory into."),
      },
      execute: async (args) =>
        withDispatchLog(runtime, "memory_promote", args, async () =>
          storage.promote(String(args.id), args.target_scope as MemoryScope, resolveProjectId(args.project_id))),
    },
    {
      name: "memory_list",
      description:
        "List memories in one scope so you can inspect what durable context is available before assuming it must be recreated from scratch.",
      inputSchema: {
        ...dispatchContextSchema,
        ...projectScopeSchema,
        scope: memoryScopeSchema.describe("Scope to list."),
        filter: z
          .object({
            tags: z.array(z.string().trim().min(1)).optional(),
            since: z.string().trim().min(1).optional(),
            pinned: z.boolean().optional(),
          })
          .optional()
          .describe("Optional list filters."),
      },
      execute: async (args) =>
        withDispatchLog(runtime, "memory_list", args, async () =>
          storage.list({
            scope: args.scope as MemoryScope,
            filter: (args.filter as { tags?: string[]; since?: string; pinned?: boolean } | undefined),
            runId: typeof args.run_id === "string" ? args.run_id : undefined,
            projectId: resolveProjectId(args.project_id),
          })),
    },
    {
      name: "memory_status",
      description:
        "Inspect the health and shape of persistent memory so the agent knows what durable context already exists before skipping the 1% retrieval habit.",
      inputSchema: {
        ...dispatchContextSchema,
        ...projectScopeSchema,
        scope: memoryScopeSchema.optional().describe("Optional single scope restriction."),
      },
      execute: async (args) =>
        withDispatchLog(runtime, "memory_status", args, async () =>
          storage.status(
            args.scope as MemoryScope | undefined,
            typeof args.run_id === "string" ? args.run_id : undefined,
            resolveProjectId(args.project_id),
          )),
    },
    {
      name: "memory_delete",
      description:
        "Delete a memory when it should no longer influence future work, keeping the 1% rule pointed at current and trustworthy context.",
      inputSchema: {
        ...dispatchContextSchema,
        ...projectScopeSchema,
        id: z.string().trim().min(1).describe("Memory identifier to delete."),
      },
      execute: async (args) =>
        withDispatchLog(runtime, "memory_delete", args, async () => storage.delete(String(args.id), resolveProjectId(args.project_id))),
    },
  ];
}
