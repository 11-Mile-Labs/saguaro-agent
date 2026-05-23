#!/usr/bin/env node
import { createServer } from "node:http";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);

function startFakeOpenAiServer() {
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
    response.setHeader("Content-Type", "application/json");

    if (request.url?.endsWith("/models")) {
      response.end(JSON.stringify({ data: [{ id: "saguaro-smoke-model" }] }));
      return;
    }

    if (request.url?.endsWith("/embeddings")) {
      const inputs = Array.isArray(body.input) ? body.input : [body.input ?? ""];
      response.end(JSON.stringify({
        data: inputs.map((input, index) => ({
          index,
          embedding: embeddingFor(String(input)),
        })),
      }));
      return;
    }

    if (request.url?.endsWith("/chat/completions")) {
      response.end(JSON.stringify({
        choices: [{ message: { content: "Saguaro smoke synthesis answer." } }],
      }));
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not found" }));
  });

  return new Promise((resolveServer) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolveServer({
        url: `http://127.0.0.1:${address.port}/v1`,
        close: () => new Promise((resolveClose) => server.close(resolveClose)),
      });
    });
  });
}

function embeddingFor(text) {
  const words = ["workflow", "memory", "knowledge", "bug", "release", "next", "retry", "docs"];
  const lower = text.toLowerCase();
  return words.map((word) => (lower.includes(word) ? 1 : 0.1));
}

