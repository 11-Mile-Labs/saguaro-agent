#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  lintWorkflowDefinition,
  parseWorkflowYaml,
} from "./lint-workflow-yaml.mjs";

const RESULTS = [];

function test(name, fn) {
  RESULTS.push({ name, fn });
}

function run(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${error.message}`);
    return false;
  }
}

const VALID_WORKFLOW = `name: engineering
description: "Full engineering workflow"
version: 1.0.0
defaults:
  model_tier: standard
  effort: medium
  memory_scope: [run, project]
  knowledge_scope: [project]
approval_gates:
  - after: da
    prompt: "Approve architecture before implementation?"
phases:
  - id: intake
    agent: general-purpose
    contract:
      inputs:
        - ticket_slug: required
      outputs:
        - intake_summary: required
  - id: research
    depends_on: [intake]
    agent: explore
    contract:
      inputs: [intake_summary]
      outputs: [research_brief]
      requires_memory_query: true
      requires_knowledge_query: true
  - id: architecture
    depends_on: [research]
    agent: architect
    contract:
      inputs: [research_brief, intake_summary]
      outputs: [architecture_doc]
  - id: impact
    depends_on: [architecture]
    agent: impact-analyzer
    contract:
      inputs: [architecture_doc]
      outputs: [impact_doc]
  - id: da
    depends_on: [impact]
    agent: devils-advocate
    contract:
      inputs: [architecture_doc, impact_doc]
      outputs: [da_doc, approve]
on_workflow_complete:
  - prompt_memory_promotion
  - write_artifact_index
`;

test("parses a valid workflow yaml document", () => {
  const parsed = parseWorkflowYaml(VALID_WORKFLOW);
  assert.equal(parsed.name, "engineering");
  assert.equal(parsed.phases[1].id, "research");
  assert.deepEqual(parsed.defaults.memory_scope, ["run", "project"]);
});

test("accepts a valid workflow definition", () => {
  const workflow = parseWorkflowYaml(VALID_WORKFLOW);
  const { errors } = lintWorkflowDefinition(workflow, {
    filePath: "workflows/engineering.yaml",
  });
  assert.deepEqual(errors, []);
});

test("rejects da inputs that do not come from ancestors", () => {
  const workflow = parseWorkflowYaml(VALID_WORKFLOW);
  workflow.phases[4].depends_on = ["impact"];
  workflow.phases[4].contract.inputs = ["architecture_doc", "impact_doc", "review_doc"];
  const { errors } = lintWorkflowDefinition(workflow, {
    filePath: "workflows/engineering.yaml",
  });
  assert.ok(
    errors.some((error) => error.includes("review_doc")),
    `Expected missing upstream input error, got ${JSON.stringify(errors)}`,
  );
});

test("rejects cycles in workflow dependencies", () => {
  const workflow = parseWorkflowYaml(VALID_WORKFLOW);
  workflow.phases[0].depends_on = ["da"];
  const { errors } = lintWorkflowDefinition(workflow, {
    filePath: "workflows/engineering.yaml",
  });
  assert.ok(
    errors.some((error) => error.includes("cycle")),
    `Expected cycle error, got ${JSON.stringify(errors)}`,
  );
});

test("rejects inconsistent parallel groups", () => {
  const workflow = parseWorkflowYaml(`name: custom
description: "Parallel workflow"
phases:
  - id: intake
    agent: general-purpose
    contract:
      inputs:
        - ticket_slug: required
      outputs: [intake_summary]
  - id: research
    depends_on: [intake]
    parallel_group: discovery
    agent: explore
    contract:
      inputs: [intake_summary]
      outputs: [research_brief]
  - id: audit
    depends_on: [research]
    parallel_group: discovery
    agent: code-reviewer
    contract:
      inputs: [intake_summary]
      outputs: [audit_brief]
`);
  const { errors } = lintWorkflowDefinition(workflow, {
    filePath: "workflows/custom.yaml",
  });
  assert.ok(
    errors.some((error) => error.includes("parallel_group")),
    `Expected parallel group error, got ${JSON.stringify(errors)}`,
  );
});

test("rejects unknown top-level fields", () => {
  const workflow = parseWorkflowYaml(`${VALID_WORKFLOW}mystery_field: true\n`);
  const { errors } = lintWorkflowDefinition(workflow, {
    filePath: "workflows/engineering.yaml",
  });
  assert.ok(
    errors.some((error) => error.includes("unknown top-level field")),
    `Expected unknown field error, got ${JSON.stringify(errors)}`,
  );
});

let passed = 0;
let failed = 0;

for (const { name, fn } of RESULTS) {
  if (run(name, fn)) {
    passed++;
  } else {
    failed++;
  }
}

console.log();
console.log(`  ${passed} passed, ${failed} failed`);

process.exit(failed > 0 ? 1 : 0);
