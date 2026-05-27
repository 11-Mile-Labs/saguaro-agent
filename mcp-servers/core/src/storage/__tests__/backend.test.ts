// mcp-servers/core/src/storage/__tests__/backend.test.ts
import { describe, expect, it } from "vitest";
import { assertProjectId, collectionKey, collectionName } from "../backend.js";

describe("collectionName", () => {
  it("builds a name without a project as base___shared__namespace__scope", () => {
    expect(collectionName("saguaro_memory", { namespace: "memory", scope: "project" }))
      .toBe("saguaro_memory___shared__memory__project");
  });

  it("embeds a validated project id", () => {
    expect(collectionName("saguaro_memory", { namespace: "memory", scope: "run", projectId: "sample-app" }))
      .toBe("saguaro_memory__sample-app__memory__run");
  });
});

describe("assertProjectId", () => {
  it("accepts slug-like ids and returns them", () => {
    expect(assertProjectId("sample-app")).toBe("sample-app");
    expect(assertProjectId("proj_1.2")).toBe("proj_1.2");
  });

  it("rejects path traversal and separators", () => {
    expect(() => assertProjectId("../escape")).toThrow(/Invalid project_id/);
    expect(() => assertProjectId("a/b")).toThrow(/Invalid project_id/);
    expect(() => assertProjectId("a..b")).toThrow(/Invalid project_id/);
    expect(() => assertProjectId(".hidden")).toThrow(/Invalid project_id/);
    expect(() => assertProjectId("")).toThrow(/Invalid project_id/);
  });
});

describe("collectionKey", () => {
  it("carries projectId for run and project scopes", () => {
    expect(collectionKey("memory", "project", "demo-tool")).toEqual({
      namespace: "memory",
      scope: "project",
      projectId: "demo-tool",
    });
    expect(collectionKey("memory", "run", "demo-tool").projectId).toBe("demo-tool");
  });

  it("drops projectId for the global scope — global is always cross-project", () => {
    expect(collectionKey("knowledge", "global", "demo-tool")).toEqual({
      namespace: "knowledge",
      scope: "global",
    });
  });

  it("omits projectId when none is given", () => {
    expect(collectionKey("memory", "project")).toEqual({
      namespace: "memory",
      scope: "project",
    });
  });
});
