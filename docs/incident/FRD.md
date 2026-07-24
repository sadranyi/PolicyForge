# PolicyForge Incident Reporting — Functional Requirements Document (FRD)

| Field | Value |
|---|---|
| Document | Functional Requirements Document (FRD) |
| Subsystem | Incident Reporting |
| Target release | PolicyForge v0.2.0 |
| Module | `packages/core/src/incident/incident.js` |
| Status | Draft for implementation |
| License | Apache-2.0 |
| Author | GRC + IR Architecture |
| Date | 2026-07-24 |

> **NOT LEGAL ADVICE.** PolicyForge is a deterministic engineering tool. The reporting deadlines, triggers, and notification drafts it produces are software-computed *estimates* based on publicly documented regulatory text and configurable assumptions. They are **not** legal advice and do not create an attorney–client relationship. Regulatory obligations depend on facts, jurisdiction, sector, contracts, and evolving rulemaking (e.g., CIRCIA is not yet in force). Every deadline and notification MUST be reviewed and approved by qualified legal counsel and the Data Protection Officer before reliance or transmission. Citations in this document were verified as of 2026-07-24 and MUST be re-verified periodically.

---

## 1. Purpose & Scope

### 1.1 Purpose
The Incident Reporting subsystem extends PolicyForge from *policy authoring* (its existing 19-rule IR baseline citing NIST 800-61, ISO 27035, GDPR Art 33, NIS2, CISA playbooks) into *operational incident handling support*. Given the attributes of an actual, confirmed or suspected security incident, the subsystem shall deterministically:

1. **Classify** incident severity (SEV1–SEV4).
2. **Compute** every applicable regulatory reporting deadline as an absolute due-timestamp, with the governing trigger and citation.
3. **Generate** a structured, machine-readable incident record and a human-readable Markdown incident report.
4. **Draft** regulator- and stakeholder-facing notification texts.
5. **Maintain** an append-only incident timeline / audit log.
6. **Feed** an offline HTML dashboard and interoperate with PolicyForge's existing SIEM / SARIF / OCSF emitters.

### 1.2 Design philosophy (inherited, non-negotiable)
The subsystem MUST preserve PolicyForge's core tenets:

- **Deterministic** — identical inputs always yield identical outputs. No probabilistic models, no LLM inference, no network calls in the computation path.
- **No-LLM** — classification and deadline math are rule tables and arithmetic, auditable line-by-line.
- **Framework-cited** — every classification and deadline carries a citation to the governing standard or regulation.
- **Local / self-hosted** — runs fully offline; no incident data leaves the operator's environment.

### 1.3 Scope
In scope: intake, classification, deadline computation, record/report generation, notification drafting, timeline, dashboard, and export integration. Out of scope: automated *transmission* of notifications to regulators, legal determination of materiality/risk, and real-time detection (PolicyForge consumes detection outputs; it is not a SIEM/EDR).

---

## 2. Stakeholders & Personas

| Persona | Role in the subsystem | Primary needs |
|---|---|---|
| **CISO** | Accountable owner; approves severity and disclosure posture | Portfolio view, severity mix, deadline countdowns, defensible audit trail |
| **IR Lead / Incident Commander** | Drives the incident; owns the record and timeline | Fast intake, deterministic clocks, task list keyed to deadlines, exportable report |
| **DPO (Data Protection Officer)** | Owns GDPR Art 33/34 and privacy-law obligations | Which privacy regimes triggered, 72h clock, data-subject notice test, citations |
| **Legal Counsel** | Determines materiality/risk; approves all external notices | Draft notifications, delay-provision tracking (SEC/AG), "review required" gates |
| **SOC Analyst** | Enters incident attributes; maintains timeline entries | Simple structured intake, validation, append-only logging |
| **Compliance / GRC Analyst** | Evidence and audit readiness | Immutable audit log, export to OCSF/SARIF, mapping to control frameworks |
| **Regulator / Auditor (external)** | Receives final report / evidence package | Complete, timestamped, citation-grounded record |

---

## 3. In-Scope / Out-of-Scope

