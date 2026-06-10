import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadGlobalEnv } from "../../core/src/global-env.js";
import { createServer } from "./server.js";

async function main() {
  const globalEnv = loadGlobalEnv();
  if (globalEnv.applied.length) {
    console.error(`saguaro-memory: loaded ${globalEnv.applied.length} env var(s) from ${globalEnv.filePath}`);
  }
  const server = createServer();
  await server.connect(new StdioServerTransport());
  console.error("saguaro-memory MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
