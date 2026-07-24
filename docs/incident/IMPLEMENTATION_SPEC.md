# PolicyForge Incident Reporting — Implementation Specification

| Field | Value |
|---|---|
| Document | Implementation Specification |
| Subsystem | Incident Reporting |
| Target release | PolicyForge v0.2.0 |
| Primary module | `packages/core/src/incident/incident.js` |
| Runtime | Node.js LTS (ESM), zero native deps |
| License | Apache-2.0 |
| Date | 2026-07-24 |

> **NOT LEGAL ADVICE.** All deadlines, triggers, and notification drafts are software-computed estimates for engineering purposes and must be reviewed by qualified counsel. See the FRD disclaimer. Regulation data (esp. CIRCIA) may be pending or change; treat rule packs as versioned data, not fixed truth.

---

## 1. Architecture Overview

### 1.1 Placement in `packages/core`
The subsystem is a cohesive module tree inside the existing core package, reusing PolicyForge's emitter and citation infrastructure:

```
packages/core/src/incident/
  incident.js               # Public API surface (barrel): createIncident, classify, computeDeadlines, ...
  intake.js                 # Input validation, normalization, enum enforcement
  classify.js               # Deterministic SEV1–SEV4 decision table
  deadlines/
    index.js                # computeDeadlines() orchestrator
    clock.js                # calendar + business-day arithmetic (injected now + holidays)
    rules/                  # one data-driven rule pack per regulation
      gdpr.js               # Art 33 / Art 34
      nis2.js               # Art 23 staged
      sec.js                # Item 1.05 (business days + delay provisions)
      hipaa.js              # 45 CFR 164.400-414 (individual/media/HHS)
      circia.js             # advisory (not-in-force)
      us-state.js           # jurisdiction map; California reference implementation
      pci-dss.js            # card-brand notification (promptly)
  record.js                 # Incident record model + JSON Schema (schemaVersion)
  timeline.js               # Append-only audit log
  report.js                 # Markdown report generator
  notifications/
    index.js                # draft orchestrator + review-gate
    templates/              # per-regulator Markdown templates (i18n-keyed)
  emit/
    ocsf.js                 # OCSF event mapping (reuses core OCSF emitter)
    sarif.js                # SARIF 2.1.0 export
    ndjson.js               # SIEM NDJSON export
  dashboard/
    render.js               # self-contained offline HTML
  i18n/
    en.js                   # message catalog (default)
  citations.js              # canonical citation registry
```

CLI lives with the existing command surface:

```
packages/cli/src/commands/incident.js   # `policyforge incident ...`
```

### 1.2 Data flow
```
intake (CLI | JSON | API)
   → normalize + validate (intake.js)
   → classify severity (classify.js)                → severity + rationale + citations
   → computeDeadlines(record, {now, holidays})      → deadline[] (per regulation/stage)
   → build incident record (record.js)              → versioned JSON
   → timeline.append(events)                        → append-only audit log
   → report.render / notifications.draft            → Markdown artifacts
   → emit.ocsf / emit.sarif / emit.ndjson           → integration outputs
   → dashboard.render                               → offline HTML
```

All time-dependent steps receive an injected `now` (epoch ms or ISO string) and an injected `holidays` calendar. The module exports pure functions; side effects (file writes) live only in CLI/emit layers.

### 1.3 Public API (signatures)
```js
// incident.js (ESM)
export function createIncident(input, opts = {}) {}
// input: IntakeInput; opts: { now: number|string, holidays?: HolidayCalendar,
//         orgContext?: OrgContext, locale?: string }
// returns: IncidentRecord (validated, classified, with deadlines + timeline seed)

export function classifySeverity(signals, opts = {}) {}
// signals: ClassificationSignals; returns { severity, severityRationale[], citations[] }

export function computeDeadlines(record, opts = {}) {}
// returns Deadline[]

export function appendTimeline(record, event, opts = {}) {} // returns new IncidentRecord (immutable)

export function renderReport(record, opts = {}) {}      // returns markdown string
export function draftNotifications(record, opts = {}) {} // returns NotificationDraft[]
export function renderDashboard(records, opts = {}) {}   // returns html string
export function toOcsf(record, opts = {}) {}             // returns OCSF event object
export function toSarif(record, opts = {}) {}            // returns SARIF log object
export function toNdjson(records) {}                     // returns string
```
No function reads ambient time; `opts.now` is required by any function that needs it, and helpers throw if it is absent when required.

