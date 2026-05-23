# Semver And Compatibility

Saguaro versions two things independently:

- the Saguaro engine itself
- each workflow YAML file

## Engine Semver

- **MAJOR**: breaking changes to public tool signatures, config schema, workflow schema, or dispatch log format
- **MINOR**: additive optional fields, new tools, or new hooks
- **PATCH**: bug fixes, docs, and internal refactors

## Workflow Semver

- **MAJOR**: breaking workflow contract changes
- **MINOR**: additive non-breaking changes such as new phases or optional outputs
- **PATCH**: text, defaults, or non-contract tuning

## Compatibility Rule

A workflow with `version: 1.x.y` should run on a Saguaro `1.a.b` engine when the engine understands that workflow schema generation.

If a workflow major version exceeds the engine major version, the engine should refuse to run it with a clear message.

## Why This Split Exists

The engine and a workflow library evolve at different speeds. Independent versioning lets teams update one without pretending the other changed too.
