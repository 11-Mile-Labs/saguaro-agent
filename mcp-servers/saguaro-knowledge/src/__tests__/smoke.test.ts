import { describe, expect, it } from "vitest";

function getShape(schema: any): Record<string, unknown> {
  return typeof schema._zod.def.shape === "function"
    ? schema._zod.def.shape()
    : schema._zod.def.shape;
}

describe("saguaro-knowledge server surface", () => {
  it("registers exactly the public v1 knowledge tools", async () => {
    const { createServer } = await import("../server.js");

    const server = createServer();
    const tools = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;

    expect(Object.keys(tools).sort()).toEqual([
      "knowledge_delete",
      "knowledge_get",
      "knowledge_ingest",
      "knowledge_list",
      "knowledge_query",
      "knowledge_search",
      "knowledge_update",
    ]);
  });

  it("includes dispatch context inputs on every tool and 1% guidance on query surfaces", async () => {
    const { createServer } = await import("../server.js");

    const server = createServer();
    const tools = (server as unknown as {
      _registeredTools: Record<string, { description: string; inputSchema: Record<string, unknown> }>;
    })._registeredTools;

    for (const tool of Object.values(tools)) {
      const shape = getShape(tool.inputSchema);
      expect(Object.keys(shape)).toContain("run_id");
      expect(Object.keys(shape)).toContain("phase_id");
      expect(Object.keys(shape)).toContain("project_path");
    }

    expect(tools.knowledge_query.description).toMatch(/1% chance/i);
    expect(tools.knowledge_search.description).toMatch(/1% chance/i);
  });
});
