/**
 * Incident Reporting — orchestrator
 * =================================
 * Builds a structured incident record, classifies severity, computes regulatory
 * deadlines, maintains a timeline, and renders a Markdown incident report and an
 * OCSF event. Deterministic: all "now" values are injected via opts.now.
 *
 * NOT LEGAL ADVICE. Deadlines and drafts are software-computed estimates from
 * public regulatory text; counsel/DPO must review before reliance.
 */

'use strict';

const crypto = require('crypto');
const { classifySeverity } = require('./classify');
const { computeDeadlines } = require('./regulations');
const clock = require('./clock');

const SCHEMA_VERSION = '1.0.0';

const DEFAULT_SIGNALS = {
  dataClasses: [], recordCount: null, affectedSystems: [],
  confirmedExfiltration: null, confidentiality: false, integrity: false, availability: false,
};
const DEFAULT_ORG = {
  isSecRegistrant: false, isForeignPrivateIssuer: false, hipaaRole: 'NONE',
  gdprApplies: false, nis2Entity: 'NONE', criticalInfraSector: null,
  processesCardholderData: false, jurisdictions: [],
};
const DEFAULT_DETERMINATIONS = {
  materiality: 'UNDETERMINED', gdprRisk: 'UNDETERMINED', hipaaIsBreach: 'UNDETERMINED',
};

function deterministicId(intake, now) {
  const canonical = JSON.stringify({
    title: intake.title || '', detectedAt: (intake.timestamps || {}).detectedAt || null, now: now || null,
  });
  return 'INC-' + crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 12);
}

/**
 * Create (or recompute) an incident record from intake data.
 * @param {object} intake partial incident (title, description, timestamps, signals, orgContext, humanDeterminations)
 * @param {object} opts { now (ISO, required for createdAt + deadline status), holidays, dueSoonHours, includeAdvisory, severityOverride }
 * @returns {object} full incident record
 */
function createIncident(intake = {}, opts = {}) {
  const now = opts.now || null;
  const timestamps = Object.assign(
    { detectedAt: null, awareAt: null, discoveredAt: null, determinedMaterialAt: null, ransomPaidAt: null },
    intake.timestamps || {},
    { createdAt: now }
  );
  const signals = Object.assign({}, DEFAULT_SIGNALS, intake.signals || {});
  const orgContext = Object.assign({}, DEFAULT_ORG, intake.orgContext || {});
  const humanDeterminations = Object.assign({}, DEFAULT_DETERMINATIONS, intake.humanDeterminations || {});

  const record = {
    schemaVersion: SCHEMA_VERSION,
    id: intake.id || deterministicId(intake, now),
    title: intake.title || 'Untitled incident',
    description: intake.description || '',
    status: intake.status || 'TRIAGE',
    severity: null, severityRationale: [],
    timestamps, signals, orgContext, humanDeterminations,
    deadlines: [], delays: intake.delays || [], notifications: [], timeline: intake.timeline || [],
    citations: [],
  };

  // Classify (allow explicit override)
  if (opts.severityOverride) {
    record.severity = opts.severityOverride;
    record.severityRationale = ['Manually overridden by responder.'];
  } else {
    const c = classifySeverity(record);
    record.severity = c.severity;
    record.severityRationale = [c.rationale];
    record.factors = c.factors;
  }

  // Deadlines
  record.deadlines = computeDeadlines(record, {
    now, holidays: opts.holidays || [], dueSoonHours: opts.dueSoonHours,
    includeAdvisory: opts.includeAdvisory,
  });

  // Roll citations up from deadlines (dedup by ref)
  const seen = new Set();
  for (const d of record.deadlines) {
    if (d.citation && !seen.has(d.citation.ref)) {
      seen.add(d.citation.ref);
      record.citations.push(Object.assign({ regulation: d.regulation }, d.citation));
    }
  }

  // Seed timeline
  const tl = record.timeline;
  if (timestamps.detectedAt) tl.push(mkEvent('DETECTED', timestamps.detectedAt, 'Incident detected'));
  if (now) tl.push(mkEvent('CLASSIFIED', now, `Classified ${record.severity}: ${record.severityRationale[0]}`));
  if (now) tl.push(mkEvent('DEADLINE_COMPUTED', now, `${record.deadlines.length} regulatory deadline(s) computed`));

  return record;
}

function mkEvent(type, at, note) { return { type, at, note }; }

/** Append a timeline event (returns a new record; does not mutate). */
function addTimelineEvent(record, type, at, note) {
  const copy = JSON.parse(JSON.stringify(record));
  copy.timeline.push(mkEvent(type, at, note));
  return copy;
}