### 1.4 CLI surface
```
policyforge incident create   --input incident.json [--now <iso>] [--holidays <cal.json>] --out record.json
policyforge incident classify --input incident.json [--now <iso>]
policyforge incident deadlines --record record.json --now <iso> [--holidays <cal.json>]
policyforge incident report   --record record.json --out report.md
policyforge incident notify   --record record.json [--reg gdpr|nis2|sec|hipaa|circia|ca|pci] --out drafts/
policyforge incident timeline --record record.json add --type <type> --actor <name> [--note <text>] --now <iso>
policyforge incident dashboard --records "incidents/*.json" --ref-time <iso> --out dashboard.html
policyforge incident emit     --record record.json --format ocsf|sarif|ndjson --out out.json
```
`--now` / `--ref-time` are explicit for determinism; if omitted, the CLI reads a fixed value from config or fails in `--strict` mode rather than calling the system clock.

---

## 2. Incident Record — Data Model & JSON Schema

### 2.1 Enums (canonical)
```js
export const Severity   = ['SEV1', 'SEV2', 'SEV3', 'SEV4'];
export const Status      = ['TRIAGE','INVESTIGATING','CONTAINED','ERADICATED',
                            'RECOVERED','CLOSED','REOPENED'];
export const DataClass  = ['PII','PHI','PCI_CHD','CREDENTIALS','FINANCIAL',
                            'SPECIAL_CATEGORY','IP_CONFIDENTIAL','GOV_CLASSIFIED',
                            'BIOMETRIC','CHILDREN','NONE'];
export const Regulation = ['GDPR_ART33','GDPR_ART34','NIS2_EARLY','NIS2_NOTIFY',
                            'NIS2_FINAL','SEC_8K_105','HIPAA_INDIVIDUAL','HIPAA_MEDIA',
                            'HIPAA_HHS','CIRCIA_INCIDENT','CIRCIA_RANSOM',
                            'US_STATE_CA','PCI_DSS'];
export const DeadlineStatus = ['PENDING_TRIGGER','OPEN','DUE_SOON','OVERDUE',
                               'SUBMITTED','ADVISORY','NOT_APPLICABLE'];
export const ClockBasis = ['CALENDAR_HOURS','CALENDAR_DAYS','BUSINESS_DAYS',
                           'WITHOUT_UNDUE_DELAY','PROMPT'];
export const StartEvent = ['AWARENESS','DISCOVERY','MATERIALITY_DETERMINATION',
                           'RANSOM_PAYMENT','REASONABLE_BELIEF','NOTIFICATION_SUBMITTED'];
export const ReviewState = ['DRAFT','IN_REVIEW','APPROVED','REJECTED'];
export const TimelineType = ['DETECTED','AWARE','DISCOVERED','CLASSIFIED',
                             'DETERMINATION_MADE','DEADLINE_COMPUTED','DRAFT_CREATED',
                             'DRAFT_APPROVED','STATUS_CHANGED','SEVERITY_OVERRIDE',
                             'DELAY_AUTHORIZED','NOTE'];
```

### 2.2 Incident record schema (fields & types)
```jsonc
{
  "schemaVersion": "1.0.0",
  "id": "string (deterministic: hash of canonical intake or supplied)",
  "title": "string",
  "description": "string",
  "status": "Status enum",
  "severity": "Severity enum",
  "severityRationale": ["string"],
  "timestamps": {
    "detectedAt":  "ISO-8601 UTC | null",
    "awareAt":     "ISO-8601 UTC | null",   // GDPR/NIS2 'becoming aware'
    "discoveredAt":"ISO-8601 UTC | null",   // HIPAA/state 'discovery'
    "determinedMaterialAt": "ISO-8601 UTC | null", // SEC start event
    "ransomPaidAt":"ISO-8601 UTC | null",   // CIRCIA ransom
    "createdAt":   "ISO-8601 UTC (from opts.now)"
  },
  "signals": {
    "dataClasses": ["DataClass enum"],
    "recordCount": "integer | null",
    "affectedSystems": [{ "name": "string", "criticality": "LOW|MEDIUM|HIGH|CRITICAL" }],
    "confirmedExfiltration": "boolean | null",
    "confidentiality": "boolean", "integrity": "boolean", "availability": "boolean"
  },
  "orgContext": {
    "isSecRegistrant": "boolean",
    "isForeignPrivateIssuer": "boolean",
    "hipaaRole": "NONE|COVERED_ENTITY|BUSINESS_ASSOCIATE",
    "gdprApplies": "boolean",
    "nis2Entity": "NONE|IMPORTANT|ESSENTIAL|TRUST_SERVICE",
    "criticalInfraSector": "string | null",
    "processesCardholderData": "boolean",
    "jurisdictions": ["ISO-3166 / US-state codes, e.g. 'US-CA', 'EU-DE'"]
  },
  "humanDeterminations": {
    "materiality": "UNDETERMINED|MATERIAL|NOT_MATERIAL",
    "gdprRisk": "UNDETERMINED|NO_RISK|RISK|HIGH_RISK",
    "hipaaIsBreach": "UNDETERMINED|BREACH|NOT_BREACH|LOW_PROBABILITY"
  },
  "deadlines": [ /* Deadline objects, see §4 */ ],
  "delays": [ { "regulation": "Regulation", "authority": "string",
               "grantedAt": "ISO-8601 UTC", "days": "integer", "reason": "string" } ],
  "notifications": [ /* NotificationDraft, see §5 */ ],
  "timeline": [ /* TimelineEvent, see §6 */ ],
  "citations": [ { "regulation": "Regulation|Framework", "ref": "string",
                   "url": "string", "retrievedDate": "YYYY-MM-DD" } ]
}
```