### 3.1 In scope
- Structured incident intake (CLI, JSON file, programmatic API).
- Deterministic SEV1–SEV4 severity classification with rationale.
- Deterministic multi-regulation deadline calculation (GDPR, NIS2, SEC, HIPAA, CIRCIA, US-state (California reference), PCI DSS), with business-day handling and injected clock.
- Structured incident record (versioned JSON schema) + Markdown report generator.
- Regulator/stakeholder notification-draft templates.
- Append-only timeline / audit log.
- Offline HTML dashboard.
- Export/emit as OCSF event; attach incident context to existing review/drift outputs; SARIF-compatible export.

### 3.2 Out of scope (v0.2.0)
- Automatic submission to regulator portals (GDPR SA forms, CISA CIRCIA portal, SEC EDGAR, HHS breach portal). The tool drafts; humans send.
- Legal conclusions: **materiality** (SEC), **risk/high-risk** (GDPR 33/34), **breach vs security incident** (HIPAA), and **substantial-risk** delay determinations remain human decisions; the tool records the human's determination and computes clocks *from* it.
- Full case-management / ticketing, evidence chain-of-custody storage of binary artifacts, e-discovery.
- Real-time detection, threat intel enrichment, or any outbound network dependency.
- Jurisdiction coverage beyond the shipped regulation set (extensible via data-driven rule packs).

---

## 4. Functional Requirements

Priority key: **MUST** (required for v0.2.0), **SHOULD** (strongly desired), **MAY** (optional/future). Each FR has acceptance criteria (AC).

### 4.1 Intake (FR-1000)

**FR-1001 — Structured incident intake (MUST).**
The system shall accept an incident's attributes as a structured object: title, description, detection timestamp, awareness timestamp(s), affected data classes, estimated record count, affected systems, regulatory scope (sectors/jurisdictions), confirmed-exfiltration flag, and organizational context (public issuer? HIPAA covered entity/BA? EU establishment? critical-infrastructure sector? processes cardholder data?).
*AC:* Given a valid intake object, the system produces an incident record with all fields populated or explicitly defaulted; missing required fields raise a typed validation error naming each field.

**FR-1002 — Multi-surface intake (MUST).**
Intake shall be accepted via (a) CLI flags/prompts, (b) a JSON file path, and (c) the programmatic `createIncident(input, opts)` API.
*AC:* The three surfaces produce byte-identical incident records for equivalent inputs.

**FR-1003 — Input validation and enum enforcement (MUST).**
All enumerated fields (severity inputs, data classes, regulations, status) shall be validated against the canonical enum sets; unknown values are rejected with the closest valid suggestions.
*AC:* An invalid `dataClasses: ["PHI","widgets"]` fails validation identifying `"widgets"` as unrecognized.

**FR-1004 — Injected clock at intake (MUST).**
Intake shall accept an explicit "now" timestamp (`opts.now`) used for all derived time math; the system shall never call `Date.now()` in the computation path.
*AC:* Two runs with the same `opts.now` and inputs yield identical due-timestamps; a lint/test rule forbids `Date.now`/`new Date()` without an injected value in the incident module.

**FR-1005 — Provisional / incomplete intake (SHOULD).**
The system shall accept an incident in a `TRIAGE` status with unknown record counts or unconfirmed exfiltration, and recompute on update.
*AC:* An incident created with `recordCount: null` classifies on available signals and flags deadlines whose trigger is "unknown/pending."

### 4.2 Classification (FR-2000)

**FR-2001 — Deterministic severity classification (MUST).**
The system shall classify each incident SEV1–SEV4 using a published decision table over: data-class sensitivity, record count band, systems criticality, regulatory scope, and confirmed exfiltration.
*AC:* The Implementation Spec's decision table is fully covered by unit tests; identical inputs always return identical SEV.

**FR-2002 — Classification rationale & citation (MUST).**
Each classification result shall include the matched rule(s) and a citation to NIST SP 800-61 prioritization guidance (functional/informational impact, recoverability) and/or ISO/IEC 27035 assessment stage.
*AC:* Output includes `severity`, `severityRationale[]`, and `citations[]`.

**FR-2003 — Monotonic escalation (SHOULD).**
Re-classification on new information shall never silently downgrade without recording an explicit override with actor and reason.
*AC:* A downgrade requires `override: { actor, reason }`; otherwise the higher severity is retained and a timeline entry is written.

