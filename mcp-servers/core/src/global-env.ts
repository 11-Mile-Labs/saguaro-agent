import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Machine-wide env fallback for harnesses that launch MCP servers outside a
 * login shell (desktop apps don't inherit ~/.localrc / shell profiles).
 * Values from ~/.saguaro/env are applied with LOWEST precedence: a variable
 * already present in the process env — even as an empty string — is never
 * overridden, so terminal launches behave exactly as before.
 *
 * Exception: a value that looks like an unexpanded harness placeholder
 * (matching /^\$\{[A-Za-z0-9_]+\}$/, e.g. "${MY_VAR}") is treated as
 * missing. Desktop harnesses that inject literal placeholder strings into
 * the process env when the underlying secret was not resolved would otherwise
 * permanently block the ~/.saguaro/env fallback. Real values — including
 * empty strings — still win.
 */

const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Matches an unexpanded harness placeholder such as `${SOME_VAR}`. */
const PLACEHOLDER_PATTERN = /^\$\{[A-Za-z0-9_]+\}$/;

export interface LoadGlobalEnvOptions {
  env?: NodeJS.ProcessEnv;
  filePath?: string;
}

export interface LoadGlobalEnvResult {
  loaded: boolean;
  filePath?: string;
  applied: string[];
  skipped: string[];
}

export function parseEnvFile(raw: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of raw.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    if (line.startsWith("export ")) {
      line = line.slice("export ".length).trim();
    }

    const equalsIndex = line.indexOf("=");
    if (equalsIndex < 1) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    if (!ENV_KEY_PATTERN.test(key)) {
      continue;
    }

    let value = line.slice(equalsIndex + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

export function resolveGlobalEnvPath(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const explicit = env.SAGUARO_GLOBAL_ENV?.trim();
  if (explicit) {
    return explicit;
  }

  const saguaroHome = env.SAGUARO_HOME?.trim();
  if (saguaroHome) {
    return join(saguaroHome, "env");
  }

  const home = env.HOME?.trim() || env.USERPROFILE?.trim();
  if (!home) {
    return undefined;
  }

  return join(home, ".saguaro", "env");
}

export function loadGlobalEnv(options: LoadGlobalEnvOptions = {}): LoadGlobalEnvResult {
  const env = options.env ?? process.env;
  const filePath = options.filePath ?? resolveGlobalEnvPath(env);

  if (!filePath || !existsSync(filePath)) {
    return { loaded: false, filePath, applied: [], skipped: [] };
  }

  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    return { loaded: false, filePath, applied: [], skipped: [] };
  }

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const [key, value] of Object.entries(parseEnvFile(raw))) {
    const current = env[key];
    if (current !== undefined && !PLACEHOLDER_PATTERN.test(current)) {
      skipped.push(key);
      continue;
    }
    env[key] = value;
    applied.push(key);
  }

  return { loaded: true, filePath, applied, skipped };
}
