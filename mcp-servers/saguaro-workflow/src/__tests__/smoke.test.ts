import { describe, expect, test } from "vitest";
import { createServer } from "../server.js";

describe("createServer", () => {
  test("registers the workflow tools", () => {
    const server = createServer();
    const registered = Object.keys((server as any)._registeredTools);
    expect(registered.sort()).toEqual(
      [
        "workflow_list",
        "workflow_start",
        "workflow_find_run",
        "workflow_resume",
        "workflow_status",
        "workflow_dispatch_phase",
        "workflow_validate_dispatch",
        "workflow_validate_output",
        "workflow_record_artifact",
        "workflow_phase_bundle",
        "workflow_lessons",
        "workflow_complete",
        "workflow_runtime_info",
        "workflow_validate_yaml",
      ].sort()
    );
  });
});