### 4.3 Regulatory clock (FR-3000)

**FR-3001 — Applicability determination (MUST).**
For each supported regulation, a deterministic trigger predicate shall decide applicability from incident + org context.
*AC:* A non-EU, non-issuer, healthcare provider incident with PHI and 900 records triggers HIPAA (individual + media + HHS) and the relevant US-state law(s), and does **not** trigger GDPR/NIS2/SEC.

**FR-3002 — Absolute due-timestamp computation (MUST).**
For each applicable regulation the system shall compute an absolute due-timestamp from the correct start event (awareness, discovery, or determination) and the regulation's clock, returning ISO-8601 UTC.
*AC:* GDPR Art 33 due = `awarenessAt + 72h`; HIPAA individual notice due = `discoveryAt + 60 calendar days`.

**FR-3003 — Business-day arithmetic (MUST).**
Regulations expressed in *business days* (SEC 8-K: 4 business days) shall skip weekends and a configurable holiday calendar.
*AC:* Determination on Thursday with the following Monday a holiday yields the SEC due-date on the subsequent business day, verified by test vectors.

**FR-3004 — Multi-stage clocks (MUST).**
Regulations with staged reporting (NIS2: 24h early warning / 72h notification / 1-month final) shall emit one deadline object per stage with independent triggers.
*AC:* An applicable NIS2 incident yields exactly three deadline objects with the correct offsets and stage labels.

**FR-3005 — Delay / tolling provisions (SHOULD).**
Where a regulation permits delay (SEC AG national-security/public-safety delay; law-enforcement delays under state laws/HIPAA), the system shall represent a delay authorization (authority, granted-at, extension length) and recompute the effective due-timestamp.
*AC:* Recording an SEC AG delay of 30 days shifts only the SEC deadline and logs the authorization; other deadlines are unchanged.

**FR-3006 — "Pending trigger" handling (MUST).**
When a start event has not yet occurred (e.g., materiality not yet determined; awareness pending), the deadline shall be emitted with `status: "PENDING_TRIGGER"` and no due-timestamp, not silently omitted.
*AC:* SEC deadline before a materiality determination is `PENDING_TRIGGER`; on determination it transitions to a concrete due-date.

**FR-3007 — Not-yet-in-force flagging (MUST).**
Obligations under rules not yet effective (CIRCIA final rule) shall be labeled `advisory: true` with a `ruleStatus` note and excluded from hard-countdown alerts by default.
*AC:* CIRCIA appears as advisory with a note that the final rule is pending (~May 2026 projection) and is not counted as a binding deadline.

### 4.4 Notifications (FR-4000)

**FR-4001 — Per-regulator notification drafts (MUST).**
The system shall generate a Markdown notification draft per applicable obligation, pre-filled from the incident record, with mandatory-field placeholders where facts are unknown.
*AC:* A triggered GDPR obligation yields an Art 33 SA-notification draft containing nature of breach, categories/approximate number of data subjects and records, likely consequences, and measures taken (the Art 33(3) content set).

**FR-4002 — Review gate (MUST).**
Every draft shall carry a conspicuous "DRAFT — legal review required, not legal advice" banner and a `reviewState` of `DRAFT` until a human sets `APPROVED`.
*AC:* Drafts export with the banner; export of an `APPROVED` notice records approver and timestamp.

**FR-4003 — Data-subject / individual notice test (SHOULD).**
For GDPR Art 34 and HIPAA individual notice, the system shall surface the qualifying test (GDPR "high risk"; HIPAA "unsecured PHI"/breach) as a human decision prompt and only emit the individual-notice draft when the human affirms it.
*AC:* Art 34 draft is withheld until `highRiskToIndividuals: true` is set, with the decision logged.

**FR-4004 — Recipient routing metadata (SHOULD).**
Each draft shall include *who to notify* (regulator name, and category such as lead supervisory authority, CSIRT/competent authority, HHS Secretary, prominent media, card brands/acquirer, state AG) without hardcoding contact endpoints.
*AC:* NIS2 drafts name the CSIRT/competent authority as recipient; HIPAA ≥500 drafts name HHS Secretary and prominent media outlets.

### 4.5 Timeline & audit log (FR-5000)

