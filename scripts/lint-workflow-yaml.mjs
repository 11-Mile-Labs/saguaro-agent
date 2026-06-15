#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TOP_LEVEL_FIELDS = new Set([
  "name",
  "description",
  "version",
  "defaults",
  "approval_gates",
  "phases",
  "on_workflow_complete",
]);

const DEFAULT_FIELDS = new Set([
  "model_tier",
  "effort",
  "memory_scope",
  "knowledge_scope",
]);

const PHASE_FIELDS = new Set([
  "id",
  "depends_on",
  "parallel_group",
  "agent",
  "model_tier",
  "effort",
  "contract",
]);

const CONTRACT_FIELDS = new Set([
  "inputs",
  "outputs",
  "requires_memory_query",
  "requires_knowledge_query",
]);

const APPROVAL_GATE_FIELDS = new Set(["after", "prompt"]);
const ALLOWED_WORKFLOW_HOOKS = new Set([
  "prompt_memory_promotion",
  "write_artifact_index",
]);
const ALLOWED_EFFORTS = new Set(["low", "medium", "high"]);
const ALLOWED_SCOPES = new Set(["run", "project", "global"]);

function stripInlineComment(line) {
  let single = false;
  let double = false;

  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    const previous = index > 0 ? line[index - 1] : "";

    if (char === "'" && !double && previous !== "\\") {
      single = !single;
      continue;
    }

    if (char === '"' && !single && previous !== "\\") {
      double = !double;
      continue;
    }

    if (char === "#" && !single && !double) {
      return line.slice(0, index);
    }
  }

  return line;
}

function countIndent(rawLine, lineNumber) {
  let count = 0;
  for (const char of rawLine) {
    if (char === " ") {
      count++;
      continue;
    }
    if (char === "\t") {
      throw new Error(`line ${lineNumber}: tabs are not supported in workflow yaml`);
    }
    break;
  }
  return count;
}

function preprocessYaml(text) {
  const rawLines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const lines = [];

  for (let index = 0; index < rawLines.length; index++) {
    const raw = rawLines[index];
    const lineNumber = index + 1;
    const withoutComment = stripInlineComment(raw);
    const trimmed = withoutComment.trim();

    if (!trimmed) {
      continue;
    }

    const indent = countIndent(withoutComment, lineNumber);
    lines.push({
      indent,
      lineNumber,
      text: withoutComment.slice(indent).trimEnd(),
    });
  }

  return lines;
}

