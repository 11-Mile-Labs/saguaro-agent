import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createKnowledgeToolset } from "./tools.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

export function createServer(): McpServer {
  const server = new McpServer({
    name: "saguaro-knowledge",
    version,
  });

  for (const tool of createKnowledgeToolset()) {
    server.tool(tool.name, tool.description, tool.inputSchema, async (args) => ({
      content: [{ type: "text" as const, text: JSON.stringify(await tool.execute(args), null, 2) }],
    }));
  }

  return server;
}