### 2.3 Deadline object
```jsonc
{
  "regulation": "Regulation enum",
  "label": "string (e.g. 'GDPR Art 33 – Supervisory authority notification')",
  "stage": "string | null (e.g. 'early-warning','notification','final')",
  "clockBasis": "ClockBasis enum",
  "amount": "number | null",          // e.g. 72, 4, 60, 30
  "unit": "'hours'|'days'|null",
  "startEvent": "StartEvent enum",
  "startAt": "ISO-8601 UTC | null",   // resolved start timestamp or null if pending
  "dueAt": "ISO-8601 UTC | null",     // computed; null when PENDING_TRIGGER or narrative
  "status": "DeadlineStatus enum",
  "advisory": "boolean",              // true for not-in-force (CIRCIA)
  "ruleStatus": "string | null",      // e.g. 'NPRM; final rule pending (~May 2026)'
  "whoToNotify": ["string"],
  "citation": { "ref": "string", "url": "string", "retrievedDate": "YYYY-MM-DD" },
  "notes": "string | null"
}
```

---

## 3. Severity Classification Algorithm

### 3.1 Model
Severity is derived deterministically from four normalized sub-scores, then mapped by a decision table. No weighting randomness; ties resolve to the **more severe** level. Grounded in NIST SP 800-61 prioritization (functional impact, information impact, recoverability) and ISO/IEC 27035 assessment.

### 3.2 Sub-score derivation (pure functions)
```js
// dataSensitivity: highest-sensitivity class present
function dataSensitivityScore(dataClasses) {
  const rank = { GOV_CLASSIFIED:4, SPECIAL_CATEGORY:4, PHI:3, PCI_CHD:3, BIOMETRIC:3,
                 CHILDREN:3, CREDENTIALS:3, FINANCIAL:2, PII:2, IP_CONFIDENTIAL:2, NONE:0 };
  return Math.max(0, ...dataClasses.map(c => rank[c] ?? 0)); // 0..4
}

// volumeBand from record count
function volumeScore(n) {
  if (n == null) return 1;            // unknown → conservative low-moderate
  if (n >= 100000) return 4;
  if (n >= 500)    return 3;          // aligns with HIPAA/state ≥500 escalation
  if (n >= 100)    return 2;
  if (n >= 1)      return 1;
  return 0;
}

// systemsCriticality: max criticality of affected systems
function systemsScore(systems) {
  const rank = { CRITICAL:4, HIGH:3, MEDIUM:2, LOW:1 };
  return Math.max(0, ...systems.map(s => rank[s.criticality] ?? 0));
}

// regulatoryScope: breadth of triggered regimes / cross-border
function regulatoryScore(orgContext) {
  let s = 0;
  if (orgContext.gdprApplies) s += 1;
  if (orgContext.nis2Entity !== 'NONE') s += 1;
  if (orgContext.isSecRegistrant) s += 1;
  if (orgContext.hipaaRole !== 'NONE') s += 1;
  if (orgContext.processesCardholderData) s += 1;
  if ((orgContext.jurisdictions || []).length > 1) s += 1;
  return Math.min(4, s);             // 0..4
}
```

