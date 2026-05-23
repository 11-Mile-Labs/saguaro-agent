import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createStorageRuntime } from "../../core/src/storage/config.js";
import { createServer } from "./server.js";

async function main() {
  const runtime = createStorageRuntime();
  const server = createServer(runtime);
  await server.connect(new StdioServerTransport());
  console.error("saguaro-memory MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