**FR-5001 — Append-only timeline (MUST).**
The system shall maintain an ordered, append-only list of timeline events (detection, awareness, classification, deadline computed, notification drafted/approved, status change, override), each with UTC timestamp, actor, event type, and payload.
*AC:* No API mutates or deletes an existing entry; corrections are new entries referencing the prior entry's id.

**FR-5002 — Deterministic ordering & IDs (MUST).**
Entry ordering shall be stable and independent of wall-clock; entry IDs shall be deterministic given inputs (content hash or injected sequence).
*AC:* Re-running the same scripted incident reproduces identical entry IDs and order.

**FR-5003 — Audit export (MUST).**
The timeline shall be exportable as JSON and Markdown for evidence packages.
*AC:* Export round-trips without loss; JSON validates against the timeline schema.

### 4.6 Dashboard (FR-6000)

**FR-6001 — Offline HTML dashboard (MUST).**
The system shall render a self-contained, offline HTML dashboard (no external network/CDN) from one or more incident records.
*AC:* Opening the HTML file with no network connectivity renders fully.

**FR-6002 — Deadline countdown view (MUST).**
The dashboard shall show, per open incident, every applicable deadline with its stage, governing citation, and time-remaining relative to a caller-supplied reference time.
*AC:* Countdown values are computed from an injected reference time (query param or embedded constant), never live `Date.now()` at render, preserving determinism/testability.

**FR-6003 — Portfolio views (SHOULD).**
The dashboard shall show open-incident count, severity mix (SEV1–SEV4 distribution), and status breakdown.
*AC:* Given N incidents, counts and distributions match the source records exactly.

**FR-6004 — Overdue / imminent flagging (SHOULD).**
Deadlines past due or within a configurable warning window shall be visually flagged; advisory (not-in-force) obligations shall be visually distinct.
*AC:* An overdue GDPR 72h clock is flagged red; CIRCIA advisory rows are styled as advisory, not overdue.

### 4.7 Export & integration (FR-7000)

**FR-7001 — OCSF incident emission (MUST).**
The system shall emit each incident as an OCSF-conformant event compatible with PolicyForge's existing OCSF emitter, mapping severity and status to OCSF fields.
*AC:* Emitted JSON validates against the OCSF schema used by the existing emitter; severity maps deterministically.

**FR-7002 — SARIF-compatible export (SHOULD).**
Incident findings (e.g., control failures implicated) shall be expressible in the SARIF form used by existing PolicyForge emitters, for pipeline continuity.
*AC:* SARIF export validates against SARIF 2.1.0 and includes rule IDs and locations where applicable.

**FR-7003 — SIEM-friendly export (SHOULD).**
The system shall provide newline-delimited JSON (NDJSON) suitable for SIEM ingestion.
*AC:* Each line is an independently valid JSON incident/event object.

**FR-7004 — Attach to review/drift outputs (SHOULD).**
The system shall allow attaching an incident reference to PolicyForge review and policy-drift outputs so an incident links to the policy/control context that governed it.
*AC:* A review/drift output can carry an `incidentRef` resolving to the incident record.

### 4.8 Evidence & audit (FR-8000)

**FR-8001 — Deterministic evidence package (MUST).**
The system shall export a complete evidence bundle (record + timeline + deadlines + drafts + citations) that is byte-reproducible from the same inputs and injected clock.
*AC:* Two exports from identical inputs hash-match.

**FR-8002 — Citation integrity (MUST).**
Every deadline, classification, and obligation shall carry a citation object (regulation, article/section, source URL, retrieved-date).
*AC:* No emitted obligation lacks a citation; a test asserts citation presence for every rule.

**FR-8003 — Schema versioning (MUST).**
The incident record shall embed a `schemaVersion`; loaders shall reject unknown major versions.
*AC:* Loading a record with a higher major `schemaVersion` fails with a clear error.

---

## 5. Non-Functional Requirements

**NFR-1 — Determinism (MUST).** All outputs are pure functions of inputs plus an injected clock and injected holiday calendar. No `Date.now()`, no `Math.random()`, no locale-dependent date parsing in the computation path.

**NFR-2 — Offline / zero-network (MUST).** No runtime network calls. Citations are static strings; the dashboard bundles all assets inline.