### 3.3 Decision table (inputs → SEV)
Let `D`=dataSensitivity, `V`=volume, `S`=systems, `R`=regulatory, `X`=confirmedExfiltration (bool).

| Rule (evaluated top-down; first match wins) | Result | Rationale citation |
|---|---|---|
| `X == true` AND `D >= 3` (regulated-sensitive data confirmed exfiltrated) | **SEV1** | NIST 800-61 info impact = breach of proprietary/regulated info; ISO 27035 high impact |
| `S == 4` (a CRITICAL system down/compromised) AND (`X==true` OR `D>=3`) | **SEV1** | NIST 800-61 functional impact = critical |
| `D >= 3` AND `V >= 3` (sensitive data, ≥500 records) | **SEV2** | HIPAA/state ≥500 escalation; NIST info impact |
| `X == true` AND `D == 2` (ordinary PII/financial exfiltrated) | **SEV2** | Confirmed loss of confidentiality |
| `S >= 3` (HIGH/CRITICAL system affected) AND `R >= 2` | **SEV2** | Functional impact + multi-regime exposure |
| `D >= 2` OR `V >= 2` OR `S >= 2` OR `R >= 2` | **SEV3** | Moderate impact; regulated data or notable systems in scope |
| otherwise (`D<=1` AND `V<=1` AND `S<=1` AND `R<=1`, `X` not true) | **SEV4** | Low functional/information impact |

Escalation guard (FR-2003): if a prior record had a higher severity, retain it unless an explicit `override:{actor,reason}` is present; log `SEVERITY_OVERRIDE`.

### 3.4 Output
```js
{
  severity: 'SEV2',
  severityRationale: [
    'dataSensitivity=3 (PHI); volume=3 (recordCount 900 ≥ 500) → matched rule "sensitive data, ≥500 records"',
    'Prioritization basis: NIST SP 800-61 information impact + recoverability'
  ],
  citations: [
    { regulation:'NIST_800_61', ref:'SP 800-61r2 §3.2.6 / r3 Detect–Respond',
      url:'https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-61r3.pdf',
      retrievedDate:'2026-07-24' },
    { regulation:'ISO_27035', ref:'27035-1 Assessment & decision',
      url:'https://www.iso.org/standard/78973.html', retrievedDate:'2026-07-24' }
  ]
}
```

---

## 4. Regulatory Deadline Algorithm

### 4.1 Structure
Each regulation rule pack exports `{ id, applies(record), buildDeadlines(record, ctx) }`. `computeDeadlines` iterates packs, calling `applies` (trigger predicate) then `buildDeadlines`, which uses `clock.js` for all arithmetic. **All time inputs are injected** — `ctx = { now, holidays }`; no rule calls `Date.now()`.

### 4.2 Clock utilities (`clock.js`)
```js
export function addCalendarHours(startISO, hours) { /* UTC add, DST-safe via epoch ms */ }
export function addCalendarDays(startISO, days)   { /* add days on UTC epoch */ }
export function addBusinessDays(startISO, n, holidays) {
  // advance n business days: skip Sat/Sun and any date in `holidays` (Set of 'YYYY-MM-DD' UTC)
  // returns end-of-that-business-day or same time-of-day per policy (documented, tested)
}
export function isBusinessDay(dateISO, holidays) { /* not weekend, not holiday */ }
export function statusFor(dueAt, now, warnWindowH = 24) {
  if (dueAt == null) return 'PENDING_TRIGGER';
  if (now > dueAt) return 'OVERDUE';
  if (msBetween(now, dueAt) <= warnWindowH*3600e3) return 'DUE_SOON';
  return 'OPEN';
}
```
`holidays` is injected data (default `us-federal` calendar shipped as JSON); business-day math is jurisdiction-parameterized.

### 4.3 Per-regulation predicates & clock math

