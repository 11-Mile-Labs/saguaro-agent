import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { LoadedSaguaroConfig } from "../config.js";
import type { LoadedWorkflowRun, WorkflowRunStatus } from "./runtime.js";
import type { WorkflowDefinition } from "./types.js";

export interface RunTicketIndexEntry {
  run_id: string;
  workflow_name: string;
  ticket_slug: string;
  started_at: string;
  completed_at: string | null;
}

export function extractTicketSlug(workflowArgs: Record<string, unknown>): string | null {
  const raw = workflowArgs.ticket_slug ?? workflowArgs.ticket;
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function sanitizeTicketSlugForFilename(ticketSlug: string): string {
  return ticketSlug.replace(/[^A-Za-z0-9._-]+/g, "_");
}

export function ticketIndexFileName(workflowName: string, ticketSlug: string): string {
  return `${workflowName}__${sanitizeTicketSlugForFilename(ticketSlug)}.json`;
}

export function getTicketIndexDir(config: LoadedSaguaroConfig): string {
  return resolve(config.projectRoot, config.config.runs_dir, "_by-ticket");
}

export function getTicketIndexPath(
  config: LoadedSaguaroConfig,
  workflowName: string,
  ticketSlug: string
): string {
  return resolve(getTicketIndexDir(config), ticketIndexFileName(workflowName, ticketSlug));
}

function getRunDir(config: LoadedSaguaroConfig, runId: string): string {
  return resolve(config.projectRoot, config.config.runs_dir, runId);
}

function loadWorkflowRunFromIndex(
  config: LoadedSaguaroConfig,
  runId: string
): LoadedWorkflowRun {
  const runDir = getRunDir(config, runId);
  const statusPath = resolve(runDir, "_status.json");
  const queuePath = resolve(runDir, "_queue.md");
  const workflowPath = resolve(runDir, "_workflow.json");

  if (!existsSync(statusPath) || !existsSync(workflowPath)) {
    throw new Error(`Run "${runId}" does not exist under ${runDir}.`);
  }

  const status = JSON.parse(readFileSync(statusPath, "utf8")) as WorkflowRunStatus;
  const workflow = JSON.parse(readFileSync(workflowPath, "utf8")) as WorkflowDefinition;
  return { runDir, statusPath, queuePath, workflowPath, status, workflow };
}

export function readTicketIndexEntry(
  config: LoadedSaguaroConfig,
  workflowName: string,
  ticketSlug: string
): RunTicketIndexEntry | null {
  const indexPath = getTicketIndexPath(config, workflowName, ticketSlug);
  if (!existsSync(indexPath)) {
    return null;
  }

  return JSON.parse(readFileSync(indexPath, "utf8")) as RunTicketIndexEntry;
}

export function writeTicketIndexEntry(
  config: LoadedSaguaroConfig,
  entry: RunTicketIndexEntry
): void {
  const indexDir = getTicketIndexDir(config);
  mkdirSync(indexDir, { recursive: true });
  const indexPath = getTicketIndexPath(config, entry.workflow_name, entry.ticket_slug);
  writeFileSync(indexPath, `${JSON.stringify(entry, null, 2)}\n`, "utf8");
}

export function markTicketIndexCompleted(
  config: LoadedSaguaroConfig,
  workflowName: string,
  ticketSlug: string,
  completedAt: string
): void {
  const existing = readTicketIndexEntry(config, workflowName, ticketSlug);
  if (!existing) {
    return;
  }

  writeTicketIndexEntry(config, {
    ...existing,
    completed_at: completedAt,
  });
}

export function findIndexedRun(
  config: LoadedSaguaroConfig,
  workflowName: string,
  ticketSlug: string,
  options: { includeCompleted?: boolean } = {}
): { entry: RunTicketIndexEntry; run: LoadedWorkflowRun } | null {
  const entry = readTicketIndexEntry(config, workflowName, ticketSlug);
  if (!entry) {
    return null;
  }

  if (entry.workflow_name !== workflowName) {
    throw new Error(
      `Ticket index mismatch for "${ticketSlug}": indexed workflow is "${entry.workflow_name}", requested "${workflowName}".`
    );
  }

  const run = loadWorkflowRunFromIndex(config, entry.run_id);
  if (run.status.workflow_name !== workflowName) {
    throw new Error(
      `Run "${entry.run_id}" is workflow "${run.status.workflow_name}", expected "${workflowName}".`
    );
  }

  const completedAt = run.status.completed_at ?? entry.completed_at;
  if (completedAt && !options.includeCompleted) {
    return null;
  }

  return { entry, run };
}

export function findIncompleteRun(
  config: LoadedSaguaroConfig,
  workflowName: string,
  ticketSlug: string
): LoadedWorkflowRun | null {
  const indexed = findIndexedRun(config, workflowName, ticketSlug);
  if (!indexed) {
    return null;
  }

  if (indexed.run.status.completed_at) {
    return null;
  }

  return indexed.run;
}

export function registerTicketRunIndex(
  config: LoadedSaguaroConfig,
  run: LoadedWorkflowRun
): void {
  const ticketSlug = extractTicketSlug(run.status.workflow_args);
  if (!ticketSlug) {
    return;
  }

  writeTicketIndexEntry(config, {
    run_id: run.status.run_id,
    workflow_name: run.status.workflow_name,
    ticket_slug: ticketSlug,
    started_at: run.status.started_at,
    completed_at: run.status.completed_at,
  });
}

export function syncTicketIndexFromRun(
  config: LoadedSaguaroConfig,
  run: LoadedWorkflowRun
): void {
  const ticketSlug = extractTicketSlug(run.status.workflow_args);
  if (!ticketSlug || !run.status.completed_at) {
    return;
  }

  markTicketIndexCompleted(
    config,
    run.status.workflow_name,
    ticketSlug,
    run.status.completed_at
  );
}
