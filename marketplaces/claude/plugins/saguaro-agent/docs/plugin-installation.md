# Plugin Installation

Saguaro publishes user-scope install artifacts for Claude Code, Codex, and Gemini CLI.

If you are installing Saguaro for the first time, start with [getting-started.md](./getting-started.md). This page focuses on the generated plugin artifacts and harness-specific install commands.

The repository source files live in `mcp-servers/`, `skills/`, `workflows/`, and `docs/`. The generated install artifacts live under `marketplaces/`:

```text
marketplaces/
├── claude/
│   ├── .claude-plugin/marketplace.json
│   └── plugins/saguaro-agent/
├── codex/
│   ├── .agents/plugins/marketplace.json
│   └── plugins/saguaro-agent/
└── gemini/
    └── extensions/saguaro-agent/
```

There is no separate `packages/` tree. Each harness artifact is generated directly from source and is self-contained enough to run from the harness plugin cache.

## Build

```bash
pnpm build
```

The build compiles the MCP servers, bundles JavaScript runtime dependencies into the MCP server `dist/` files, and regenerates the marketplace artifacts.

External services are not bundled. Embeddings providers, chat completion providers, vector databases, and local model servers remain optional runtime dependencies configured by project config and environment variables.

## Install

Install into all detected harnesses:

```bash
./install.sh
```

Preview without installing:

```bash
./install.sh --dry-run
```

The installer also links the `saguaro` CLI into `~/.local/bin` by default. Use `--no-cli` to skip that step or `--cli-dir <dir>` to choose a different user bin directory.

The installer also creates `~/.saguaro/env` with placeholder values when the file does not already exist (an existing file is never touched). Fill in your embeddings and LLM credentials there so desktop harnesses that launch MCP servers without a login shell still get them. See the Global Env File section in [config-and-env.md](./config-and-env.md).

Install one harness:

```bash
./install.sh --claude
./install.sh --codex
./install.sh --gemini
```

The installer uses the normal harness commands:

```bash
claude plugin marketplace add ./marketplaces/claude --scope user
claude plugin install saguaro-agent@saguaro --scope user

codex plugin marketplace add ./marketplaces/codex

gemini extensions install ./marketplaces/gemini/extensions/saguaro-agent
```

Codex discovers installed plugins from registered marketplace roots and the expanded plugin cache. The current Codex CLI does not expose a separate `codex plugin add` command, so the installer also syncs the Codex config and cache to enable `saguaro-agent@saguaro` and remove the legacy `saguaro-agent@saguaro-agent` key from earlier prerelease installs.

Gemini CLI treats every extension `settings` entry as a required install-time setting and reports missing values when they are left blank. Saguaro's Gemini manifest intentionally avoids provider settings so local/provider-neutral installs do not produce false missing-setting warnings. Provider base URLs and model names belong in the project-local `.saguaro/config.yaml`.

If installing manually, also expose the CLI from the source checkout if you want the `saguaro init`, `saguaro doctor`, and `saguaro smoke` commands outside the repository:

```bash
mkdir -p "$HOME/.local/bin"
ln -sf "$PWD/bin/saguaro.mjs" "$HOME/.local/bin/saguaro"
```

After installing, restart the harness and initialize Saguaro in an existing project:

```bash
cd path/to/your-project
saguaro init
saguaro doctor
saguaro smoke
```

## Validate

```bash
pnpm plugin:validate
pnpm harness:smoke
```

For release checks, also run the harness validators when the CLIs are available:

```bash
claude plugin validate marketplaces/claude/plugins/saguaro-agent --strict
claude plugin validate marketplaces/claude --strict
gemini extensions validate marketplaces/gemini/extensions/saguaro-agent
```
