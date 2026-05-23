#!/usr/bin/env node

import assert from "node:assert/strict";
import { lintThinLoopSkill } from "./lint-thin-loop-skills.mjs";

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

test("passes a clean workflow wrapper skill", () => {
  const body = `---
name: workflow
description: "Run a Saguaro workflow."
argument-hint: "[run <workflow-name>]"
license: MIT
---

1. Call \`workflow_start(name: "engineering", args: {})\`.
2. Loop on \`workflow_dispatch_phase(run_id)\`.
3. Use \`workflow_validate_output\` after each envelope.
`;
  const result = lintThinLoopSkill("skills/workflow/SKILL.md", body);
  assert.deepEqual(result.errors, []);
  assert.equal(result.checked, true);
});

test("ignores skills that do not wrap workflow_start", () => {
  const body = `---
name: saguaro
description: "Scaffold a project."
license: MIT
---

Create .saguaro/config.yaml and explain the next step.
`;
  const result = lintThinLoopSkill("skills/saguaro/SKILL.md", body);
  assert.deepEqual(result.errors, []);
  assert.equal(result.checked, false);
});

test("rejects direct Task tool dispatch", () => {
  const body = `---
name: eng
description: "Thin wrapper."
license: MIT
---

1. Call \`workflow_start(name: "engineering", args: {})\`.
2. Use the Task tool to dispatch a worker.
`;
  const result = lintThinLoopSkill("skills/eng/SKILL.md", body);
  assert.ok(
    result.errors.some((error) => error.includes("Task")),
    `Expected Task tool violation, got ${JSON.stringify(result.errors)}`,
  );
});

test("rejects Claude-only frontmatter fields", () => {
  const body = `---
name: eng
description: "Thin wrapper."
model: sonnet
license: MIT
---

1. Call \`workflow_start(name: "engineering", args: {})\`.
`;
  const result = lintThinLoopSkill("skills/eng/SKILL.md", body);
  assert.ok(
    result.errors.some((error) => error.includes("Claude-only")),
    `Expected Claude-only field violation, got ${JSON.stringify(result.errors)}`,
  );
});

test("rejects non-public knowledge tool prefixes in thin-loop skills", () => {
  const forbiddenKnowledgeTool = `ke_${"search"}`;
  const body = `---
name: eng
description: "Thin wrapper."
license: MIT
---

1. Call \`workflow_start(name: "engineering", args: {})\`.
2. Query \`${forbiddenKnowledgeTool}\` before dispatch.
`;
  const result = lintThinLoopSkill("skills/eng/SKILL.md", body);
  assert.ok(
    result.errors.some((error) => error.includes("ke_")),
    `Expected non-public knowledge tool prefix violation, got ${JSON.stringify(result.errors)}`,
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
