#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CLAUDE_ONLY_FIELDS = new Set([
  "model",
  "effort",
  "allowed-tools",
  "context",
  "user-invocable",
  "subagent_type",
]);

const FORBIDDEN_PATTERNS = [
  /\bUse the Task tool\b/,
  /\bUse the Agent tool\b/,
  /\bdispatch via Task\b/,
  /\bdispatch via Agent\b/,
  /\bke_[a-z_]+\b/,
  /^[ \t]*subagent_type:\s/m,
];

const MAX_LINES = 100;

function extractFrontmatter(body) {
  const match = body.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return null;
  }
  return {
    raw: match[1],
    content: match[2],
  };
}

function parseFrontmatter(raw) {
  const fields = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    const separator = line.indexOf(":");
    if (separator === -1) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    fields[key] = value;
  }
  return fields;
}

function isThinLoopSkill(body) {
  return /\bworkflow_start\s*\(/.test(body) || /\bworkflow_start\b/.test(body);
}

export function lintThinLoopSkill(filePath, body) {
  const errors = [];
  const frontmatter = extractFrontmatter(body);

  if (!frontmatter) {
    return {
      checked: false,
      errors: [`${filePath}: missing or malformed frontmatter`],
    };
  }

  const fields = parseFrontmatter(frontmatter.raw);

  if (!isThinLoopSkill(body)) {
    return { checked: false, errors: [] };
  }

  for (const field of CLAUDE_ONLY_FIELDS) {
    if (field in fields) {
      errors.push(
        `${filePath}: Claude-only frontmatter field "${field}" is not allowed in thin-loop skills`,
      );
    }
  }

  const lineCount = body.split(/\r?\n/).length;
  if (lineCount > MAX_LINES) {
    errors.push(
      `${filePath}: thin-loop skill exceeds ${MAX_LINES} lines (${lineCount})`,
    );
  }

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(body)) {
      errors.push(
        `${filePath}: forbidden thin-loop token matched ${pattern.toString()}`,
      );
    }
  }

  return { checked: true, errors };
}

function walk(dir, results = []) {
  if (!existsSync(dir)) {
    return results;
  }

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolutePath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(absolutePath, results);
      continue;
    }
    if (entry.isFile() && entry.name === "SKILL.md") {
      results.push(absolutePath);
    }
  }

  return results;
}

function repoRootFromScript() {
  const scriptPath = fileURLToPath(import.meta.url);
  return resolve(dirname(scriptPath), "..");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const repoRoot = repoRootFromScript();
  const targets = process.argv.slice(2);
  const files =
    targets.length > 0
      ? targets.map((target) => resolve(target))
      : walk(join(repoRoot, "skills")).sort();

  let violations = 0;

  for (const absolutePath of files) {
    const body = readFileSync(absolutePath, "utf8");
    const filePath = relative(repoRoot, absolutePath) || absolutePath;
    const { errors } = lintThinLoopSkill(filePath, body);
    for (const error of errors) {
      console.error(error);
      violations++;
    }
  }

  if (violations > 0) {
    console.error(`\nlint-thin-loop-skills: ${violations} error(s)`);
    process.exit(1);
  }

  console.log(`lint-thin-loop-skills: clean (${files.length} file(s))`);
}
