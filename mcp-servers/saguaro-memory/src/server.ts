import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMemoryToolset } from "./tools.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "saguaro-memory",
    version: "0.1.0-alpha.2",
  });

  for (const tool of createMemoryToolset()) {
    server.tool(tool.name, tool.description, tool.inputSchema, async (args) => ({
      content: [{ type: "text" as const, text: JSON.stringify(await tool.execute(args), null, 2) }],
    }));
  }

  return server;
}