**GDPR (`gdpr.js`)**
```js
applies: r => r.orgContext.gdprApplies &&
              r.signals.dataClasses.some(c => c!=='NONE');
buildDeadlines: (r, ctx) => {
  const out = [];
  // Art 33 – SA notification, 72 calendar hours from awareness, unless 'no risk'
  if (r.humanDeterminations.gdprRisk !== 'NO_RISK') {
    const startAt = r.timestamps.awareAt;
    out.push(mk('GDPR_ART33','GDPR Art 33 – Supervisory authority', null,
      'CALENDAR_HOURS', 72, 'hours', 'AWARENESS', startAt,
      startAt ? addCalendarHours(startAt,72) : null,
      ['Lead/competent supervisory authority'],
      cite('Art 33','https://gdpr-info.eu/art-33-gdpr/')));
  }
  // Art 34 – data subjects, 'without undue delay', only if HIGH_RISK affirmed
  if (r.humanDeterminations.gdprRisk === 'HIGH_RISK') {
    out.push(mkNarrative('GDPR_ART34','GDPR Art 34 – Affected data subjects',
      'WITHOUT_UNDUE_DELAY','AWARENESS', r.timestamps.awareAt,
      ['Affected data subjects'], cite('Art 34','https://gdpr-info.eu/art-34-gdpr/')));
  }
  return out;
}
```
Note: `awareAt` is the GDPR "becoming aware" event; if null → `PENDING_TRIGGER`.

**NIS2 (`nis2.js`)** — three staged deadlines from `awareAt`; trust-service providers use 24h for notification.
```js
applies: r => r.orgContext.nis2Entity !== 'NONE';
buildDeadlines: (r) => {
  const t = r.timestamps.awareAt;
  const notifyHours = r.orgContext.nis2Entity === 'TRUST_SERVICE' ? 24 : 72;
  return [
    mk('NIS2_EARLY','NIS2 Art 23 – Early warning','early-warning',
       'CALENDAR_HOURS',24,'hours','AWARENESS',t, t&&addCalendarHours(t,24),
       ['CSIRT / competent authority'], citeNis2()),
    mk('NIS2_NOTIFY','NIS2 Art 23 – Incident notification','notification',
       'CALENDAR_HOURS',notifyHours,'hours','AWARENESS',t, t&&addCalendarHours(t,notifyHours),
       ['CSIRT / competent authority'], citeNis2()),
    // Final report: 1 month AFTER notification submission (dep on NIS2_NOTIFY.dueAt or submitted event)
    mkFinal('NIS2_FINAL','NIS2 Art 23 – Final report','final','NOTIFICATION_SUBMITTED',
       ['CSIRT / competent authority'], citeNis2())
  ];
}
// NIS2_FINAL.dueAt = addCalendarMonths(notificationSubmittedAt ?? NIS2_NOTIFY.dueAt, 1)
```

**SEC (`sec.js`)** — business days from the materiality determination; delay provisions.
```js
applies: r => r.orgContext.isSecRegistrant;
buildDeadlines: (r, ctx) => {
  if (r.humanDeterminations.materiality !== 'MATERIAL')
    return [ pending('SEC_8K_105','SEC Form 8-K Item 1.05',
             'BUSINESS_DAYS',4,'days','MATERIALITY_DETERMINATION',
             ['SEC (EDGAR); FPI → Form 6-K'], citeSec()) ];   // PENDING_TRIGGER
  let due = addBusinessDays(r.timestamps.determinedMaterialAt, 4, ctx.holidays);
  // apply any AG national-security/public-safety delay (30/30/60), additive to due date
  for (const d of r.delays.filter(x=>x.regulation==='SEC_8K_105'))
    due = addCalendarDays(due, d.days);
  return [ mk('SEC_8K_105','SEC Form 8-K Item 1.05', null,
     'BUSINESS_DAYS',4,'days','MATERIALITY_DETERMINATION',
     r.timestamps.determinedMaterialAt, due,
     ['SEC (EDGAR); FPI → Form 6-K'], citeSec()) ];
}
```
Delay semantics documented: US Attorney General written notification may permit up to 30 days, an additional 30, and in extraordinary circumstances an additional 60 (represented as one or more `delays[]` entries).

