export interface RedactionResult {
  content: string;
  redactions: string[];
}

export interface RedactionOptions {
  enabled?: boolean;
  disabledRules?: string | string[];
  additionalAllowPatterns?: string | string[];
}

const REDACTION_RULES: Array<{ name: string; pattern: RegExp; replacement: string }> = [
  {
    name: "private-key",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replacement: "[REDACTED:private-key]",
  },
  {
    name: "authorization-bearer",
    pattern: /\b(Bearer\s+)([A-Za-z0-9._~+/=-]{16,})\b/g,
    replacement: "$1[REDACTED:token]",
  },
  {
    name: "openai-style-token",
    pattern: /\b(sk-[A-Za-z0-9_-]{16,})\b/g,
    replacement: "[REDACTED:api-key]",
  },
  {
    name: "github-token",
    pattern: /\b(gh[pousr]_[A-Za-z0-9_]{16,})\b/g,
    replacement: "[REDACTED:github-token]",
  },
  {
    name: "aws-access-key",
    pattern: /\b(AKIA[0-9A-Z]{16})\b/g,
    replacement: "[REDACTED:aws-access-key]",
  },
  {
    name: "assignment-secret",
    pattern: /\b(api[_-]?key|token|secret|password|passwd|pwd|authorization)\b(\s*[:=]\s*)(["']?)[^"'\s]{8,}\3/gi,
    replacement: "$1$2$3[REDACTED:secret]$3",
  },
];

function splitList(value: string | string[] | undefined): string[] {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function protectAllowedContent(content: string, patterns: string[]): { content: string; protectedValues: string[] } {
  const protectedValues: string[] = [];
  let nextContent = content;

  for (const pattern of patterns) {
    const regex = new RegExp(pattern, "g");
    nextContent = nextContent.replace(regex, (value) => {
      const token = `__SAGUARO_REDACTION_ALLOW_${protectedValues.length}__`;
      protectedValues.push(value);
      return token;
    });
  }

  return { content: nextContent, protectedValues };
}

function restoreAllowedContent(content: string, protectedValues: string[]): string {
  return protectedValues.reduce(
    (nextContent, value, index) => nextContent.replaceAll(`__SAGUARO_REDACTION_ALLOW_${index}__`, value),
    content,
  );
}

export function redactSecrets(rawContent: string, options: RedactionOptions = {}): RedactionResult {
  if (options.enabled === false) {
    return { content: rawContent, redactions: [] };
  }

  const disabledRules = new Set(splitList(options.disabledRules));
  const allowPatterns = splitList(options.additionalAllowPatterns);
  const protectedContent = protectAllowedContent(rawContent, allowPatterns);
  let content = rawContent;
  content = protectedContent.content;
  const redactions = new Set<string>();

  for (const rule of REDACTION_RULES) {
    if (disabledRules.has(rule.name)) {
      continue;
    }
    if (rule.pattern.test(content)) {
      redactions.add(rule.name);
      content = content.replace(rule.pattern, rule.replacement);
    }
    rule.pattern.lastIndex = 0;
  }

  return {
    content: restoreAllowedContent(content, protectedContent.protectedValues),
    redactions: [...redactions].sort(),
  };
}