/** Overall incident status vs. deadlines at a reference time. */
function deadlineBoard(record, refIso) {
  return record.deadlines
    .map(d => ({
      regulation: d.regulation, label: d.label, stage: d.stage,
      dueAt: d.dueAt, status: d.dueAt ? clock.deadlineStatus(d.dueAt, refIso, {}) : d.status,
      msRemaining: d.dueAt ? clock.msRemaining(d.dueAt, refIso) : null,
      advisory: d.advisory, whoToNotify: d.whoToNotify, citation: d.citation, notes: d.notes,
    }))
    .sort((a, b) => {
      if (a.msRemaining == null) return 1;
      if (b.msRemaining == null) return -1;
      return a.msRemaining - b.msRemaining;
    });
}

/** Render a Markdown incident report. */
function renderIncidentReport(record) {
  const L = [];
  L.push(`# Incident Report — ${record.title}`);
  L.push('');
  L.push(`> **NOT LEGAL ADVICE.** Deadlines are software-computed estimates from public regulatory text and must be reviewed by counsel and the DPO before reliance.`);
  L.push('');
  L.push(`- **ID:** ${record.id}`);
  L.push(`- **Severity:** ${record.severity} — ${record.severityRationale.join(' ')}`);
  L.push(`- **Status:** ${record.status}`);
  L.push(`- **Detected:** ${record.timestamps.detectedAt || '—'}`);
  L.push(`- **Aware:** ${record.timestamps.awareAt || '—'}`);
  L.push('');
  if (record.description) { L.push('## Description'); L.push(''); L.push(record.description); L.push(''); }

  L.push('## Signals');
  L.push('');
  L.push(`- Data classes: ${(record.signals.dataClasses || []).join(', ') || '—'}`);
  L.push(`- Record count: ${record.signals.recordCount ?? '—'}`);
  L.push(`- Confirmed exfiltration: ${record.signals.confirmedExfiltration === true ? 'yes' : record.signals.confirmedExfiltration === false ? 'no' : 'unknown'}`);
  const systems = (record.signals.affectedSystems || []).map(s => `${s.name} (${s.criticality})`).join(', ');
  L.push(`- Affected systems: ${systems || '—'}`);
  L.push('');

  L.push('## Regulatory reporting deadlines');
  L.push('');
  if (!record.deadlines.length) {
    L.push('_No regulatory reporting obligations matched the provided org context._');
  } else {
    L.push('| Regulation | Stage | Due | Clock | Notify | Citation |');
    L.push('|---|---|---|---|---|---|');
    for (const d of record.deadlines) {
      const clockDesc = d.amount ? `${d.amount} ${d.unit} (${d.clockBasis})` : d.clockBasis;
      const due = d.dueAt || (d.status === 'PENDING_TRIGGER' ? '_pending trigger_' : '_narrative_');
      const adv = d.advisory ? ' _(advisory)_' : '';
      L.push(`| ${d.label}${adv} | ${d.stage || '—'} | ${due} | ${clockDesc} | ${(d.whoToNotify || []).join('; ')} | [${d.citation.ref}](${d.citation.url}) |`);
    }
  }
  L.push('');

  L.push('## Timeline');
  L.push('');
  for (const e of record.timeline) L.push(`- \`${e.at || '—'}\` **${e.type}** — ${e.note}`);
  L.push('');

  L.push('## Citations');
  L.push('');
  for (const c of record.citations) L.push(`- ${c.regulation}: ${c.ref} — ${c.url} (retrieved ${c.retrievedDate})`);
  L.push('');
  return L.join('\n');
}

const OCSF_SEV = { SEV1: 5, SEV2: 4, SEV3: 3, SEV4: 2 };

/** Emit the incident as an OCSF Incident Finding (class_uid 2004). */
function incidentToOcsf(record, opts = {}) {
  const time = opts.time != null ? opts.time : (record.timestamps.createdAt ? Date.parse(record.timestamps.createdAt) : 0);
  return {
    metadata: { version: '1.3.0', product: { name: 'PolicyForge', vendor_name: 'PolicyForge', version: opts.toolVersion || '0.2.0' } },
    class_uid: 2004, class_name: 'Incident Finding', category_uid: 2, category_name: 'Findings',
    activity_id: 1, time,
    severity_id: OCSF_SEV[record.severity] || 3, severity: record.severity,
    status: record.status,
    finding_info: { title: record.title, uid: record.id, desc: record.description },
    unmapped: {
      dataClasses: record.signals.dataClasses,
      deadlines: record.deadlines.map(d => ({ regulation: d.regulation, dueAt: d.dueAt, status: d.status })),
      citations: record.citations,
    },
  };
}

module.exports = {
  SCHEMA_VERSION,
  createIncident, addTimelineEvent, deadlineBoard,
  renderIncidentReport, incidentToOcsf,
};
