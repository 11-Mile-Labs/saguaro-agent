# PRD: Curl Bootstrap Installer

**Status:** Draft
**Author:** 11 Mile Labs
**Last Updated:** 2026-05-20
**Version:** 0.1
**Stakeholders:** Saguaro maintainers, end users installing Saguaro, harness plugin users

---

## Press Release First

Saguaro can be installed from a single curl command without cloning the repository first.

Developers should be able to run one safe, inspectable command from any directory, preview what it will do, then install the Saguaro plugin and CLI at user scope for the harnesses already on their machine. The bootstrap installer should download the public release source or artifact into a user cache, validate it, expose the `saguaro` CLI, and delegate to the same harness installation path used by local development.

## 1. Problem Statement

The current install flow works from a cloned repository:

```bash
./install.sh --dry-run
./install.sh
```

That is acceptable for contributors, but it is not the end-user path people expect from a public CLI/plugin project. A repo visitor naturally tries:

```bash
curl -fsSL https://raw.githubusercontent.com/11-Mile-Labs/saguaro-agent/main/install.sh | bash
```

Today that shape cannot work reliably because `install.sh` expects to run beside the repository files, generated marketplace artifacts, package metadata, docs, skills, workflows, and built MCP bundles.

The gap creates onboarding friction at the exact moment Saguaro needs to feel simple and trustworthy.

## 2. Goals And Success Metrics

| Goal | Metric | Current Baseline | Target | Measurement Window |
| --- | --- | --- | --- | --- |
| Support curl-based installation | `curl ... | bash -s -- --dry-run` completes without a pre-cloned repo | Fails or cannot complete from arbitrary directory | Passes on macOS/Linux with required tools | Before public launch |
| Preserve user trust | Installer prints planned actions before mutations in `--dry-run` | Repo-local dry run only | Bootstrap dry run shows download/cache/install plan | Before public launch |
| Keep user-scope install default | Install does not require per-project plugin setup | User-scope supported from repo checkout | User-scope supported from curl bootstrap | Before public launch |
| Avoid duplicate installer logic | Local and curl installs share the same final install path | One repo-local script | Bootstrap downloads/prepares, then delegates to canonical repo-local installer | Before public launch |

## 3. Non-Goals

- Do not require ChromaDB, AnythingLLM, LM Studio, OpenAI, or any specific provider.
- Do not store API keys or provider secrets.
- Do not silently modify shell startup files.
- Do not install project-local `.saguaro/` scaffolds automatically.
- Do not replace harness-native marketplace install commands.
- Do not support every package manager in v1.
- Do not build a hosted installer service.

## 4. User Personas And Stories

### Persona: Existing Harness User

This user already has Claude Code, Codex, Gemini CLI, or some combination installed.

**Story:** As an existing harness user, I want to install Saguaro from one command so that I can start using it without cloning the repo first.

Acceptance criteria:

- [ ] Given a machine with `curl`, `bash`, `git`, `node`, and `pnpm`, when the user runs the curl bootstrap command with `--dry-run`, then the installer prints every planned action and exits without writing cache, CLI links, or harness config.
- [ ] Given the same machine, when the user runs the curl bootstrap command without `--dry-run`, then Saguaro downloads into a user cache, validates plugin artifacts, links the `saguaro` CLI, and installs into detected harnesses at user scope.
- [ ] Given only one harness should be installed, when the user passes `--claude`, `--codex`, or `--gemini`, then only that harness install is attempted.

### Persona: Cautious Developer

This user wants to inspect scripts before executing them.

**Story:** As a cautious developer, I want the curl command to be readable and the bootstrap behavior documented so that I can understand what will run before I trust it.

Acceptance criteria:

- [ ] Given the user opens the raw install script, then the bootstrap flow is clear from the script itself.
- [ ] Given the user reads docs, then the docs explain where Saguaro is downloaded, what commands are run, and how to remove the cached checkout.
- [ ] Given the user passes `--help`, then the installer lists bootstrap-specific options and normal install options.

### Persona: Contributor

This user has already cloned the repository.

**Story:** As a contributor, I want `./install.sh` to keep working from the repo checkout so that dogfooding and development stay simple.

Acceptance criteria:

- [ ] Given the script is run from a full repository checkout, then it uses the local checkout and does not download another copy by default.
- [ ] Given the user passes `--dry-run`, then local repo install behavior remains non-mutating.
- [ ] Given marketplace artifacts are stale, then the local install still runs the existing build and validation path before installing.

## 5. Solution Overview

The installer should support two modes:

1. **Repo-local mode:** If `install.sh` is running from a complete Saguaro checkout, keep the current behavior: build, validate, link CLI, and install detected harness plugins.
2. **Bootstrap mode:** If `install.sh` is not running from a complete checkout, download or clone Saguaro into a user cache, then execute the cached checkout's `install.sh` with the original arguments.