class JsonRpcProcess {
  constructor(command, args, cwd, env) {
    this.child = spawn(command, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = "";
    this.stderr = "";
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => {
      this.buffer += chunk;
      this.drain();
    });
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (chunk) => {
      this.stderr += chunk;
    });
    this.child.on("exit", (code) => {
      for (const reject of this.pending.values()) {
        reject(new Error(`MCP process exited with ${code}: ${this.stderr}`));
      }
      this.pending.clear();
    });
  }

  drain() {
    while (this.buffer.includes("\n")) {
      const index = this.buffer.indexOf("\n");
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      if (message.id && this.pending.has(message.id)) {
        const resolveMessage = this.pending.get(message.id);
        this.pending.delete(message.id);
        resolveMessage(message);
      }
    }
  }

  call(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolveMessage, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for ${method}: ${this.stderr}`));
      }, 10_000);
      this.pending.set(id, (message) => {
        clearTimeout(timer);
        if (message.error) {
          reject(new Error(`${method} failed: ${JSON.stringify(message.error)}`));
        } else {
          resolveMessage(message.result);
        }
      });
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  }

  notify(method, params = {}) {
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }

  close() {
    this.child.kill("SIGTERM");
  }
}

async function connect(command, args, cwd, env) {
  const client = new JsonRpcProcess(command, args, cwd, env);
  await client.call("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "saguaro-example-runner", version: "0.0.0" },
  });
  client.notify("notifications/initialized");
  return client;
}

async function callTool(client, name, args) {
  const result = await client.call("tools/call", { name, arguments: args });
  const text = result.content?.[0]?.text ?? "{}";
  return JSON.parse(text);
}

async function prepareExample(exampleDir, fakeBaseUrl) {
  const root = await mkdtemp(join(tmpdir(), "saguaro-example-"));
  await cp(exampleDir, root, { recursive: true });
  await mkdir(join(root, ".saguaro"), { recursive: true });
  await writeFile(join(root, ".saguaro", "config.yaml"), `embeddings:
  base_url: ${fakeBaseUrl}
  model: smoke-embedding
  api_key_env: EMBEDDINGS_API_KEY
llm:
  base_url: ${fakeBaseUrl}
  model: smoke-chat
  api_key_env: LLM_API_KEY
model_tiers:
  codex:
    standard: codex-standard-smoke
    deep: codex-deep-smoke
    surgeon: codex-surgeon-smoke
workflows_dir: .saguaro/workflows
runs_dir: .saguaro/runs
`, "utf8");
  if (!existsSync(join(root, ".saguaro", "workflows"))) {
    await mkdir(join(root, ".saguaro", "workflows"), { recursive: true });
  }
  return root;
}

function outputsFor(envelope) {
  return Object.fromEntries(envelope.outputs_required.map((name) => [
    name,
    name === "approve" ? true : `${name} produced by ${envelope.phase_id}`,
  ]));
}

async function runWorkflow(exampleName, sourceDir, workflowName, fakeBaseUrl) {
  const projectRoot = await prepareExample(sourceDir, fakeBaseUrl);
  const env = {
    ...process.env,
    CODEX_HOME: "/tmp/codex-smoke",
    EMBEDDINGS_API_KEY: "smoke-embeddings",
    LLM_API_KEY: "smoke-llm",
  };
  const workflow = await connect(process.execPath, [resolve(repoRoot, "mcp-servers/saguaro-workflow/dist/index.mjs")], projectRoot, env);
  const memory = await connect(process.execPath, [resolve(repoRoot, "mcp-servers/saguaro-memory/dist/index.mjs")], projectRoot, env);
  const knowledge = await connect(process.execPath, [resolve(repoRoot, "mcp-servers/saguaro-knowledge/dist/index.mjs")], projectRoot, env);

  try {
    const started = await callTool(workflow, "workflow_start", {
      name: workflowName,
      project_path: projectRoot,
      args: {
        ticket_slug: `${exampleName}-smoke`,
        ticket_description: `Complete the ${exampleName} Saguaro example workflow.`,
      },
    });
    const runId = started.run_id;
    let completed = false;

    for (let step = 0; step < 50 && !completed; step++) {
      let dispatch = await callTool(workflow, "workflow_dispatch_phase", {
        run_id: runId,
        project_path: projectRoot,
      });

      if (dispatch.blocked && dispatch.gate && dispatch.gate !== "waiting") {
        dispatch = await callTool(workflow, "workflow_dispatch_phase", {
          run_id: runId,
          approval_response: "approve",
          project_path: projectRoot,
        });
      }

      if (dispatch.done) {
        completed = true;
        break;
      }

      for (const envelope of dispatch.envelopes ?? []) {
        if (envelope.tools_required.includes("memory_retrieve")) {
          await callTool(memory, "memory_retrieve", {
            query: `${exampleName} ${envelope.phase_id}`,
            run_id: runId,
            phase_id: envelope.phase_id,
          });
        }
        if (envelope.tools_required.includes("knowledge_search")) {
          await callTool(knowledge, "knowledge_search", {
            query: `${exampleName} ${envelope.phase_id}`,
            run_id: runId,
            phase_id: envelope.phase_id,
          });
        }

        const outputs = outputsFor(envelope);
        const validation = await callTool(workflow, "workflow_validate_output", {
          run_id: runId,
          phase_id: envelope.phase_id,
          output_envelope: { outputs },
          project_path: projectRoot,
        });
        if (!validation.valid) {
          throw new Error(`${exampleName}/${envelope.phase_id} validation failed: ${validation.errors.join("; ")}`);
        }
        await callTool(workflow, "workflow_record_artifact", {
          run_id: runId,
          phase_id: envelope.phase_id,
          project_path: projectRoot,
          artifact: {
            content: `# ${envelope.phase_id}\n\nSmoke artifact for ${exampleName}.`,
            outputs,
          },
        });
      }
    }

    await callTool(workflow, "workflow_complete", { run_id: runId, project_path: projectRoot });
    const dispatchLog = await readFile(join(projectRoot, ".saguaro", "runs", runId, "_dispatch.jsonl"), "utf8");
    for (const requiredTool of ["memory_retrieve", "knowledge_search"]) {
      if (!dispatchLog.includes(requiredTool)) {
        throw new Error(`${exampleName} dispatch log did not include ${requiredTool}`);
      }
    }
    console.log(`ok ${exampleName}/${workflowName}`);
  } finally {
    workflow.close();
    memory.close();
    knowledge.close();
    await rm(projectRoot, { recursive: true, force: true });
  }
}

const fakeServer = await startFakeOpenAiServer();
try {
  await runWorkflow("minimal-bugfix-demo", resolve(repoRoot, "examples/minimal-bugfix-demo"), "bugfix", fakeServer.url);
  await runWorkflow("custom-workflow-demo", resolve(repoRoot, "examples/custom-workflow-demo"), "release-slice", fakeServer.url);
  await runWorkflow("nextjs-engineering-demo", resolve(repoRoot, "examples/nextjs-engineering-demo"), "engineering-standard", fakeServer.url);
} finally {
  await fakeServer.close();
}