**NFR-3 — Auditability (MUST).** Every state transition is logged in the append-only timeline; outputs are reproducible and hashable for evidence.

**NFR-4 — Portability (MUST).** Pure Node.js (LTS), no native dependencies; runs on Linux/macOS/Windows. Minimal, permissively licensed dependency footprint consistent with Apache-2.0 distribution.

**NFR-5 — i18n-ready (SHOULD).** All human-facing strings (report labels, notification templates, dashboard text) are externalized to message catalogs keyed by locale; date formatting is locale-parameterized while internal storage stays ISO-8601 UTC.

**NFR-6 — Performance (SHOULD).** Classification + full deadline computation for a single incident completes in <50 ms; dashboard renders 1,000 incidents in <2 s.

**NFR-7 — Testability (MUST).** ≥90% line coverage on `incident.js`; every regulation has golden test vectors including boundary dates (weekends, holidays, DST, leap day).

**NFR-8 — Security & privacy (MUST).** No incident data is transmitted; files are written only to caller-specified paths; the tool never logs full record contents to stdout unless explicitly requested.

**NFR-9 — Backward/forward compatibility (SHOULD).** Regulation rule packs are data-driven and versioned so a rule change (e.g., CIRCIA finalization, a state-law amendment) is a data update, not a code change.

---

## 6. Regulatory Obligations Reference Table

> Configurable, data-driven; values reflect publicly documented text verified 2026-07-24. **Not legal advice** — confirm with counsel and re-verify against primary sources.

| Regulation | Applicability trigger (predicate) | Clock / deadline | Start event | Who to notify | Citation (URL) |
|---|---|---|---|---|---|
| **GDPR Art 33** | Personal data breach; controller subject to GDPR; breach likely to result in risk to individuals | **72 hours** (calendar) | "Becoming aware" of the breach | Lead / competent supervisory authority | https://gdpr-info.eu/art-33-gdpr/ |
| **GDPR Art 34** | Breach likely to result in **high risk** to individuals | "Without undue delay" | Awareness + high-risk determination | Affected data subjects | https://gdpr-info.eu/art-34-gdpr/ |
| **NIS2 — early warning** | Essential/important entity; **significant incident** (EU 2022/2555 Art 23) | **24 hours** | Becoming aware of significant incident | CSIRT / competent authority | https://www.nis-2-directive.com/NIS_2_Directive_Article_23.html |
| **NIS2 — incident notification** | Same | **72 hours** (24h for trust-service providers) | Becoming aware | CSIRT / competent authority | https://www.nis-2-directive.com/NIS_2_Directive_Article_23.html |
| **NIS2 — final report** | Same | **1 month** after the notification | Submission of incident notification | CSIRT / competent authority | https://www.nis-2-directive.com/NIS_2_Directive_Article_23.html |
| **SEC Form 8-K Item 1.05** | US public registrant; cybersecurity incident determined **material** | **4 business days** | Date of **materiality determination** (made "without unreasonable delay") | SEC via EDGAR (public filing); FPIs use Form 6-K. Delay allowed on US AG written notice (national security/public safety): +30, +30, +60 days | https://www.sec.gov/resources-small-businesses/small-business-compliance-guides/cybersecurity-risk-management-strategy-governance-incident-disclosure |
| **HIPAA — individual notice** | Covered entity/BA; breach of **unsecured PHI** (45 CFR 164.400–414) | **≤ 60 calendar days** | **Discovery** of breach | Affected individuals | https://www.hhs.gov/hipaa/for-professionals/breach-notification/index.html |
| **HIPAA — media notice** | Breach affecting **≥ 500** residents of a state/jurisdiction | Without unreasonable delay, **≤ 60 days** | Discovery | Prominent media outlets serving that state/jurisdiction | https://www.hhs.gov/hipaa/for-professionals/breach-notification/breach-notification-requirements/index.html |
| **HIPAA — HHS Secretary** | ≥ 500: contemporaneous; < 500: annual log | ≥500: **≤ 60 days**; <500: within **60 days after end of calendar year** | Discovery | HHS Secretary (OCR breach portal) | https://www.hhs.gov/hipaa/for-professionals/breach-notification/breach-reporting/index.html |
| **CIRCIA (covered cyber incident)** — *advisory, not yet in force* | Covered entity in a critical-infrastructure sector; covered cyber incident (per NPRM) | **72 hours** | Reasonable belief incident occurred | CISA | https://www.federalregister.gov/documents/2024/04/04/2024-06526/cyber-incident-reporting-for-critical-infrastructure-act-circia-reporting-requirements |
| **CIRCIA (ransom payment)** — *advisory, not yet in force* | Covered entity makes a ransom payment | **24 hours** | Ransom payment made | CISA | https://www.cisa.gov/topics/cyber-threats-and-advisories/information-sharing/cyber-incident-reporting-critical-infrastructure-act-2022-circia |
| **US State — California (reference)** | Breach of personal information of California residents (Civ. Code 1798.82, as amended by SB 446) | **30 calendar days** to residents; AG within **15 days** after individual notice if **> 500** residents | Discovery of breach | Affected residents; California AG (>500) | https://codes.findlaw.com/ca/civil-code/civ-sect-1798-82/ |
| **PCI DSS** | Entity stores/processes/transmits cardholder data; suspected/confirmed CHD compromise (Req 12.10) | "Promptly" per card-brand programs; engage a **PFI** | Detection of suspected compromise | Acquiring bank + card brands (Visa/Mastercard/etc.) | https://blog.pcisecuritystandards.org/updated-guidance-responding-to-a-data-breach |

