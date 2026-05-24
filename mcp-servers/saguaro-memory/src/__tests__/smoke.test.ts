import { describe, expect, it } from "vitest";

function getShape(schema: any): Record<string, unknown> {
  return typeof schema._zod.def.shape === "function"
    ? schema._zod.def.shape()
    : schema._zod.def.shape;
}

describe("saguaro-memory server surface", () => {
  it("registers exactly the v1 memory tools and no extras", async () => {
    const { createServer } = await import("../server.js");

    const server = createServer();
    const tools = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;

    expect(Object.keys(tools).sort()).toEqual([
      "memory_delete",
      "memory_list",
      "memory_pin",
      "memory_promote",
      "memory_retrieve",
      "memory_status",
      "memory_store",
      "memory_unpin",
    ]);
  });

  it("includes dispatch context inputs on every tool and 1% guidance on retrieval", async () => {
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

    expect(tools.memory_retrieve.description).toMatch(/1% chance/i);
  });
});