function splitTopLevel(text, delimiter) {
  const parts = [];
  let current = "";
  let single = false;
  let double = false;
  let bracketDepth = 0;
  let braceDepth = 0;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    const previous = index > 0 ? text[index - 1] : "";

    if (char === "'" && !double && previous !== "\\") {
      single = !single;
      current += char;
      continue;
    }

    if (char === '"' && !single && previous !== "\\") {
      double = !double;
      current += char;
      continue;
    }

    if (!single && !double) {
      if (char === "[") bracketDepth++;
      if (char === "]") bracketDepth--;
      if (char === "{") braceDepth++;
      if (char === "}") braceDepth--;
    }

    if (
      char === delimiter &&
      !single &&
      !double &&
      bracketDepth === 0 &&
      braceDepth === 0
    ) {
      parts.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

function findKeyValueSeparator(text) {
  let single = false;
  let double = false;
  let bracketDepth = 0;
  let braceDepth = 0;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    const previous = index > 0 ? text[index - 1] : "";

    if (char === "'" && !double && previous !== "\\") {
      single = !single;
      continue;
    }

    if (char === '"' && !single && previous !== "\\") {
      double = !double;
      continue;
    }

    if (!single && !double) {
      if (char === "[") bracketDepth++;
      if (char === "]") bracketDepth--;
      if (char === "{") braceDepth++;
      if (char === "}") braceDepth--;
    }

    if (
      char === ":" &&
      !single &&
      !double &&
      bracketDepth === 0 &&
      braceDepth === 0
    ) {
      return index;
    }
  }

  return -1;
}

function splitKeyValue(text, lineNumber) {
  const separator = findKeyValueSeparator(text);
  if (separator === -1) {
    throw new Error(`line ${lineNumber}: expected key: value pair`);
  }

  const key = text.slice(0, separator).trim();
  const rawValue = text.slice(separator + 1).trim();

  if (!key) {
    throw new Error(`line ${lineNumber}: missing key before ":"`);
  }

  return { key, rawValue };
}

function parseScalar(rawValue) {
  if (rawValue === "true") return true;
  if (rawValue === "false") return false;
  if (rawValue === "null" || rawValue === "~") return null;
  if (/^-?\d+$/.test(rawValue)) return Number(rawValue);
  if (/^-?\d+\.\d+$/.test(rawValue)) return Number(rawValue);

  if (
    (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
    (rawValue.startsWith("'") && rawValue.endsWith("'"))
  ) {
    return rawValue.slice(1, -1);
  }

  if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
    const inner = rawValue.slice(1, -1).trim();
    if (!inner) {
      return [];
    }
    return splitTopLevel(inner, ",").map((part) => parseScalar(part));
  }

  return rawValue;
}

function parseNode(lines, index, indent) {
  if (index >= lines.length) {
    return [null, index];
  }

  if (lines[index].indent < indent) {
    return [null, index];
  }

  if (lines[index].indent > indent) {
    throw new Error(
      `line ${lines[index].lineNumber}: unexpected indentation (${lines[index].indent}); expected ${indent}`,
    );
  }

  if (lines[index].text.startsWith("- ")) {
    return parseSequence(lines, index, indent);
  }

  return parseMapping(lines, index, indent, {});
}

function parseSequence(lines, index, indent) {
  const items = [];

  while (index < lines.length) {
    const line = lines[index];
    if (line.indent < indent) {
      break;
    }
    if (line.indent !== indent) {
      throw new Error(
        `line ${line.lineNumber}: inconsistent indentation inside sequence`,
      );
    }
    if (!line.text.startsWith("- ")) {
      break;
    }

    const rest = line.text.slice(2).trim();

    if (!rest) {
      if (!lines[index + 1] || lines[index + 1].indent <= indent) {
        items.push(null);
        index++;
        continue;
      }
      const [child, nextIndex] = parseNode(lines, index + 1, lines[index + 1].indent);
      items.push(child);
      index = nextIndex;
      continue;
    }

    const separator = findKeyValueSeparator(rest);
    if (separator !== -1) {
      const { key, rawValue } = splitKeyValue(rest, line.lineNumber);
      const item = {};
      if (!rawValue) {
        if (!lines[index + 1] || lines[index + 1].indent <= indent) {
          item[key] = null;
          index++;
        } else {
          const [child, nextIndex] = parseNode(lines, index + 1, lines[index + 1].indent);
          item[key] = child;
          index = nextIndex;
        }
      } else {
        item[key] = parseScalar(rawValue);
        index++;
      }

      if (index < lines.length && lines[index].indent > indent) {
        const [merged, nextIndex] = parseMapping(lines, index, indent + 2, item);
        items.push(merged);
        index = nextIndex;
      } else {
        items.push(item);
      }
      continue;
    }

    items.push(parseScalar(rest));
    index++;
  }

  return [items, index];
}

function parseMapping(lines, index, indent, initialObject = {}) {
  const object = initialObject;

  while (index < lines.length) {
    const line = lines[index];
    if (line.indent < indent) {
      break;
    }
    if (line.indent !== indent) {
      throw new Error(
        `line ${line.lineNumber}: inconsistent indentation inside mapping`,
      );
    }
    if (line.text.startsWith("- ")) {
      break;
    }

    const { key, rawValue } = splitKeyValue(line.text, line.lineNumber);
    if (!rawValue) {
      if (!lines[index + 1] || lines[index + 1].indent <= indent) {
        object[key] = null;
        index++;
        continue;
      }

      const [child, nextIndex] = parseNode(lines, index + 1, lines[index + 1].indent);
      object[key] = child;
      index = nextIndex;
      continue;
    }

    object[key] = parseScalar(rawValue);
    index++;
  }

  return [object, index];
}

export function parseWorkflowYaml(text) {
  const lines = preprocessYaml(text);
  if (lines.length === 0) {
    throw new Error("workflow yaml is empty");
  }

  const [parsed, nextIndex] = parseNode(lines, 0, lines[0].indent);
  if (nextIndex !== lines.length) {
    throw new Error(
      `line ${lines[nextIndex].lineNumber}: could not parse trailing content`,
    );
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("workflow yaml root must be a mapping");
  }
  return parsed;
}

function asStringArray(value, label, errors, filePath) {
  if (value == null) {
    return [];
  }
  if (!Array.isArray(value)) {
    errors.push(`${filePath}: ${label} must be an array`);
    return [];
  }

  const results = [];
  for (const item of value) {
    if (typeof item !== "string" || !item) {
      errors.push(`${filePath}: ${label} entries must be non-empty strings`);
      continue;
    }
    results.push(item);
  }
  return results;
}

function normalizeContractNames(items, label, errors, filePath) {
  return normalizeContractFields(items, label, errors, filePath).map((entry) => entry.name);
}

function normalizeContractFields(items, label, errors, filePath) {
  if (!Array.isArray(items)) {
    errors.push(`${filePath}: ${label} must be an array`);
    return [];
  }

  const fields = [];

  for (const item of items) {
    if (typeof item === "string") {
      if (!item) {
        errors.push(`${filePath}: ${label} entries must not be empty`);
        continue;
      }
      fields.push({ name: item, required: true });
      continue;
    }

    if (
      item &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      Object.keys(item).length === 1
    ) {
      const [name] = Object.keys(item);
      if (!name) {
        errors.push(`${filePath}: ${label} mapping entry must have a name`);
        continue;
      }
      fields.push({ name, required: item[name] !== "optional" });
      continue;
    }

    errors.push(
      `${filePath}: ${label} entries must be strings or single-entry mappings`,
    );
  }

  return fields;
}

function validateDefaults(defaults, errors, filePath) {
  if (defaults == null) {
    return;
  }
  if (!defaults || Array.isArray(defaults) || typeof defaults !== "object") {
    errors.push(`${filePath}: defaults must be a mapping`);
    return;
  }

  for (const key of Object.keys(defaults)) {
    if (!DEFAULT_FIELDS.has(key)) {
      errors.push(`${filePath}: defaults has unknown field "${key}"`);
    }
  }

  if (defaults.effort && !ALLOWED_EFFORTS.has(defaults.effort)) {
    errors.push(`${filePath}: defaults.effort must be one of low, medium, high`);
  }

  for (const scopeField of ["memory_scope", "knowledge_scope"]) {
    if (scopeField in defaults) {
      const scopes = asStringArray(
        defaults[scopeField],
        `defaults.${scopeField}`,
        errors,
        filePath,
      );
      for (const scope of scopes) {
        if (!ALLOWED_SCOPES.has(scope)) {
          errors.push(
            `${filePath}: defaults.${scopeField} contains unknown scope "${scope}"`,
          );
        }
      }
    }
  }
}

function collectAncestors(phaseId, dependencyMap, seen = new Set()) {
  for (const dependency of dependencyMap.get(phaseId) ?? []) {
    if (seen.has(dependency)) {
      continue;
    }
    seen.add(dependency);
    collectAncestors(dependency, dependencyMap, seen);
  }
  return seen;
}

function detectCycle(dependencyMap) {
  const visiting = new Set();
  const visited = new Set();

  function visit(phaseId, trail) {
    if (visiting.has(phaseId)) {
      return [...trail, phaseId];
    }
    if (visited.has(phaseId)) {
      return null;
    }

    visiting.add(phaseId);
    for (const dependency of dependencyMap.get(phaseId) ?? []) {
      const cycle = visit(dependency, [...trail, phaseId]);
      if (cycle) {
        return cycle;
      }
    }
    visiting.delete(phaseId);
    visited.add(phaseId);
    return null;
  }

  for (const phaseId of dependencyMap.keys()) {
    const cycle = visit(phaseId, []);
    if (cycle) {
      return cycle;
    }
  }

  return null;
}

function validateApprovalGates(workflow, phaseIds, errors, filePath) {
  if (workflow.approval_gates == null) {
    return;
  }
  if (!Array.isArray(workflow.approval_gates)) {
    errors.push(`${filePath}: approval_gates must be an array`);
    return;
  }

  for (const gate of workflow.approval_gates) {
    if (!gate || Array.isArray(gate) || typeof gate !== "object") {
      errors.push(`${filePath}: approval_gates entries must be mappings`);
      continue;
    }

    for (const key of Object.keys(gate)) {
      if (!APPROVAL_GATE_FIELDS.has(key)) {
        errors.push(`${filePath}: approval_gates has unknown field "${key}"`);
      }
    }

    if (!phaseIds.has(gate.after)) {
      errors.push(
        `${filePath}: approval gate references unknown phase "${gate.after}"`,
      );
    }

    if (typeof gate.prompt !== "string" || !gate.prompt) {
      errors.push(`${filePath}: approval gate prompt must be a non-empty string`);
    }
  }
}

function validateHooks(workflow, errors, filePath) {
  if (workflow.on_workflow_complete == null) {
    return;
  }

  if (!Array.isArray(workflow.on_workflow_complete)) {
    errors.push(`${filePath}: on_workflow_complete must be an array`);
    return;
  }

  for (const hook of workflow.on_workflow_complete) {
    if (typeof hook !== "string" || !ALLOWED_WORKFLOW_HOOKS.has(hook)) {
      errors.push(
        `${filePath}: on_workflow_complete contains unsupported hook "${hook}"`,
      );
    }
  }
}

export function lintWorkflowDefinition(workflow, { filePath = "workflow.yaml" } = {}) {
  const errors = [];

  if (!workflow || Array.isArray(workflow) || typeof workflow !== "object") {
    return { errors: [`${filePath}: workflow root must be a mapping`] };
  }

  for (const key of Object.keys(workflow)) {
    if (!TOP_LEVEL_FIELDS.has(key)) {
      errors.push(`${filePath}: unknown top-level field "${key}"`);
    }
  }

  if (typeof workflow.name !== "string" || !workflow.name) {
    errors.push(`${filePath}: name is required`);
  }

  if (typeof workflow.description !== "string" || !workflow.description) {
    errors.push(`${filePath}: description is required`);
  }

  if (workflow.version != null && typeof workflow.version !== "string") {
    errors.push(`${filePath}: version must be a string when provided`);
  }

  validateDefaults(workflow.defaults, errors, filePath);

  if (!Array.isArray(workflow.phases) || workflow.phases.length === 0) {
    errors.push(`${filePath}: phases must be a non-empty array`);
    return { errors };
  }

  const phaseIds = new Set();
  const phaseOutputs = new Map();
  const dependencyMap = new Map();
  const rootInputs = new Set();
  const parallelGroups = new Map();

  for (const phase of workflow.phases) {
    if (!phase || Array.isArray(phase) || typeof phase !== "object") {
      errors.push(`${filePath}: every phase must be a mapping`);
      continue;
    }

    for (const key of Object.keys(phase)) {
      if (!PHASE_FIELDS.has(key)) {
        errors.push(`${filePath}: phase "${phase.id ?? "<unknown>"}" has unknown field "${key}"`);
      }
    }

    if (typeof phase.id !== "string" || !phase.id) {
      errors.push(`${filePath}: each phase requires a non-empty id`);
      continue;
    }

    if (phaseIds.has(phase.id)) {
      errors.push(`${filePath}: duplicate phase id "${phase.id}"`);
      continue;
    }
    phaseIds.add(phase.id);

    if (typeof phase.agent !== "string" || !phase.agent) {
      errors.push(`${filePath}: phase "${phase.id}" requires a non-empty agent`);
    }

    if (phase.effort && !ALLOWED_EFFORTS.has(phase.effort)) {
      errors.push(`${filePath}: phase "${phase.id}" has unsupported effort "${phase.effort}"`);
    }

    const dependsOn = asStringArray(
      phase.depends_on ?? [],
      `phase "${phase.id}" depends_on`,
      errors,
      filePath,
    );
    dependencyMap.set(phase.id, dependsOn);

    if (phase.parallel_group) {
      if (typeof phase.parallel_group !== "string") {
        errors.push(`${filePath}: phase "${phase.id}" parallel_group must be a string`);
      } else {
        const existing = parallelGroups.get(phase.parallel_group) ?? [];
        existing.push({ id: phase.id, dependsOn: [...dependsOn].sort() });
        parallelGroups.set(phase.parallel_group, existing);
      }
    }

    if (!phase.contract || Array.isArray(phase.contract) || typeof phase.contract !== "object") {
      errors.push(`${filePath}: phase "${phase.id}" contract must be a mapping`);
      continue;
    }

    for (const key of Object.keys(phase.contract)) {
      if (!CONTRACT_FIELDS.has(key)) {
        errors.push(
          `${filePath}: phase "${phase.id}" contract has unknown field "${key}"`,
        );
      }
    }

    const inputFields = normalizeContractFields(
      phase.contract.inputs ?? [],
      `phase "${phase.id}" contract.inputs`,
      errors,
      filePath,
    );
    const outputs = normalizeContractNames(
      phase.contract.outputs ?? [],
      `phase "${phase.id}" contract.outputs`,
      errors,
      filePath,
    );

    const outputNames = new Set();
    for (const output of outputs) {
      if (outputNames.has(output)) {
        errors.push(`${filePath}: phase "${phase.id}" declares duplicate output "${output}"`);
      }
      outputNames.add(output);
    }
    phaseOutputs.set(phase.id, outputNames);

    if (dependsOn.length === 0) {
      for (const input of inputFields) {
        rootInputs.add(input.name);
      }
    }

    for (const flag of ["requires_memory_query", "requires_knowledge_query"]) {
      if (flag in phase.contract && typeof phase.contract[flag] !== "boolean") {
        errors.push(`${filePath}: phase "${phase.id}" ${flag} must be boolean`);
      }
    }
  }

  for (const [phaseId, dependsOn] of dependencyMap.entries()) {
    for (const dependency of dependsOn) {
      if (!phaseIds.has(dependency)) {
        errors.push(`${filePath}: phase "${phaseId}" depends on unknown phase "${dependency}"`);
      }
      if (dependency === phaseId) {
        errors.push(`${filePath}: phase "${phaseId}" cannot depend on itself`);
      }
    }
  }

  const cycle = detectCycle(dependencyMap);
  if (cycle) {
    errors.push(`${filePath}: dependency cycle detected (${cycle.join(" -> ")})`);
  }

  for (const [groupName, entries] of parallelGroups.entries()) {
    const expected = JSON.stringify(entries[0].dependsOn);
    for (const entry of entries.slice(1)) {
      if (JSON.stringify(entry.dependsOn) !== expected) {
        errors.push(
          `${filePath}: parallel_group "${groupName}" has inconsistent depends_on sets`,
        );
        break;
      }
    }
  }

  for (const phase of workflow.phases) {
    if (!phase?.id || !phase.contract || !phaseIds.has(phase.id)) {
      continue;
    }

    const inputs = normalizeContractFields(
      phase.contract.inputs ?? [],
      `phase "${phase.id}" contract.inputs`,
      [],
      filePath,
    );
    const available = new Set(rootInputs);
    const ancestors = collectAncestors(phase.id, dependencyMap);
    for (const ancestor of ancestors) {
      for (const output of phaseOutputs.get(ancestor) ?? []) {
        available.add(output);
      }
    }

    for (const input of inputs) {
      if (input.required && !available.has(input.name)) {
        errors.push(
          `${filePath}: phase "${phase.id}" input "${input.name}" does not resolve from workflow args or ancestor outputs`,
        );
      }
    }
  }

  validateApprovalGates(workflow, phaseIds, errors, filePath);
  validateHooks(workflow, errors, filePath);

  return { errors };
}

function walk(dir, matcher, results = []) {
  if (!existsSync(dir)) {
    return results;
  }

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolutePath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(absolutePath, matcher, results);
      continue;
    }
    if (matcher(absolutePath)) {
      results.push(absolutePath);
    }
  }

  return results;
}

