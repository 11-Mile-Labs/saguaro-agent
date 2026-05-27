// mcp-servers/core/src/storage/__tests__/project-identity.test.ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createStorageRuntime } from "../config.js";

describe("createStorageRuntime project identity", () => {
  it("derives projectId from the project-root basename", async () => {
    const root = join(await mkdtemp(join(tmpdir(), "saguaro-pid-")), "demo-tool");
    expect(createStorageRuntime({ projectRoot: root }).projectId).toBe("demo-tool");
  });

  it("lowercases the basename into a slug", async () => {
    const root = join(await mkdtemp(join(tmpdir(), "saguaro-pid-")), "Sample-App");
    expect(createStorageRuntime({ projectRoot: root }).projectId).toBe("sample-app");
  });

  it("leaves projectId undefined when the basename is not a valid slug", () => {
    expect(createStorageRuntime({ projectRoot: "/" }).projectId).toBeUndefined();
  });
});