The bootstrap should prefer a tagged release when available, with `main` as an explicit development fallback. It should print the selected source, cache directory, and delegated command before running mutations.

Recommended cache shape:

```text
~/.cache/saguaro-agent/
├── source/
└── logs/
```

The bootstrap installer should remain small enough to inspect. It should not duplicate marketplace installation logic; it should only prepare a local source tree and delegate.

## 6. Technical Considerations

### Dependencies

| Dependency | Needed For | Risk |
| --- | --- | --- |
| `bash` | Installer runtime | Low |
| `curl` | Fetching bootstrap script and optional archives | Low |
| `git` | Cloning public repository fallback | Medium |
| `node` | Running Saguaro build and CLI | Medium |
| `pnpm` | Building and validating repo-local marketplace artifacts | Medium |
| Harness CLIs | Installing Claude, Codex, or Gemini plugin artifacts | Medium |

### Proposed Options

| Option | Pros | Cons | Recommendation |
| --- | --- | --- | --- |
| Clone repository into cache, then delegate | Simple, transparent, works before release artifacts exist | Requires `git`; downloads source history unless shallow clone is used | Use for v1 |
| Download GitHub tarball into cache, then delegate | Does not require `git`; smaller download | Slightly more archive handling logic; checksums need release discipline | Consider after v1 |
| Publish npm package and use `npx` | Familiar CLI distribution path | Does not solve harness marketplace artifact install by itself | Future option |
| Host a custom installer endpoint | Can optimize UX | Adds hosted infra and trust burden | No |

### Risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Curl pipe to shell feels unsafe | High | High | Keep script readable, document dry run, support manual clone path |
| Bootstrap downloads stale or moving `main` | Medium | Medium | Add `--ref` option and prefer release tags for published docs |
| User lacks `pnpm` | Medium | High | Fail with a clear message and installation hint |
| PATH does not include `~/.local/bin` | Medium | Medium | Existing installer prints a PATH note; docs should repeat it |
| Existing cache is dirty or broken | Medium | Medium | Add `--refresh` to remove and redownload cached source |

## 7. Requirements

### Functional Requirements

- The script must detect whether it is running from a full checkout.
- The script must support curl execution from arbitrary directories.
- The script must create a user cache directory when needed.
- The script must support `--dry-run` without writing files.
- The script must support `--ref <git-ref>` for testing branches, tags, or commits.
- The script must support `--refresh` to replace the cached checkout.
- The script must preserve existing flags: `--all`, `--claude`, `--codex`, `--gemini`, `--no-cli`, `--cli-dir`, and `--dry-run`.
- The bootstrap must delegate to the cached checkout's `install.sh` instead of duplicating harness install logic.
- The installer must print clear failure messages for missing `git`, `node`, `pnpm`, or harness CLIs.

### Documentation Requirements

- Update `README.md` with curl install and dry-run commands.
- Update `docs/getting-started.md` with curl-first and clone-first paths.
- Update `docs/plugin-installation.md` with cache location, flags, refresh behavior, and manual uninstall notes.
- Keep contributor install instructions separate from end-user install instructions.

### Verification Requirements

- Add or update installer tests for argument parsing and bootstrap command generation when practical.
- Add a dogfood checklist that runs:

```bash
curl -fsSL https://raw.githubusercontent.com/11-Mile-Labs/saguaro-agent/main/install.sh | bash -s -- --dry-run
curl -fsSL https://raw.githubusercontent.com/11-Mile-Labs/saguaro-agent/main/install.sh | bash -s -- --dry-run --codex
```

- Validate repo-local install still works:

```bash
./install.sh --dry-run
./install.sh --dry-run --no-cli --claude
```

## 8. Launch Plan

| Phase | Audience | Success Gate |
| --- | --- | --- |
| Internal dogfood | Maintainers | Curl dry-run works from outside repo and repo-local dry-run remains unchanged |
| Private repo validation | Early users with repo access | Real install succeeds into at least one harness at user scope |
| Public launch | Public GitHub visitors | README curl command is the first successful install path |

## 9. Rollback Criteria

Do not promote curl install in the README if:

- bootstrap dry-run mutates filesystem state
- repo-local install behavior regresses
- installer cannot explain what it is about to run
- cache refresh can delete paths outside the Saguaro cache
- harness plugin installation no longer validates

## 10. Open Questions

- Should published docs default to `main`, a version tag, or a `latest` release asset?
- Should v1 require `git`, or should the first release use GitHub tarballs to reduce dependencies?
- Should `install.sh` install `pnpm` if it is missing, or fail with instructions?
- Should the bootstrap cache live under `~/.cache/saguaro-agent` on all platforms, or follow XDG/macOS conventions?
- Should uninstall be part of this feature or a follow-up feature?