**HIPAA (`hipaa.js`)** — calendar days from discovery; media + HHS thresholds.
```js
applies: r => r.orgContext.hipaaRole !== 'NONE' &&
              r.signals.dataClasses.includes('PHI') &&
              r.humanDeterminations.hipaaIsBreach !== 'NOT_BREACH';
buildDeadlines: (r) => {
  const t = r.timestamps.discoveredAt;
  const big = (r.signals.recordCount ?? 0) >= 500;
  const out = [
    mk('HIPAA_INDIVIDUAL','HIPAA – Individual notice', null,
       'CALENDAR_DAYS',60,'days','DISCOVERY',t, t&&addCalendarDays(t,60),
       ['Affected individuals'], citeHipaa())
  ];
  if (big) {
    out.push(mk('HIPAA_MEDIA','HIPAA – Prominent media (≥500)', null,
       'CALENDAR_DAYS',60,'days','DISCOVERY',t, t&&addCalendarDays(t,60),
       ['Prominent media outlets in affected state/jurisdiction'], citeHipaa()));
    out.push(mk('HIPAA_HHS','HIPAA – HHS Secretary (≥500, contemporaneous)', null,
       'CALENDAR_DAYS',60,'days','DISCOVERY',t, t&&addCalendarDays(t,60),
       ['HHS Secretary (OCR portal)'], citeHipaa()));
  } else {
    // <500: annual log; Secretary within 60 days after end of calendar year
    out.push(mkAnnual('HIPAA_HHS','HIPAA – HHS Secretary (<500, annual)', t, citeHipaa()));
  }
  return out;
}
```

**CIRCIA (`circia.js`)** — advisory (not in force); still computed and flagged.
```js
applies: r => r.orgContext.criticalInfraSector != null;
buildDeadlines: (r) => {
  const inc = mk('CIRCIA_INCIDENT','CIRCIA – Covered cyber incident (advisory)', null,
     'CALENDAR_HOURS',72,'hours','REASONABLE_BELIEF', r.timestamps.awareAt,
     r.timestamps.awareAt && addCalendarHours(r.timestamps.awareAt,72),
     ['CISA'], citeCircia());
  inc.advisory = true; inc.ruleStatus = 'NPRM (Apr 2024); final rule pending (~May 2026 projection)';
  inc.status = 'ADVISORY';
  const out = [inc];
  if (r.timestamps.ransomPaidAt) {
    const ran = mk('CIRCIA_RANSOM','CIRCIA – Ransom payment (advisory)', null,
       'CALENDAR_HOURS',24,'hours','RANSOM_PAYMENT', r.timestamps.ransomPaidAt,
       addCalendarHours(r.timestamps.ransomPaidAt,24), ['CISA'], citeCircia());
    ran.advisory = true; ran.ruleStatus = inc.ruleStatus; ran.status = 'ADVISORY';
    out.push(ran);
  }
  return out;
}
```

**US State — California reference (`us-state.js`)**
```js
applies: r => (r.orgContext.jurisdictions||[]).includes('US-CA') &&
              r.signals.dataClasses.some(c => ['PII','FINANCIAL','CREDENTIALS','PHI'].includes(c));
buildDeadlines: (r) => {
  const t = r.timestamps.discoveredAt;
  const out = [ mk('US_STATE_CA','California Civ. Code 1798.82 – Resident notice', null,
     'CALENDAR_DAYS',30,'days','DISCOVERY',t, t&&addCalendarDays(t,30),
     ['Affected California residents'], citeCa()) ];
  if ((r.signals.recordCount ?? 0) > 500) {
    // AG within 15 days AFTER individual notice; modeled off the individual due date
    const agStart = t && addCalendarDays(t,30);
    out.push(mk('US_STATE_CA','California – Attorney General (>500)', 'ag',
      'CALENDAR_DAYS',15,'days','NOTIFICATION_SUBMITTED', agStart,
      agStart && addCalendarDays(agStart,15), ['California Attorney General'], citeCa()));
  }
  return out;
}
```
(Note: SB 446, effective 2026-01-01, replaces the prior "without unreasonable delay" standard with a hard 30-day clock; `retrievedDate` and `ruleStatus` capture this.)

**PCI DSS (`pci-dss.js`)** — narrative "promptly"; no statutory hour clock.
```js
applies: r => r.orgContext.processesCardholderData &&
              (r.signals.dataClasses.includes('PCI_CHD') || r.signals.confirmedExfiltration);
buildDeadlines: (r) => [ mkNarrative('PCI_DSS','PCI DSS Req 12.10 – Card brand / acquirer',
   'PROMPT','DISCOVERY', r.timestamps.discoveredAt,
   ['Acquiring bank','Card brands (Visa/Mastercard/etc.)','Engage a PFI'], citePci()) ];
```

### 4.4 Pending-trigger & narrative handling
- If `startAt` is null → `status='PENDING_TRIGGER'`, `dueAt=null`.
- `WITHOUT_UNDUE_DELAY` / `PROMPT` → narrative deadline: `dueAt=null`, `status='OPEN'`, with `notes` describing the standard; never fabricates a numeric due-date.
- Advisory (CIRCIA) → `status='ADVISORY'`, excluded from overdue alerts unless `--include-advisory`.

