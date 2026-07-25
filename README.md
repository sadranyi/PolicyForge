# PolicyForge

> Turn your security policies into agent instructions, pre-commit hooks, CI gates, and starter playbooks. In 15 minutes.

PolicyForge bridges the gap between Word-document policies and `git commit`. You upload a policy. PolicyForge reviews it against a transparent baseline cited from named public frameworks, tells you where the gaps are, and generates a tailored enforcement toolkit for your stack.

## Why this exists

Most organizations have a folder of PDFs that say *"this is our policy"* and an engineering reality where those policies are unenforced and undocumented in the place the work actually happens. Between Word document and `git commit`, compliance dies.

This tool is the bridge. One command produces a working toolkit your team can drop into their repos.

## Baselines (shipped since v0.1)

Three baselines, each with its own toolkit shape:

| Baseline | Rules | Frameworks cited | Toolkit produces |
|---|---:|---|---|
| **AI usage policy** | 16 | NIST AI RMF, OWASP LLM Top 10, ISO 42001, EU AI Act, NIST 800-53 | `AGENTS.md`, AI content guard, gitleaks config, husky pre-commit, CI policy gates, incident response runbook |
| **Secure coding standards** | 25 | OWASP ASVS, OWASP Top 10, NIST SSDF, CWE Top 25, NIST 800-53 | In-repo `SECURE_CODING_STANDARDS.md`, AI-agent secure-coding rules, threat-model template, security-aware PR template, CodeQL/SAST workflow, Dependabot config, gitleaks |
| **Incident response policy** | 19 | NIST 800-61, ISO 27035, GDPR Art. 33, NIS2, CISA IR Playbooks, NIST 800-53 | In-repo `INCIDENT_RESPONSE_POLICY.md`, severity classification card, tabletop exercise template, five starter playbooks (data breach, ransomware, phishing, AI data leak, prompt injection), security-incident issue template |

**63 rules total. 14 unique frameworks. Three working toolkits.**

The engine is policy-type agnostic. Adding new categories is a baseline-data update plus one new generator file, not an engine rewrite.

## New in v0.2 — from reviewer to enforcement platform

v0.2 turns PolicyForge into a policy *enforcement* platform. Everything below compiles from one canonical **Rule Pack** (`policyforge-core` → `compileRulePack()`), so every surface shares a single source of truth and every finding carries its framework citation.

- **PDF policy ingestion.** Real policies are PDFs; the extractor now reads them (pure-JS, no native build), with a warning when a PDF looks scanned/image-only.
- **Live enforcement for AI chats & agents.**
  - **MCP server** (`policyforge-mcp`) exposes `policy_check`, `check_tool_call`, and `list_rules` to Claude, ChatGPT developer mode, Cursor, and Codex — ask "is this allowed by our policy?" mid-conversation.
  - **Claude Code hooks** — `policyforge gate` is a PreToolUse/UserPromptSubmit adapter that *denies* tool calls or prompts carrying secrets/regulated PII, citing the rule and framework. `policyforge hooks --install` wires it up.
  - **Guard sidecar** — `POST /v1/scan` on the web app returns a cited verdict (+ optional redaction).
  - **`policyforge scan`** — scan text/stdin/files; exit 1 on a block verdict (CI/pre-commit friendly).
- **Incident reporting subsystem.** `policyforge incident` classifies severity (SEV1–SEV4), computes every applicable regulatory reporting deadline deterministically (GDPR Art 33/34, NIS2 24h/72h/1mo, SEC 8-K 4 business days, HIPAA, California, PCI, CIRCIA advisory), and produces a report, an OCSF event, and a live-countdown HTML **dashboard**. See [`docs/incident/FRD.md`](docs/incident/FRD.md) and [`docs/incident/IMPLEMENTATION_SPEC.md`](docs/incident/IMPLEMENTATION_SPEC.md).
- **Operational & audit emitters.** `review --emit all` writes **SARIF** (GitHub/Azure DevOps code scanning), **OCSF** Compliance Findings (SIEMs), and always a **drift snapshot**. `--drift-against <snapshot> --fail-on-drift` fails CI when a policy edit introduces a new gap. **Sigma** detection rules are available from the rule pack.
- **Browser bridge (DLP packs).** `policyforge dlp-export --target purview|netskope|zscaler|generic` exports the same runtime rules as import packs for the enterprise DLP tools that own the browser vector — so browser-layer enforcement derives from your policy too.

