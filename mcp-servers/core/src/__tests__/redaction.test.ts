import { describe, expect, test } from "vitest";
import { redactSecrets } from "../storage/redaction.js";

describe("storage redaction", () => {
  test("redacts common secret shapes before persistence or vector indexing", () => {
    const openAiStyleToken = `${"sk-"}testsecret1234567890`;
    const githubStyleToken = `${"gh"}${"p_"}abcdefghijklmnopqrstuvwxyz123456`;
    const result = redactSecrets([
      `api_key=${openAiStyleToken}`,
      "Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456",
      `github=${githubStyleToken}`,
    ].join("\n"));

    expect(result.content).not.toContain(openAiStyleToken);
    expect(result.content).not.toContain("abcdefghijklmnopqrstuvwxyz123456");
    expect(result.content).toContain("[REDACTED:secret]");
    expect(result.content).toContain("[REDACTED:token]");
    expect(result.content).toContain("[REDACTED:github-token]");
    expect(result.redactions).toEqual([
      "assignment-secret",
      "authorization-bearer",
      "github-token",
      "openai-style-token",
    ]);
  });

  test("can be disabled or selectively relaxed by configuration", () => {
    const secret = `api_key=${"sk-"}testsecret1234567890`;

    expect(redactSecrets(secret, { enabled: false }).content).toBe(secret);
    expect(redactSecrets(secret, { disabledRules: ["assignment-secret", "openai-style-token"] }).content).toBe(secret);
    expect(redactSecrets(secret, { additionalAllowPatterns: [`api_key=${"sk-"}testsecret[0-9]+`] }).content).toBe(secret);
  });
});
