# PolicyForge v0.2.0 — Build Status Ledger

> Central coordination doc. Any session or agent resuming this work reads this
> first. Each feature moves through: SPEC → BUILD → REVIEW (independent) → FIX →
> TEST → COUNSEL (3 agents, unanimous) → MERGED. No agent reviews its own work.

Branch: `feat/v0.2.0`  |  Base: `main @ 34ed207`  |  Target version: 0.2.0

## Legend
◻ not started · ◐ in progress · ✅ merged to feat/v0.2.0 · ⛔ blocked

## Wave 1 — Foundations
| # | Feature | Status | Reviewer | Counsel | Tests |
|---|---------|--------|----------|---------|-------|
| 1 | Canonical Rule Pack format + compiler + scan engine | ✅ | pending | pending | 13 ✓ |
| 2 | PDF policy ingestion | ✅ | pending | pending | 4 ✓ |
| 3 | Emitters: SARIF, OCSF, Sigma | ✅ | pending | pending | 6 ✓ |
| 4 | Policy drift detection (snapshot + diff) | ✅ | pending | pending | 6 ✓ |
| 5 | MCP-hygiene baseline rules | ✅ | pending | pending | baselines ✓ |
| 6 | Incident reporting: FRD + Impl Spec + tooling + dashboard | ✅ | pending | pending | 19 ✓ |

## Wave 2 — Surfaces (depend on Wave 1 rule pack)
| # | Feature | Status | Reviewer | Counsel | Tests |
|---|---------|--------|----------|---------|-------|
| 7 | PolicyForge MCP server (policy_check + tool gating) | ◻ | — | — | — |
| 8 | Guard scan sidecar (/v1/scan) + CLI `scan`/`gate` + Claude Code hooks | ◻ | — | — | — |
| 9 | Browser-bridge DLP pattern packs (Purview / Netskope / Zscaler export) | ◻ | — | — | — |

## Decisions log
- Sequential build on one integration branch (`feat/v0.2.0`); reliable merges over parallel worktrees.
- Determinism/no-LLM/citation-transparency moat preserved at every new surface.
- Orchestrator authors code; independent agents review + counsel-approve (separation of duties).


## Wave 1 commits (branch feat/v0.2.0)
- Rule Pack + scan engine: 973547a
- PDF ingestion: 2003862
- Emitters (SARIF/OCSF/Sigma): 1ecb1c1
- Drift detection: fd40b6a
- MCP-hygiene rules: 9bf2eb8
- Incident subsystem + FRD/ImplSpec + dashboard: ce9a555

Wave 1 status: BUILT + TESTED (71 core + 2 CLI tests green, 12 baseline tests green). Pending independent review + counsel sign-off before final integration.