Everything stays deterministic, local, no-LLM, and framework-cited. See [`CHANGELOG.md`](CHANGELOG.md) and [`docs/BUILD_STATUS.md`](docs/BUILD_STATUS.md).

**Per-package usage docs:** [core](packages/core/README.md) · [CLI](packages/cli/README.md) · [MCP server](packages/mcp/README.md) · [web](packages/web/README.md) — index at [`docs/MODULES.md`](docs/MODULES.md).

## Form factors

- **CLI** (`policyforge`) — the canonical engine. Privacy-friendly: nothing leaves your machine.
- **MCP server** (`policyforge-mcp`) — runtime policy checks for any MCP-capable AI assistant.
- **Web app** — same engine, browser interface + `/v1/scan` guard sidecar. Run hosted, or self-host with `docker compose up`.

## What it does

1. **Reviews** your policy against the chosen baseline. Outputs a Markdown + JSON review with severity-rated observations, suggested resolutions, and explicit citations to source frameworks.
2. **Generates** a stack-tailored enforcement toolkit. The exact files depend on the baseline (see table above).

## What it is not

- **Not legal advice.** PolicyForge identifies gaps against published frameworks; it doesn't certify compliance. Pair its output with review by your Legal and Compliance teams.
- **Not a replacement for human security expertise.** A staff security engineer reading your policy will catch nuances PolicyForge won't. Use it as a competent first pass, not an endpoint.
- **Not opinionated about your stack.** It supports common stacks well (TypeScript/JavaScript, C#, Python, Java); it tries to stay quiet about preferences within them.

## License

Apache 2.0. No paid tier. The baseline citations are public; the engine is auditable; the toolkit it generates is yours to modify and ship.

## Getting started

```bash
# Install deps
npm install

# Try it: review a sample policy with each baseline
node packages/cli/src/index.js review --policy examples/sample-policy.md --baseline ai-usage-policy
node packages/cli/src/index.js review --policy examples/sample-secure-coding-good.md --baseline secure-coding-standards
node packages/cli/src/index.js review --policy examples/sample-incident-response-good.md --baseline incident-response

# Generate a toolkit
node packages/cli/src/index.js generate \
  --policy examples/sample-policy.md \
  --baseline ai-usage-policy \
  --stack typescript --ci github-actions \
  --output ./policyforge-output

# Web (local development)
cd packages/web && npm install && npm run dev
# open http://localhost:3000

# Web (self-host with Docker)
docker compose up
# open http://localhost:3000
```

## Project structure

```
policyforge/
├── packages/
│   ├── core/                            # The engine — extraction, review, generation
│   │   ├── src/
│   │   │   ├── extractors/              # Policy-document parsing (md, txt, docx)
│   │   │   ├── reviewers/               # Pattern-based gap analysis
│   │   │   ├── generators/              # Toolkit generators (one per baseline)
│   │   │   │   ├── toolkit.js                          # Dispatcher + AI generator
│   │   │   │   ├── secure-coding-toolkit.js
│   │   │   │   └── incident-response-toolkit.js
│   │   │   └── baseline/                # Strict baseline YAML loader
│   │   └── baseline-data/               # The actual baseline rules (YAML)
│   │       ├── ai-usage-policy.yaml
│   │       ├── secure-coding-standards.yaml
│   │       └── incident-response.yaml
│   ├── cli/                             # CLI wrapper around core
│   └── web/                             # Web frontend (Express + vanilla TS)
├── examples/                            # Bad and good sample policies for each baseline
├── scripts/                             # test-baselines.js, e2e-test.js, build-demo-svg.py
├── site/                                # Marketing site (landing page, blog, demo SVG)
└── docs/                                # Architecture, contributing, baseline methodology
```

## Testing

```bash
# Run baseline correctness tests (3 baselines × bad+good samples)
node scripts/test-baselines.js

# Run end-to-end web tests (spawns server, hits endpoints, validates outputs)
node scripts/e2e-test.js
```

## Contributing

The single most important non-code question for this project is: who maintains the baselines? See [`docs/BASELINE_METHODOLOGY.md`](docs/BASELINE_METHODOLOGY.md) for the governance model, the citation policy, and how to propose new rules. Single-maintainer baselines go stale; recruiting co-maintainers is the most important non-code priority for this project.

To propose a baseline rule, [open an issue with the `baseline-rule` label](https://github.com/sadranyi/PolicyForge/issues/new?labels=baseline-rule). To dispute a finding produced by the tool, [open an issue with the `dispute-finding` label](https://github.com/sadranyi/PolicyForge/issues/new?labels=dispute-finding).