function collectWorkflowFiles(targetPath) {
  const resolved = resolve(targetPath);
  if (!existsSync(resolved)) {
    return [];
  }

  if (extname(resolved) === ".yaml") {
    return [resolved];
  }

  return walk(resolved, (absolutePath) => absolutePath.endsWith(".yaml")).sort();
}

function repoRootFromScript() {
  const scriptPath = fileURLToPath(import.meta.url);
  return resolve(dirname(scriptPath), "..");
}

function collectDefaultFiles({ repoRoot, cwd, userOnly }) {
  const bundled = userOnly ? [] : collectWorkflowFiles(join(repoRoot, "workflows"));
  const user = collectWorkflowFiles(join(cwd, ".saguaro", "workflows"));
  const exampleUser =
    cwd === repoRoot
      ? walk(join(repoRoot, "examples"), (absolutePath) =>
          absolutePath.includes(`${join("examples", "")}`) &&
          absolutePath.endsWith(".yaml") &&
          absolutePath.includes(`${join(".saguaro", "workflows")}`),
        ).sort()
      : [];

  return [...new Set([...bundled, ...user, ...exampleUser])];
}

function classifyWorkflowSource(filePath, repoRoot) {
  const normalized = resolve(filePath);
  const bundledRoot = join(repoRoot, "workflows");
  if (normalized.startsWith(bundledRoot)) {
    return { scope: "bundled", source: "bundled" };
  }

  const marker = `${join(".saguaro", "workflows")}${process.platform === "win32" ? "\\" : "/"}`;
  const markerIndex = normalized.lastIndexOf(marker);
  if (markerIndex !== -1) {
    return {
      scope: `user:${normalized.slice(0, markerIndex)}`,
      source: "user",
    };
  }

  return { scope: `other:${normalized}`, source: "other" };
}

