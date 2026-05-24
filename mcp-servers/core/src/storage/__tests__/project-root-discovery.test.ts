import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findProjectRoot } from "../../config.js";
import { createStorageRuntime, resolveStorageRuntimeForToolArgs } from "../config.js";
import { clearToolRuntimeCaches } from "../tool-runtime.js";

describe("storage project root discovery", () => {
  it("walks up from a nested cwd to the parent of .saguaro/config.yaml", () => {
    const repo = mkdtempSync(join(tmpdir(), "saguaro-root-"));
    const nested = join(repo, "packages", "app");
    mkdirSync(nested, { recursive: true });
    mkdirSync(join(repo, ".saguaro"), { recursive: true });
    writeFileSync(
      join(repo, ".saguaro", "config.yaml"),
      "embeddings:\n  base_url: http://localhost\n  model: test\n  api_key_env: EMBEDDINGS_API_KEY\n",
      "utf8",
    );

    expect(findProjectRoot(nested)).toBe(repo);
  });

  it("uses project_path on tool args before walking the tree", () => {
    clearToolRuntimeCaches();
    const repoA = mkdtempSync(join(tmpdir(), "saguaro-a-"));
    const repoB = mkdtempSync(join(tmpdir(), "saguaro-b-"));

    for (const repo of [repoA, repoB]) {
      mkdirSync(join(repo, ".saguaro"), { recursive: true });
    writeFileSync(
        join(repo, ".saguaro", "config.yaml"),
        "embeddings:\n  base_url: http://localhost\n  model: test\n  api_key_env: EMBEDDINGS_API_KEY\n",
        "utf8",
      );
    }

    const runtime = resolveStorageRuntimeForToolArgs({ project_path: repoB });
    expect(runtime.paths.projectRoot).toBe(repoB);
    expect(runtime.paths.runsDir).toBe(join(repoB, ".saguaro", "runs"));
  });

  it("defaults to findProjectRoot instead of process.cwd when unset", () => {
    const repo = mkdtempSync(join(tmpdir(), "saguaro-default-"));
    mkdirSync(join(repo, ".saguaro"), { recursive: true });
    writeFileSync(
      join(repo, ".saguaro", "config.yaml"),
      "embeddings:\n  base_url: http://localhost\n  model: test\n  api_key_env: EMBEDDINGS_API_KEY\n",
      "utf8",
    );

    const runtime = createStorageRuntime({ projectRoot: repo });
    expect(runtime.paths.configPath).toBe(join(repo, ".saguaro", "config.yaml"));
  });
});