---

## 5. Notification-Draft Templates

Templates are i18n-keyed Markdown with `{{placeholders}}` filled from the record; unknown facts render as `**[TO BE COMPLETED: field]**`. Every draft prepends the review banner and sets `reviewState='DRAFT'`.

### 5.1 Draft object
```jsonc
{
  "regulation": "Regulation enum",
  "recipientCategory": ["string"],
  "reviewState": "ReviewState enum",
  "approvedBy": "string | null",
  "approvedAt": "ISO-8601 UTC | null",
  "subject": "string",
  "body": "markdown string",
  "citation": { "ref":"string","url":"string","retrievedDate":"YYYY-MM-DD" }
}
```

### 5.2 GDPR Art 33 template (excerpt)
```
> DRAFT — LEGAL/DPO REVIEW REQUIRED. NOT LEGAL ADVICE. Do not transmit until approved.

Subject: Personal Data Breach Notification — {{title}} (Art. 33 GDPR)

1. Nature of the breach: {{description}}
2. Categories & approximate number of data subjects: {{dataSubjectCategories}} / ~{{recordCount}}
3. Categories & approximate number of personal-data records: {{dataClasses}} / ~{{recordCount}}
4. Name & contact of the DPO / contact point: **[TO BE COMPLETED]**
5. Likely consequences of the breach: **[TO BE COMPLETED]**
6. Measures taken or proposed: {{containmentSummary}}
7. Date/time of awareness: {{awareAt}}   |   Notification due (72h): {{gdprArt33DueAt}}

Citation: GDPR Art. 33 — https://gdpr-info.eu/art-33-gdpr/ (retrieved {{retrievedDate}})
```
Analogous templates ship for: **NIS2** early-warning/notification/final (CSIRT), **SEC** Item 1.05 8-K narrative, **HIPAA** individual/media/HHS, **California** resident + AG, **PCI DSS** acquirer/brand, and **GDPR Art 34** data-subject notice (withheld unless `HIGH_RISK` affirmed).

---

## 6. Timeline / Audit-Log Model

### 6.1 Event object
```jsonc
{
  "id": "string (deterministic: hash(prevId + type + payload + seq))",
  "seq": "integer (monotonic, injected/derived, not wall-clock)",
  "at": "ISO-8601 UTC (from opts.now at append time)",
  "type": "TimelineType enum",
  "actor": "string",
  "payload": { /* type-specific */ },
  "refId": "string | null"   // for corrections referencing a prior entry
}
```

### 6.2 Invariants
- **Append-only**: `appendTimeline` returns a new record; existing entries are never mutated (frozen objects). Corrections add a new entry with `refId`.
- **Deterministic IDs/order**: `seq` and content-hash IDs make a scripted incident reproduce identically (NFR-1, FR-5002).
- **Auto-events**: creation seeds `DETECTED/AWARE/DISCOVERED` (from timestamps), `CLASSIFIED`, and one `DEADLINE_COMPUTED` per deadline. Status changes, overrides, and delay authorizations append events.
- **Export**: JSON (schema-validated) and Markdown table (`renderReport` embeds it).

---

## 7. Dashboard Specification

`renderDashboard(records, { refTime, warnWindowH, includeAdvisory, locale })` → self-contained HTML string (inline CSS/JS, no external fetch; NFR-2).

**Panels**
1. **Portfolio summary** — open-incident count; severity mix (SEV1–SEV4 bar); status breakdown donut (computed, no live clock).
2. **Deadline board** — one row per (incident × deadline): incident title, regulation label + stage, citation link, `dueAt`, and **time-remaining** computed against `refTime` (injected, FR-6002). Sorted by soonest due; `PENDING_TRIGGER` and narrative rows grouped separately.
3. **Flags** — `OVERDUE` red, `DUE_SOON` amber, `ADVISORY` (CIRCIA) distinct/neutral and excluded from overdue counts unless `includeAdvisory`.
4. **Per-incident drill-down** — severity rationale, timeline, notification review states.

Determinism: countdowns use the embedded `refTime` constant or `?ref=<iso>` query param; the renderer never bakes `Date.now()` into output, so snapshots are testable.

---

## 8. Integration Points

