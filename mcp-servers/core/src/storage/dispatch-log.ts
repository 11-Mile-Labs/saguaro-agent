import { appendFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { DispatchContextInput, StoragePaths } from "./types.js";
import { ensureDir } from "./filesystem.js";

interface DispatchLogOptions {
  server: string;
  tool: string;
  args: Record<string, unknown>;
  durationMs: number;
  ok: boolean;
  error?: string;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableSerialize(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function appendDispatchLog(
  paths: StoragePaths,
  context: DispatchContextInput,
  options: DispatchLogOptions,
): Promise<void> {
  if (!context.run_id || !context.phase_id) {
    return;
  }

  const logDir = join(paths.runsDir, context.run_id);
  const logPath = join(logDir, "_dispatch.jsonl");

  await ensureDir(logDir);

  const payload = {
    ts: new Date().toISOString(),
    run_id: context.run_id,
    phase_id: context.phase_id,
    server: options.server,
    tool: options.tool,
    args_hash: `sha256:${createHash("sha256").update(stableSerialize(options.args)).digest("hex")}`,
    duration_ms: options.durationMs,
    ok: options.ok,
    ...(options.error ? { error: options.error } : {}),
  };

  await appendFile(logPath, `${JSON.stringify(payload)}\n`, "utf8");
}
