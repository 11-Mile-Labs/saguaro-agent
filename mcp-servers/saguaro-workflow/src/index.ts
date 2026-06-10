import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadGlobalEnv } from "@11-mile-labs/saguaro-core";
import { createServer } from "./server.js";

async function main() {
  const globalEnv = loadGlobalEnv();
  if (globalEnv.applied.length) {
    console.error(`saguaro-workflow: loaded ${globalEnv.applied.length} env var(s) from ${globalEnv.filePath}`);
  }
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("saguaro-workflow MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
