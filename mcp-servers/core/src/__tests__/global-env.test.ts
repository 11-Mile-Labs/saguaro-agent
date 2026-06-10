import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadGlobalEnv, parseEnvFile, resolveGlobalEnvPath } from "../global-env.js";

describe("parseEnvFile", () => {
  it("parses KEY=VALUE pairs", () => {
    expect(parseEnvFile("FOO=bar\nBAZ=qux")).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("ignores comments and blank lines", () => {
    const raw = "# a comment\n\nFOO=bar\n  # indented comment\n";
    expect(parseEnvFile(raw)).toEqual({ FOO: "bar" });
  });

  it("strips an optional export prefix", () => {
    expect(parseEnvFile("export FOO=bar")).toEqual({ FOO: "bar" });
  });

  it("strips matching single or double quotes", () => {
    expect(parseEnvFile(`FOO="bar baz"\nQUX='zip'`)).toEqual({ FOO: "bar baz", QUX: "zip" });
  });

  it("keeps equals signs inside values", () => {
    expect(parseEnvFile("URL=http://localhost:11434?x=1")).toEqual({
      URL: "http://localhost:11434?x=1",
    });
  });

  it("skips lines without an equals sign or with an invalid key", () => {
    expect(parseEnvFile("not a pair\n1BAD=x\nGOOD=1")).toEqual({ GOOD: "1" });
  });
});

describe("resolveGlobalEnvPath", () => {
  it("defaults to ~/.saguaro/env under the home directory", () => {
    const path = resolveGlobalEnvPath({ HOME: "/Users/test" });
    expect(path).toBe(join("/Users/test", ".saguaro", "env"));
  });

  it("respects SAGUARO_HOME", () => {
    const path = resolveGlobalEnvPath({ HOME: "/Users/test", SAGUARO_HOME: "/opt/saguaro" });
    expect(path).toBe(join("/opt/saguaro", "env"));
  });

  it("respects SAGUARO_GLOBAL_ENV as an exact file path", () => {
    const path = resolveGlobalEnvPath({
      HOME: "/Users/test",
      SAGUARO_GLOBAL_ENV: "/etc/saguaro.env",
    });
    expect(path).toBe("/etc/saguaro.env");
  });

  it("returns undefined when no home directory can be resolved", () => {
    expect(resolveGlobalEnvPath({})).toBeUndefined();
  });
});

describe("loadGlobalEnv", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function writeEnvFile(contents: string): string {
    tempDir = mkdtempSync(join(tmpdir(), "saguaro-global-env-"));
    mkdirSync(join(tempDir, ".saguaro"), { recursive: true });
    const filePath = join(tempDir, ".saguaro", "env");
    writeFileSync(filePath, contents, "utf8");
    return filePath;
  }

  it("applies file values to the target env", () => {
    writeEnvFile("SAGUARO_EMBEDDINGS_API_KEY=abc123\n");
    const env: NodeJS.ProcessEnv = { HOME: tempDir };

    const result = loadGlobalEnv({ env });

    expect(env.SAGUARO_EMBEDDINGS_API_KEY).toBe("abc123");
    expect(result.applied).toEqual(["SAGUARO_EMBEDDINGS_API_KEY"]);
    expect(result.skipped).toEqual([]);
  });

  it("never overrides variables already present in the env", () => {
    writeEnvFile("OLLAMA_HOST=http://from-file\n");
    const env: NodeJS.ProcessEnv = { HOME: tempDir, OLLAMA_HOST: "http://from-shell" };

    const result = loadGlobalEnv({ env });

    expect(env.OLLAMA_HOST).toBe("http://from-shell");
    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual(["OLLAMA_HOST"]);
  });

  it("treats empty-string env values as already set", () => {
    writeEnvFile("FLAG=from-file\n");
    const env: NodeJS.ProcessEnv = { HOME: tempDir, FLAG: "" };

    loadGlobalEnv({ env });

    expect(env.FLAG).toBe("");
  });

  it("is a no-op when the file does not exist", () => {
    tempDir = mkdtempSync(join(tmpdir(), "saguaro-global-env-"));
    const env: NodeJS.ProcessEnv = { HOME: tempDir };

    const result = loadGlobalEnv({ env });

    expect(result.loaded).toBe(false);
    expect(result.applied).toEqual([]);
  });

  it("is a no-op when no home directory can be resolved", () => {
    const env: NodeJS.ProcessEnv = {};

    const result = loadGlobalEnv({ env });

    expect(result.loaded).toBe(false);
    expect(result.filePath).toBeUndefined();
  });

  it("loads from an explicit filePath option", () => {
    const filePath = writeEnvFile("EXPLICIT=yes\n");
    const env: NodeJS.ProcessEnv = {};

    const result = loadGlobalEnv({ env, filePath });

    expect(result.loaded).toBe(true);
    expect(env.EXPLICIT).toBe("yes");
  });
});
