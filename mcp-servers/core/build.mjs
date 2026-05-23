import { build } from "esbuild";

const entries = [
  "src/index.ts",
  "src/config.ts",
  "src/workflow/discovery.ts",
  "src/workflow/dispatch-log.ts",
  "src/workflow/envelope.ts",
  "src/workflow/queue.ts",
  "src/workflow/runtime.ts",
  "src/workflow/types.ts",
  "src/storage/config.ts",
  "src/storage/dispatch-log.ts",
  "src/storage/embeddings-client.ts",
  "src/storage/filesystem.ts",
  "src/storage/knowledge-store.ts",
  "src/storage/memory-store.ts",
  "src/storage/redaction.ts",
  "src/storage/synthesis-openai-client.ts",
  "src/storage/tokenize.ts",
  "src/storage/types.ts",
  "src/storage/vector-score.ts",
  "src/storage/backend-factory.ts",
  "src/storage/migrate.ts",
  "src/storage/record-mappers.ts",
  "src/storage/backends/chromadb-backend.ts",
  "src/storage/backends/filesystem-backend.ts",
];

for (const entry of entries) {
  const outfile = `dist/${entry.replace(/^src\//, "").replace(/\.ts$/, ".mjs")}`;
  await build({
    entryPoints: [entry],
    bundle: true,
    platform: "node",
    target: "node22",
    format: "esm",
    outfile,
    sourcemap: true,
    minify: false,
  });
  console.log(`Built ${outfile}`);
}

console.log("saguaro-core build complete.");
