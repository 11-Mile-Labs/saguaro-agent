import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { parse as parseYaml } from "yaml";

export const HarnessSchema = z.enum(["claude", "codex", "gemini", "unknown"]);
export type HarnessName = z.infer<typeof HarnessSchema>;

export const ScopeSchema = z.enum(["run", "project", "global"]);
export type ScopeName = z.infer<typeof ScopeSchema>;

export const ModelTierSchema = z.enum(["standard", "deep", "surgeon"]);
export type ModelTier = z.infer<typeof ModelTierSchema>;

export const EffortSchema = z.enum(["low", "medium", "high"]);
export type Effort = z.infer<typeof EffortSchema>;

const EndpointConfigSchema = z
  .object({
    url: z.string().min(1).optional(),
    base_url: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    collection: z.string().min(1).optional(),
    api_key_env: z.string().min(1).optional(),
  })
  .strict();

const RedactionConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    disabled_rules: z.string().optional(),
    additional_allow_patterns: z.string().optional(),
  })
  .strict();

const StorageCollectionConfigSchema = EndpointConfigSchema.extend({
  data_dir: z.string().min(1).optional(),
  path: z.string().min(1).optional(),
  chunk_size: z.number().int().positive().optional(),
});

export const SaguaroConfigSchema = z
  .object({
    embeddings: EndpointConfigSchema.extend({
      api_key_env: z.string().min(1),
    }),
    llm: EndpointConfigSchema.extend({
      api_key_env: z.string().min(1),
      temperature: z.number().optional(),
    }).optional(),
    redaction: RedactionConfigSchema.optional(),
    memory: StorageCollectionConfigSchema.optional(),
    knowledge: StorageCollectionConfigSchema.optional(),
    defaults: z
      .object({
        model_tier: ModelTierSchema.default("standard").optional(),
        effort: EffortSchema.default("medium").optional(),
        memory_scope: z.array(ScopeSchema).default(["run", "project"]).optional(),
        knowledge_scope: z.array(ScopeSchema).default(["project"]).optional(),
      })
      .strict()
      .optional(),
    model_tiers: z
      .object({
        claude: z.record(ModelTierSchema, z.string().min(1)).optional(),
        codex: z.record(ModelTierSchema, z.string().min(1)).optional(),
        gemini: z.record(ModelTierSchema, z.string().min(1)).optional(),
      })
      .strict()
      .optional(),
    storage: z
      .object({
        backend: z.string().optional(),
        vector_store_base_url: z.string().optional(),
      })
      .strict()
      .optional(),
    workflows_dir: z.string().min(1).default(".saguaro/workflows"),
    runs_dir: z.string().min(1).default(".saguaro/runs"),
  })
  .strict();

export type SaguaroConfig = z.infer<typeof SaguaroConfigSchema>;

export interface LoadedSaguaroConfig {
  projectRoot: string;
  configPath: string;
  config: SaguaroConfig;
}

export function detectHarness(env: NodeJS.ProcessEnv = process.env): HarnessName {
  const explicit = env.SAGUARO_HARNESS?.trim().toLowerCase();
  if (explicit === "claude" || explicit === "codex" || explicit === "gemini") {
    return explicit;
  }

  if (env.CODEX_HOME || env.CODEX_SANDBOX) {
    return "codex";
  }

  if (env.CLAUDECODE || env.CLAUDE_CONFIG_DIR) {
    return "claude";
  }

  if (env.GEMINI_CLI || env.GEMINI_API_KEY) {
    return "gemini";
  }

  return "unknown";
}

export function findProjectRoot(startPath = process.cwd()): string {
  let current = resolve(startPath);

  while (true) {
    if (existsSync(resolve(current, ".saguaro", "config.yaml"))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      throw new Error(
        `Unable to locate project root from ${startPath}. Expected to find .saguaro/config.yaml in the current directory or an ancestor.`
      );
    }
    current = parent;
  }
}

export function loadSaguaroConfig(projectRoot = findProjectRoot()): LoadedSaguaroConfig {
  const root = resolve(projectRoot);
  const configPath = resolve(root, ".saguaro", "config.yaml");

  if (!existsSync(configPath)) {
    throw new Error(`Missing project-local config at ${configPath}.`);
  }

  const raw = parseYaml(readFileSync(configPath, "utf8"));
  const parsed = SaguaroConfigSchema.safeParse(raw);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid .saguaro/config.yaml: ${issues}`);
  }

  return {
    projectRoot: root,
    configPath,
    config: parsed.data,
  };
}

export function llmApiKeyEnv(config: SaguaroConfig): string | undefined {
  return config.llm?.api_key_env;
}

export function resolveProjectPath(projectRoot: string, maybeRelative: string): string {
  return resolve(projectRoot, maybeRelative);
}
