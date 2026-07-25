# `policyforge` (CLI)

The command-line interface — the canonical, privacy-friendly way to use
PolicyForge. Nothing leaves your machine.

```bash
npm install -g policyforge
# or run without installing:
npx policyforge <command>
```

Run `policyforge --help` for the full flag list. Every command below is
deterministic and offline.

---

## `wizard`
Interactive first-run flow: reviews a policy, asks about your stack, and
generates a tailored toolkit.

```bash
policyforge wizard
```

## `review`
Review a policy against a baseline and write a report. Optionally emit
operational/audit formats and gate on drift.

```bash
policyforge review --policy ./ai-policy.pdf --baseline ai-usage-policy
policyforge review --policy ./ai-policy.md --emit all           # + SARIF + OCSF
policyforge review --policy ./ai-policy.md \
  --drift-against ./policyforge-output/snapshot.json --fail-on-drift   # exit 1 on new gaps
```

Flags: `--policy <file>` (`.md/.txt/.docx/.pdf`), `--baseline <id>`
(`ai-usage-policy` | `secure-coding-standards` | `incident-response`),
`--output <dir>`, `--sarif`, `--ocsf`, `--emit all`, `--drift-against <snapshot.json>`,
`--fail-on-drift`, `--org-name <name>`. Always writes `review.md`, `review.json`,
and `snapshot.json`.

## `generate`
Review + generate the full enforcement toolkit for your stack.

```bash
policyforge generate --policy ./ai-policy.md \
  --stack typescript --ci github-actions \
  --org-name "Acme Corp" --owner-email security@acme.example \
  --output ./policyforge-output
```

Flags: `--stack typescript|csharp|python|java|mixed`,
`--ci azure-devops|github-actions|both|none`, `--secret-store <text>`,
`--org-name`, `--owner-email`, `--output`.

## `incident`
Classify a security incident, compute regulatory reporting deadlines, and build
a report, an OCSF event, and a live-countdown HTML dashboard.

```bash
policyforge incident --demo --out ./incident-output          # try it with sample data
policyforge incident --intake ./incident.json --now 2026-07-21T15:00:00Z
```

Flags: `--intake <file.json>` or `--demo`, `--now <iso>` (defaults to wall clock),
`--out <dir>`, `--holidays 2026-07-03,...`, `--include-advisory` (default on).
Outputs `incident.json`, `incident-report.md`, `incident.ocsf.json`,
`incident-dashboard.html`. **NOT LEGAL ADVICE.** See the intake schema in
[`docs/incident/IMPLEMENTATION_SPEC.md`](../../docs/incident/IMPLEMENTATION_SPEC.md).

## `scan`
Scan text/stdin/a file for policy violations. Exit code `1` on a `block` verdict
(pre-commit / CI friendly).

```bash
echo "$DIFF" | policyforge scan -                 # from stdin
policyforge scan --file ./message.txt --json
policyforge scan --text "paste with a secret" --redact
```

Flags: `--text <s>` | `--file <f>` | `-` (stdin), `--json`, `--redact`,
`--context chat|commit|tool_call`.

## `gate`
Claude Code hook adapter. Reads a hook event JSON on stdin (PreToolUse /
UserPromptSubmit) and emits the hook's decision — **denies** tool calls or
prompts carrying secrets or regulated PII, citing the rule and framework. Usually
wired via `hooks`, not called by hand.

## `hooks`
Print or install the `.claude/settings.json` that wires `gate` as a hook.

```bash
policyforge hooks                # print the settings snippet
policyforge hooks --install      # merge into ./.claude/settings.json (preserves existing hooks)
```

## `dlp-export`
Export the runtime rules as a DLP import pack for the browser-layer tools.

```bash
policyforge dlp-export --target purview --output policyforge-dlp-purview.json
policyforge dlp-export --target netskope   # | zscaler | generic
```

---

## Exit codes
`0` success / allow · `1` block verdict (scan) or drift regression (review
`--fail-on-drift`) · `2` usage error.

## License
Apache-2.0.
