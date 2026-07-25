# `policyforge-core`

The PolicyForge engine — extraction, review, toolkit generation, the canonical
Rule Pack, the runtime scan engine, emitters, drift detection, and the incident
subsystem. Deterministic, no-LLM, no telemetry, no network. Everything the CLI,
web app, and MCP server do is a thin wrapper over this package.

```bash
npm install policyforge-core
```

```js
const core = require('policyforge-core');
```

All functions are synchronous unless they return a `Promise` (noted below).

---

## Review pipeline

### `loadBaseline(idOrPath)` → `Promise<Baseline>`
Load and strictly validate a baseline. `id` is one of `ai-usage-policy`,
`secure-coding-standards`, `incident-response`, or an absolute path to a `.yaml`.

```js
const baseline = await core.loadBaseline('ai-usage-policy');
```

### `extractText(input)` → `Promise<{text, format, source, warnings, pages?}>`
Extract normalized text from a policy document. `input` is a file path string or
`{ buffer, name }`. Supports `.md`, `.markdown`, `.txt`, `.docx`, `.pdf`. PDFs
return a `pages` count and may include a `low_text_yield` warning for scanned files.

```js
const { text, warnings } = await core.extractText('./policy.pdf');
```

### `reviewPolicy(text, baseline)` → `Review`
Apply a baseline's rules to policy text. Each finding is `satisfied` | `partial`
| `gap` with matched evidence and citations. Deterministic.

```js
const review = core.reviewPolicy(text, baseline);
console.log(review.recommendation, review.summary.by_status);
```

### `generateReviewDocument(review, { org_name })` → `{ markdown, data }`
Render a human-readable Markdown review report.

### `generateToolkit({ review, baseline, stack })` → `{ [path]: contents }`
Generate the enforcement toolkit (AGENTS.md, hooks, CI gates, runbooks…). `stack`
is `{ languages: ['typescript'], ci: 'github-actions', org_name, policy_owner_email }`.

### `run({ policyText, baselineId, stack })` → `Promise<{ review, toolkit }>`
One-shot convenience pipeline: review + generate.

---

## Rule Pack & scan engine

### `compileRulePack({ baselines?, includeRuntime? })` → `Promise<RulePack>`
Compile the canonical rule pack (review rules from the baselines + runtime
detection rules). This is the single source of truth every surface consumes.

```js
const pack = await core.compileRulePack();          // all three baselines + runtime
```

### `scanText(text, pack, opts?)` → `ScanResult`
The runtime primitive. Scans arbitrary text for policy violations (secrets,
regulated PII, prompt injection). `opts`: `{ direction, context, redact }`.
Returns `{ verdict, findings, summary, redacted_text? }` where `verdict` is one of
`allow` | `flag` | `coach` | `redact` | `block`. Every finding carries its
`framework_citations` and control IDs.

```js
const pack = await core.compileRulePack();
const res = core.scanText('paste of sk-ant-api03-…', pack, { redact: true });
if (res.verdict === 'block') throw new Error('policy violation');
```

### `validateRulePack(pack)` → `true` (throws on invalid)
Strict structural validation (citations mandatory, actions constrained, patterns
must compile).

---

## Emitters

Turn a review (or the pack) into standard wire formats. Pure serialization.

### `toSarif(review, { policySource, toolVersion })` → SARIF 2.1.0 object
Gaps become GitHub / Azure DevOps code-scanning alerts.

### `toOcsf(review, { time, org, toolVersion })` → OCSF Compliance Finding[] (class 2003)
One event per rule for SIEMs (Splunk, Sentinel, Google SecOps, Elastic). Pass a
fixed `time` (ms epoch) for determinism.

### `toSigma(pack)` → Sigma rule[]
Detection rules from the pack's runtime rules for SOC ingestion.

```js
const sarif = core.toSarif(review, { policySource: 'policy.md' });
const events = core.toOcsf(review, { time: Date.parse(review.reviewed_at), org: 'Acme' });
const sigma = core.toSigma(pack);
```

---

## DLP browser-bridge exporters

Export runtime rules as import packs for the DLP tools that own the browser vector.

- `toPurviewSIT(pack)` — Microsoft Purview custom Sensitive Information Types
- `toNetskopeDLP(pack)` — Netskope custom DLP entities
- `toZscalerDLP(pack)` — Zscaler custom DLP dictionaries
- `toGenericDictionary(pack)` — portable regex dictionary
- `toDlpPack(pack, target)` — dispatcher (`'purview' | 'netskope' | 'zscaler' | 'generic'`)

```js
const purview = core.toDlpPack(pack, 'purview');
```

---

## Drift detection

### `snapshotReview(review)` → `Snapshot`
Stable, byte-comparable snapshot (strips timestamps/offsets).

### `diffSnapshots(before, after)` → `Drift`
Diff two snapshots (or raw reviews). Returns `{ drifted, regressed, summary,
new_gaps, resolved, severity_changes, rules_added, rules_removed }`. Use
`regressed` to fail CI when a policy edit introduces a new gap.

```js
const drift = core.diffSnapshots(priorSnapshot, core.reviewPolicy(text, baseline));
if (drift.regressed) process.exit(1);
```

---

## Incident subsystem (`core.incident`)

Deterministic incident classification + regulatory deadline computation.
**NOT LEGAL ADVICE** — deadlines are software estimates; have counsel/DPO review.

### `createIncident(intake, opts)` → `IncidentRecord`
Classify severity (SEV1–SEV4) and compute all applicable regulatory deadlines
(GDPR, NIS2, SEC 8-K, HIPAA, California, PCI, CIRCIA). `opts.now` (ISO string) is
required and injected for determinism; the engine never calls `Date.now()`.

```js
const rec = core.incident.createIncident({
  title: 'Vendor DB exposure',
  timestamps: { awareAt: '2026-07-20T10:00:00Z', discoveredAt: '2026-07-20T10:00:00Z' },
  signals: { dataClasses: ['PII', 'PHI'], recordCount: 1200, confirmedExfiltration: true },
  orgContext: { gdprApplies: true, hipaaRole: 'COVERED_ENTITY', nis2Entity: 'ESSENTIAL', jurisdictions: ['US-CA'] },
  humanDeterminations: { materiality: 'MATERIAL', gdprRisk: 'HIGH_RISK', hipaaIsBreach: 'BREACH' },
}, { now: '2026-07-21T15:00:00Z' });

console.log(rec.severity);                               // 'SEV1'
console.log(core.incident.deadlineBoard(rec, '2026-07-21T15:00:00Z'));
```

Other methods: `deadlineBoard(record, refIso)`, `renderIncidentReport(record)` →
Markdown, `incidentToOcsf(record, { time })` → OCSF Incident Finding (class 2004),
`addTimelineEvent(record, type, at, note)`.

See [`docs/incident/FRD.md`](../../docs/incident/FRD.md) and
[`docs/incident/IMPLEMENTATION_SPEC.md`](../../docs/incident/IMPLEMENTATION_SPEC.md)
for the full data model and algorithms.

---

## Determinism contract

The engine never calls `Date.now()` / `Math.random()`. Any "now" is injected by
the caller. Identical inputs produce byte-identical outputs — which is what makes
drift detection and reproducible audits possible.

## License

Apache-2.0.
