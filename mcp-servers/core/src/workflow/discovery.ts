import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  type WorkflowDefinition,
  type WorkflowSourceEntry,
  type WorkflowValidationResult,
  validateWorkflowDefinition,
} from "./types.js";

function loadWorkflowAtPath(
  path: string,
  engineVersion?: string
): WorkflowValidationResult {
  const raw = parseYaml(readFileSync(path, "utf8"));
  return validateWorkflowDefinition(raw, { engineVersion });
}

function listYamlFiles(dirPath: string): string[] {
  if (!existsSync(dirPath)) {
    return [];
  }

  return readdirSync(dirPath)
    .filter((entry) => extname(entry) === ".yaml")
    .sort()
    .map((entry) => resolve(dirPath, entry));
}

export interface DiscoverWorkflowsArgs {
  projectRoot: string;
  projectWorkflowsDir: string;
  bundledWorkflowsDir: string;
  engineVersion?: string;
}

export interface DiscoverWorkflowsResult {
  workflows: WorkflowSourceEntry[];
  invalid: Array<{
    source: "project" | "bundled";
    path: string;
    errors: string[];
  }>;
}

export function discoverWorkflows(args: DiscoverWorkflowsArgs): DiscoverWorkflowsResult {
  const merged = new Map<string, WorkflowSourceEntry>();
  const invalid: DiscoverWorkflowsResult["invalid"] = [];

  const visit = (source: "project" | "bundled", dirPath: string) => {
    for (const filePath of listYamlFiles(dirPath)) {
      const validation = loadWorkflowAtPath(filePath, args.engineVersion);
      if (!validation.valid || !validation.workflow) {
        invalid.push({
          source,
          path: filePath,
          errors: validation.errors.map((issue) => issue.message),
        });
        continue;
      }

      const workflow = validation.workflow;
      const entry: WorkflowSourceEntry = {
        name: workflow.name,
        description: workflow.description,
        source,
        path: filePath,
        workflow,
      };

      if (source === "project" || !merged.has(workflow.name)) {
        merged.set(workflow.name, entry);
      }
    }
  };

  visit("bundled", args.bundledWorkflowsDir);
  visit("project", args.projectWorkflowsDir);

  return {
    workflows: [...merged.values()].sort((a, b) => a.name.localeCompare(b.name)),
    invalid,
  };
}

export function loadWorkflowSourceAtPath(args: {
  projectRoot: string;
  workflowPath: string;
  engineVersion?: string;
}): WorkflowSourceEntry {
  const resolvedPath = resolve(args.projectRoot, args.workflowPath);
  const validation = validateWorkflowYamlFile(resolvedPath, args.engineVersion ?? "1.0.0");

  if (!validation.valid || !validation.workflow) {
    throw new Error(
      validation.errors.map((issue) => `${issue.path}: ${issue.message}`).join("; ")
    );
  }

  const workflow = validation.workflow;
  return {
    name: workflow.name,
    description: workflow.description,
    source: "path",
    path: resolvedPath,
    workflow,
  };
}

export function getWorkflowByName(
  workflows: WorkflowSourceEntry[],
  workflowName: string
): WorkflowSourceEntry {
  const entry = workflows.find((workflow) => workflow.name === workflowName);
  if (!entry) {
    throw new Error(`Workflow "${workflowName}" not found.`);
  }
  return entry;
}

export function validateWorkflowYamlFile(
  filePath: string,
  engineVersion = "1.0.0"
): WorkflowValidationResult {
  if (!existsSync(filePath)) {
    return {
      valid: false,
      workflow: null,
      errors: [
        {
          path: filePath,
          message: `Workflow file not found at ${filePath}.`,
          severity: "error",
        },
      ],
      warnings: [],
    };
  }

  try {
    return loadWorkflowAtPath(filePath, engineVersion);
  } catch (error) {
    return {
      valid: false,
      workflow: null,
      errors: [
        {
          path: basename(filePath),
          message: error instanceof Error ? error.message : String(error),
          severity: "error",
        },
      ],
      warnings: [],
    };
  }
}

export function ensureWorkflowVersion(workflow: WorkflowDefinition, engineVersion = "1.0.0"): void {
  const validation = validateWorkflowDefinition(workflow, { engineVersion });
  if (!validation.valid) {
    throw new Error(validation.errors.map((issue) => issue.message).join("; "));
  }
}
