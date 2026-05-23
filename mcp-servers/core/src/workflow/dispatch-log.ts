import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { z } from "zod";

export const DispatchLogEntrySchema = z
  .object({
    ts: z.string().min(1),
    run_id: z.string().min(1),
    phase_id: z.string().min(1).nullable(),
    server: z.string().min(1),
    tool: z.string().min(1),
    args_hash: z.string().min(1),
    duration_ms: z.number().nonnegative(),
    ok: z.boolean(),
  })
  .strict();

export type DispatchLogEntry = z.infer<typeof DispatchLogEntrySchema>;

export interface AppendDispatchLogArgs {
  runDir: string;
  runId: string;
  phaseId: string | null;
  server: string;
  tool: string;
  args: unknown;
  durationMs: number;
  ok: boolean;
}

export function getDispatchLogPath(runDir: string): string {
  return resolve(runDir, "_dispatch.jsonl");
}

export function hashToolArgs(args: unknown): string {
  const digest = createHash("sha256")
    .update(JSON.stringify(args ?? null))
    .digest("hex");
  return `sha256:${digest}`;
}

export function appendDispatchLogEntry(args: AppendDispatchLogArgs): void {
  mkdirSync(args.runDir, { recursive: true });
  const entry: DispatchLogEntry = {
    ts: new Date().toISOString(),
    run_id: args.runId,
    phase_id: args.phaseId,
    server: args.server,
    tool: args.tool,
    args_hash: hashToolArgs(args.args),
    duration_ms: args.durationMs,
    ok: args.ok,
  };
  appendFileSync(getDispatchLogPath(args.runDir), `${JSON.stringify(entry)}\n`, "utf8");
}

export function readDispatchLogEntries(
  runDir: string,
  phaseId?: string
): DispatchLogEntry[] {
  const logPath = getDispatchLogPath(runDir);
  if (!existsSync(logPath)) {
    return [];
  }

  return readFileSync(logPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = DispatchLogEntrySchema.parse(JSON.parse(line));
        if (phaseId && parsed.phase_id !== phaseId) {
          return [];
        }
        return [parsed];
      } catch {
        return [];
      }
    });
}
