// mcp-servers/core/src/storage/__tests__/project-identity.test.ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createStorageRuntime } from "../config.js";

describe("createStorageRuntime project identity", () => {
  it("derives projectId from the project-root basename", async () => {
    const root = join(await mkdtemp(join(tmpdir(), "saguaro-pid-")), "dotman");
    expect(createStorageRuntime({ projectRoot: root }).projectId).toBe("dotman");
  });

  it("lowercases the basename into a slug", async () => {
    const root = join(await mkdtemp(join(tmpdir(), "saguaro-pid-")), "Patina-CRM");
    expect(createStorageRuntime({ projectRoot: root }).projectId).toBe("patina-crm");
  });

  it("leaves projectId undefined when the basename is not a valid slug", () => {
    expect(createStorageRuntime({ projectRoot: "/" }).projectId).toBeUndefined();
  });
});
