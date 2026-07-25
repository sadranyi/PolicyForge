# PolicyForge — module & package guide

Where to find usage docs for each piece. PolicyForge is a monorepo; every surface
is a thin wrapper over `policyforge-core`.

## Packages

| Package | What it is | Usage doc |
|---|---|---|
| `policyforge-core` | The engine: extraction, review, toolkit generation, Rule Pack + scan engine, emitters, drift, incident subsystem | [packages/core/README.md](../packages/core/README.md) |
| `policyforge` (CLI) | Command-line interface — `wizard`, `review`, `generate`, `incident`, `scan`, `gate`, `hooks`, `dlp-export` | [packages/cli/README.md](../packages/cli/README.md) |
| `policyforge-mcp` | MCP server — `policy_check`, `check_tool_call`, `list_rules` for AI assistants | [packages/mcp/README.md](../packages/mcp/README.md) |
| `policyforge-web` | HTTP app + `/v1/scan` guard sidecar; Docker self-host | [packages/web/README.md](../packages/web/README.md) |

## Core modules (inside `policyforge-core`)

| Module | Responsibility | Key exports |
|---|---|---|
| `extractors/` | Parse `.md/.txt/.docx/.pdf` into normalized text | `extractText` |
| `baseline/` | Load + strictly validate baseline YAML | `loadBaseline`, `validateBaseline` |
| `reviewers/` | Apply baseline rules to policy text | `reviewPolicy` |
| `generators/` | Produce enforcement toolkits + review docs | `generateToolkit`, `generateReviewDocument` |
| `rulepack/` | Canonical Rule Pack + deterministic scan engine | `compileRulePack`, `scanText`, `validateRulePack` |
| `emitters/` | SARIF / OCSF / Sigma + DLP packs | `toSarif`, `toOcsf`, `toSigma`, `toDlpPack` |
| `drift/` | Snapshot + diff for policy drift | `snapshotReview`, `diffSnapshots` |
| `incident/` | Severity classification + regulatory deadlines | `incident.createIncident`, … |

## Deep-dive docs

- Incident reporting **Functional Requirements** — [docs/incident/FRD.md](incident/FRD.md)
- Incident reporting **Implementation Spec** (data model, algorithms) — [docs/incident/IMPLEMENTATION_SPEC.md](incident/IMPLEMENTATION_SPEC.md)
- Baseline governance & citation policy — [docs/BASELINE_METHODOLOGY.md](BASELINE_METHODOLOGY.md)
- Release process — [docs/RELEASING.md](RELEASING.md)
- Build ledger / status for other sessions — [docs/BUILD_STATUS.md](BUILD_STATUS.md)
- Changelog — [CHANGELOG.md](../CHANGELOG.md)

## First principles
Deterministic, no-LLM, no telemetry, no network, framework-cited. The engine
never calls `Date.now()`/`Math.random()`; any "now" is injected. Identical inputs
produce identical outputs.