function lintFiles(filePaths, repoRoot) {
  const violations = [];
  const parsedFiles = [];

  for (const filePath of filePaths) {
    try {
      const raw = readFileSync(filePath, "utf8");
      const workflow = parseWorkflowYaml(raw);
      const { errors } = lintWorkflowDefinition(workflow, {
        filePath: relative(repoRoot, filePath) || filePath,
      });
      violations.push(...errors);
      parsedFiles.push({
        filePath,
        relativePath: relative(repoRoot, filePath) || filePath,
        workflow,
        ...classifyWorkflowSource(filePath, repoRoot),
      });
    } catch (error) {
      violations.push(
        `${relative(repoRoot, filePath) || filePath}: ${error.message}`,
      );
    }
  }

  const namesByScope = new Map();
  for (const entry of parsedFiles) {
    const key = `${entry.scope}:${entry.workflow.name}`;
    const group = namesByScope.get(key) ?? [];
    group.push(entry);
    namesByScope.set(key, group);
  }

  for (const group of namesByScope.values()) {
    if (group.length < 2) {
      continue;
    }
    const [first] = group;
    const files = group.map((entry) => entry.relativePath).join(", ");
    violations.push(
      `workflow name collision in ${first.source} scope for "${first.workflow.name}": ${files}`,
    );
  }

  return violations;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const repoRoot = repoRootFromScript();
  const cwd = process.cwd();
  const args = process.argv.slice(2);
  const userOnly = args.includes("--user");
  const targets = args.filter((arg) => arg !== "--user");
  const filePaths =
    targets.length > 0
      ? [...new Set(targets.flatMap((target) => collectWorkflowFiles(target)))]
      : collectDefaultFiles({ repoRoot, cwd, userOnly });

  if (filePaths.length === 0) {
    console.log("lint-workflow-yaml: no workflow yaml files found");
    process.exit(0);
  }

  const violations = lintFiles(filePaths, repoRoot);
  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(violation);
    }
    console.error(`\nlint-workflow-yaml: ${violations.length} error(s)`);
    process.exit(1);
  }

  console.log(`lint-workflow-yaml: clean (${filePaths.length} file(s))`);
}
