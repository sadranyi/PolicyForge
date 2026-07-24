# Changelog

All notable changes to PolicyForge are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); this project versions the CLI,
core engine, and web app together.

## [Unreleased] — v0.2.0 (in progress)

This release turns PolicyForge from a one-shot policy reviewer into a policy
enforcement platform: a canonical rule format that every surface compiles from,
runtime enforcement for AI chats and agents, operational/audit emitters, policy
drift detection, PDF ingestion, and a full incident-reporting subsystem.

### Added
- **Canonical Rule Pack** (`compileRulePack`, `scanText`, `validateRulePack`): one
  versioned rule format (review + runtime kinds) every surface compiles from;
  deterministic scan engine with verdict + redaction. [973547a]
- **PDF policy ingestion** via pdfjs-dist (pure JS), with scanned-PDF warning. [2003862]
- **Emitters**: SARIF 2.1.0, OCSF 1.3.0 Compliance Findings, Sigma detection rules. [1ecb1c1]
- **Policy drift detection**: byte-comparable snapshots + diff with a `regressed`
  flag for CI gating. [fd40b6a]
- **MCP-hygiene baseline rules** (+3): approved MCP allowlist, config in version
  control, tool-permission review. [9bf2eb8]
- **Incident reporting subsystem** + FRD + Implementation Spec + live dashboard:
  deterministic SEV1–SEV4 classification and regulatory deadline computation
  (GDPR, NIS2, SEC 8-K, HIPAA, California, PCI, CIRCIA-advisory). [ce9a555]
- **DLP pattern-pack exporters** (browser bridge): Purview / Netskope / Zscaler /
  generic. [cc2903e]
- **Runtime enforcement surface**: `policyforge scan`, `gate` (Claude Code hook),
  `hooks` installer, and a `POST /v1/scan` guard sidecar. [d3d8897]
- **PolicyForge MCP server** (`policyforge-mcp`): `policy_check`, `check_tool_call`,
  `list_rules` over JSON-RPC/stdio, dependency-free. [d8dd558]
- **CLI integration**: `review --emit all` (SARIF+OCSF+snapshot), `--drift-against`
  / `--fail-on-drift`, and `dlp-export`. [924740c]

### Changed
- AI-usage baseline grew from 16 to 19 rules (MCP hygiene). Total review rules: 63.
- Web health endpoint reports 0.2.0; startup banner lists the guard sidecar.

### Tests
- 93 automated tests (76 core + 10 CLI + 7 MCP) plus 12 baseline correctness
  tests — all green. Every new module is covered.

### Build tracking
See `docs/BUILD_STATUS.md` for the live feature ledger (owner agent, reviewer,
counsel verdict, tests) so other sessions and agents can pick up mid-stream.