**Framework alignment (non-deadline, for lifecycle/severity grounding):**

| Standard | Use in subsystem | Citation |
|---|---|---|
| NIST SP 800-61r2 (2012) | 4-phase lifecycle (Preparation; Detection & Analysis; Containment/Eradication/Recovery; Post-Incident); functional/informational impact + recoverability prioritization | https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-61r2.pdf |
| NIST SP 800-61r3 (April 2025) | Reframes IR around CSF 2.0 Functions (Govern, Identify, Protect, Detect, Respond, Recover); severity/priority guidance | https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-61r3.pdf |
| ISO/IEC 27035 (-1/-2/-3) | 5-stage process: Plan & prepare; Detection & reporting; Assessment & decision; Responses; Lessons learned | https://www.iso.org/standard/78973.html |

---

## 7. Assumptions & Risks

### 7.1 Assumptions
- The operator supplies accurate incident facts; garbage-in yields garbage-out. The tool computes clocks from *stated* facts and *human* determinations (materiality, high-risk).
- Organizational context (issuer status, covered-entity status, EU establishment, sector, CHD processing) is configured correctly.
- The holiday calendar for business-day math is supplied per jurisdiction; a default US federal calendar ships but is not authoritative for every filer.
- Regulation rule packs are kept current by maintainers; the tool cannot detect regulatory change on its own (no network).

### 7.2 Risks & mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| Regulatory text changes (e.g., CIRCIA finalization, state-law amendments like CA SB 446) | Stale deadlines | Data-driven rule packs with `retrievedDate`; `advisory`/`ruleStatus` flags; periodic re-verification workflow |
| Over-reliance on tool output as legal advice | Compliance failure / liability | Prominent, non-suppressible disclaimers; mandatory review gates on notifications |
| Misconfigured org context | Wrong regulations triggered | Explicit context prompts; applicability explanations per obligation; test vectors |
| Business-day/DST/timezone errors | Wrong due-dates | UTC-internal storage; injected clock + holiday calendar; boundary test vectors (weekends, holidays, DST, leap day) |
| "Awareness" vs "discovery" vs "determination" confusion | Clock starts at wrong event | Distinct, explicitly named start-event fields per regulation; documented mapping |
| Determinism regressions via `Date.now()` creeping in | Non-reproducible evidence | Lint rule + tests forbidding ambient clock in the module |

---

## 8. Disclaimer (restated)
PolicyForge Incident Reporting is deterministic engineering software distributed under Apache-2.0 with no warranty. Its outputs are computational aids, **not legal advice**, and must be reviewed and approved by qualified legal counsel and the DPO before any external reliance or transmission. Regulatory obligations are fact-, sector-, and jurisdiction-specific and change over time; some referenced rules (notably CIRCIA) are not yet in force.
