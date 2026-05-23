import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { StorageRuntime } from "../../core/src/storage/types.js";
import { createKnowledgeToolset } from "./tools.js";

export function createServer(runtime: StorageRuntime): McpServer {
  const server = new McpServer({
    name: "saguaro-knowledge",
    version: "0.1.0-alpha.2",
  });

  for (const tool of createKnowledgeToolset(runtime)) {
    server.tool(tool.name, tool.description, tool.inputSchema, async (args) => ({
      content: [{ type: "text" as const, text: JSON.stringify(await tool.execute(args), null, 2) }],
    }));
  }

  return server;
}
