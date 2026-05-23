#!/usr/bin/env node
// Imports legacy .saguaro/data JSON into the configured storage backend.
// Requires a current build of the core package — run `pnpm build` inside mcp-servers/core first.
import { createStorageRuntime } from "../mcp-servers/core/dist/storage/config.mjs";
import { resolveStorageBackend, resolveStorageBackendName } from "../mcp-servers/core/dist/storage/backend-factory.mjs";
import { migrateLegacyData } from "../mcp-servers/core/dist/storage/migrate.mjs";

async function main() {
  const runtime = createStorageRuntime();
  const backendName = resolveStorageBackendName(runtime);

  // Project id for the migrated single-project data: the --project-id flag,
  // else the project-root basename that createStorageRuntime derived.
  const projectIdFlag = process.argv.indexOf("--project-id");
  const projectId = projectIdFlag >= 0 ? process.argv[projectIdFlag + 1] : runtime.projectId;

  if (projectIdFlag >= 0 && (!projectId || projectId.startsWith("-"))) {
    console.error("Error: --project-id requires a value.");
    process.exit(1);
  }

  if (backendName === "filesystem") {
    console.error(
      "No durable backend is configured (resolved: filesystem). " +
        "Set VECTOR_STORE_BASE_URL or SAGUARO_STORAGE_BACKEND before migrating.",
    );
    process.exit(1);
  }

  const backend = resolveStorageBackend(runtime);
  console.error(`Health-checking storage backend "${backend.name}"...`);
  await backend.healthCheck();

  console.error(
    `Migrating legacy data from ${runtime.paths.memoryDataDir} and ${runtime.paths.knowledgeDataDir}...`,
  );
  const summary = await migrateLegacyData(
    { memoryDir: runtime.paths.memoryDataDir, knowledgeDir: runtime.paths.knowledgeDataDir },
    backend,
    { projectId },
  );

  console.log(JSON.stringify({ backend: backend.name, projectId: projectId ?? null, ...summary }, null, 2));
}

main().catch((error) => {
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