**8.1 OCSF (`emit/ocsf.js`).** Map incident → OCSF *Security Finding* / *Incident Finding* class: `severity` → OCSF `severity_id` (SEV1→Critical … SEV4→Low), `status` → OCSF `status_id`, timestamps → `time`/`start_time`, data classes/systems → `resources`/`observables`, deadlines → `enrichments`/`unmapped`. Reuses the existing core OCSF emitter and its schema validation (FR-7001).

**8.2 SARIF (`emit/sarif.js`).** Emit SARIF 2.1.0 `runs[].results[]` where implicated PolicyForge controls become `ruleId`s (reusing existing IR baseline rule IDs) and affected systems map to `locations`. Enables incidents to flow through the same pipeline consumers as review/drift SARIF (FR-7002).

**8.3 SIEM NDJSON (`emit/ndjson.js`).** One JSON object per line for record and each emitted event (FR-7003).

**8.4 Review/drift attach.** Review and drift outputs accept an `incidentRef`; conversely a record can carry `relatedFindings[]` linking to the policy/control context, so an incident is traceable to the baseline rules that governed it (FR-7004).

---

## 9. Test Strategy

- **Golden vectors per regulation** (`test/incident/vectors/*.json`): input + injected `now` + holidays → expected deadlines. Include **boundary cases**: Fri/Sat/Sun starts, holiday-adjacent business-day math (SEC), DST transitions, leap day (Feb 29), month-end + 1-month (NIS2 final), year-end (HIPAA <500 annual).
- **Determinism tests**: run each vector twice; assert deep-equal outputs and identical timeline IDs/hashes. Lint/AST test forbids `Date.now()`/`new Date()`-without-arg inside `src/incident/**`.
- **Classification coverage**: table-driven test hitting every decision-table row incl. tie-to-more-severe and escalation-guard/override.
- **Applicability matrix**: cross-product of org-context flags asserting correct regulation set (e.g., EU healthcare vs US issuer vs card processor).
- **Pending-trigger transitions**: SEC before/after materiality; GDPR before/after `awareAt`.
- **Delay provisions**: SEC AG 30/30/60 shifts only SEC; others unchanged.
- **Advisory handling**: CIRCIA never counts as overdue by default.
- **Schema validation**: record, deadline, timeline, notification, OCSF, SARIF outputs validate; unknown major `schemaVersion` rejected.
- **Snapshot tests**: report Markdown and dashboard HTML with fixed `refTime`.
- **Citation integrity**: assert every emitted obligation carries a non-empty citation URL + `retrievedDate`.
- Coverage gate ≥90% on `incident.js` (NFR-7).

---

## 10. Phased Delivery Checklist

**Phase 0 — Foundations**
- [ ] Enums, `citations.js` registry, JSON Schemas (record/deadline/timeline/notification), `schemaVersion` 1.0.0.
- [ ] `clock.js` (calendar hours/days, business-days w/ injected holidays, months) + boundary tests.

**Phase 1 — Core computation**
- [ ] `intake.js` validation/normalization; `createIncident`.
- [ ] `classify.js` decision table + rationale/citations + tests.
- [ ] `deadlines/` orchestrator + GDPR, NIS2, SEC, HIPAA, US-CA, PCI, CIRCIA rule packs + golden vectors.
- [ ] Determinism lint rule; no-`Date.now` enforcement.

**Phase 2 — Records, timeline, reports**
- [ ] `record.js` assembly; `timeline.js` append-only + deterministic IDs.
- [ ] `report.js` Markdown generator.
- [ ] `notifications/` templates + review-gate + i18n catalog (`en`).

**Phase 3 — Surfaces & integration**
- [ ] CLI `policyforge incident` subcommands (create/classify/deadlines/report/notify/timeline/dashboard/emit).
- [ ] `emit/ocsf.js`, `emit/sarif.js`, `emit/ndjson.js`; review/drift `incidentRef`.
- [ ] `dashboard/render.js` offline HTML + snapshot tests.

**Phase 4 — Hardening & release**
- [ ] Coverage ≥90%; boundary/DST/holiday vectors green.
- [ ] Advisory/not-in-force flags (CIRCIA), delay-provision modeling verified.
- [ ] Docs + disclaimers wired into every artifact; rule-pack `retrievedDate` refresh procedure documented.
- [ ] Re-verify all citation URLs; tag v0.2.0.

---

> **Reminder:** every deadline, draft, and classification this module emits is a deterministic computation for engineering support only — **not legal advice**. Human legal/DPO review is a required gate before any external notification, and rule packs (especially CIRCIA and fast-moving US-state laws) must be kept current as versioned data.