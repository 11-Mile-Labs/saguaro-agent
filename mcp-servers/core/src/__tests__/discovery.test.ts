import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { discoverWorkflows } from "../workflow/discovery.js";

function writeWorkflow(path: string, body: string): void {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, body, "utf8");
}

describe("discoverWorkflows", () => {
  test("prefers project workflows over bundled ones on name collision", () => {
    const root = mkdtempSync(resolve(tmpdir(), "saguaro-discovery-"));
    const bundledDir = resolve(root, "bundled");
    const projectDir = resolve(root, ".saguaro", "workflows");

    writeWorkflow(
      resolve(bundledDir, "engineering.yaml"),
      `
name: engineering
description: bundled engineering
version: 1.0.0
phases:
  - id: intake
    agent: general-purpose
    contract:
      inputs: []
      outputs: [summary]
`
    );

    writeWorkflow(
      resolve(projectDir, "engineering.yaml"),
      `
name: engineering
description: project engineering
version: 1.0.0
phases:
  - id: intake
    agent: general-purpose
    contract:
      inputs: []
      outputs: [summary]
`
    );

    writeWorkflow(
      resolve(bundledDir, "bugfix.yaml"),
      `
name: bugfix
description: bundled bugfix
version: 1.0.0
phases:
  - id: intake
    agent: general-purpose
    contract:
      inputs: []
      outputs: [summary]
`
    );

    const result = discoverWorkflows({
      projectRoot: root,
      projectWorkflowsDir: projectDir,
      bundledWorkflowsDir: bundledDir,
      engineVersion: "1.0.0",
    });

    expect(result.invalid).toEqual([]);
    expect(result.workflows.map((workflow) => workflow.name)).toEqual([
      "bugfix",
      "engineering",
    ]);
    expect(result.workflows.find((workflow) => workflow.name === "engineering")?.source).toBe(
      "project"
    );
  });
});
