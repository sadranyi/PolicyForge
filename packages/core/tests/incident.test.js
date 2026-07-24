/**
 * Incident Reporting tests — classification, deterministic clocks, deadlines,
 * report, OCSF. Includes boundary cases from the Implementation Spec.
 */

const { test } = require('node:test');
const assert = require('node:assert');

const core = require('../src/index');
const clock = require('../src/incident/clock');
const { classifySeverity } = require('../src/incident/classify');
const { computeDeadlines } = require('../src/incident/regulations');

// ---------- clock ----------
test('addHours / addDays / addMonths are correct and UTC-stable', () => {
  assert.strictEqual(clock.addHours('2026-07-20T10:00:00Z', 72), '2026-07-23T10:00:00.000Z');
  assert.strictEqual(clock.addDays('2026-07-20T10:00:00Z', 60), '2026-09-18T10:00:00.000Z');
  // month clamp: Jan 31 + 1 month -> Feb 28 (2026 not leap)
  assert.strictEqual(clock.addMonths('2026-01-31T00:00:00Z', 1).slice(0, 10), '2026-02-28');
  // leap year: Jan 31 2028 + 1 month -> Feb 29
  assert.strictEqual(clock.addMonths('2028-01-31T00:00:00Z', 1).slice(0, 10), '2028-02-29');
});

test('addBusinessDays skips weekends', () => {
  // Tue 2026-07-21 + 4 business days = Mon 2026-07-27 (skips Sat/Sun)
  assert.strictEqual(clock.addBusinessDays('2026-07-21T14:00:00Z', 4).slice(0, 10), '2026-07-27');
  // Fri + 1 business day = Mon
  assert.strictEqual(clock.addBusinessDays('2026-07-24T09:00:00Z', 1).slice(0, 10), '2026-07-27');
});

test('addBusinessDays skips holidays', () => {
  // Thu 2026-07-02 +2 bd normally Mon 2026-07-06, but 2026-07-03 (Fri) holiday -> still Mon (Fri skipped, Sat/Sun skipped)
  const due = clock.addBusinessDays('2026-07-02T09:00:00Z', 2, ['2026-07-03']).slice(0, 10);
  assert.strictEqual(due, '2026-07-07');
});

test('deadlineStatus classifies overdue / due-soon / open', () => {
  assert.strictEqual(clock.deadlineStatus('2026-07-20T00:00:00Z', '2026-07-21T00:00:00Z'), 'OVERDUE');
  assert.strictEqual(clock.deadlineStatus('2026-07-21T10:00:00Z', '2026-07-21T00:00:00Z'), 'DUE_SOON');
  assert.strictEqual(clock.deadlineStatus('2026-07-25T00:00:00Z', '2026-07-21T00:00:00Z'), 'OPEN');
});

// ---------- classification ----------
test('SEV1 for confirmed exfiltration of regulated-sensitive data', () => {
  const r = { signals: { dataClasses: ['PHI'], confirmedExfiltration: true }, orgContext: {} };
  assert.strictEqual(classifySeverity(r).severity, 'SEV1');
});

test('SEV4 for a low-impact event', () => {
  const r = { signals: { dataClasses: ['NONE'], recordCount: 0, affectedSystems: [] }, orgContext: {} };
  assert.strictEqual(classifySeverity(r).severity, 'SEV4');
});

test('SEV3 for moderate impact (ordinary PII, no exfil)', () => {
  const r = { signals: { dataClasses: ['PII'], recordCount: 50 }, orgContext: {} };
  assert.strictEqual(classifySeverity(r).severity, 'SEV3');
});

// ---------- deadlines / applicability ----------
test('GDPR + NIS2 + SEC + HIPAA all fire for a multi-regime incident', () => {
  const record = {
    timestamps: { awareAt: '2026-07-20T10:00:00Z', discoveredAt: '2026-07-20T10:00:00Z', determinedMaterialAt: '2026-07-21T14:00:00Z' },
    signals: { dataClasses: ['PHI'], recordCount: 1200 },
    orgContext: { gdprApplies: true, isSecRegistrant: true, hipaaRole: 'COVERED_ENTITY', nis2Entity: 'ESSENTIAL' },
    humanDeterminations: { materiality: 'MATERIAL' },
  };
  const dls = computeDeadlines(record, { now: '2026-07-21T15:00:00Z' });
  const regs = new Set(dls.map(d => d.regulation));
  assert.ok(regs.has('GDPR_ART33'));
  assert.ok(regs.has('NIS2_EARLY') && regs.has('NIS2_NOTIFY') && regs.has('NIS2_FINAL'));
  assert.ok(regs.has('SEC_8K_105'));
  assert.ok(regs.has('HIPAA_INDIVIDUAL'));
});

test('GDPR 72h clock is exact from awareness', () => {
  const record = { timestamps: { awareAt: '2026-07-20T10:00:00Z' }, orgContext: { gdprApplies: true } };
  const dls = computeDeadlines(record, { now: '2026-07-20T11:00:00Z' });
  const art33 = dls.find(d => d.regulation === 'GDPR_ART33');
  assert.strictEqual(art33.dueAt, '2026-07-23T10:00:00.000Z');
});

test('SEC deadline is PENDING_TRIGGER until materiality is determined', () => {
  const record = {
    timestamps: { awareAt: '2026-07-20T10:00:00Z' },
    orgContext: { isSecRegistrant: true },
    humanDeterminations: { materiality: 'UNDETERMINED' },
  };
  const dls = computeDeadlines(record, { now: '2026-07-21T00:00:00Z' });
  const sec = dls.find(d => d.regulation === 'SEC_8K_105');
  assert.strictEqual(sec.status, 'PENDING_TRIGGER');
  assert.strictEqual(sec.dueAt, null);
});

test('CIRCIA deadlines are advisory and can be excluded', () => {
  const record = { timestamps: { awareAt: '2026-07-20T10:00:00Z' }, orgContext: { criticalInfraSector: 'energy' } };
  const withAdv = computeDeadlines(record, { now: '2026-07-21T00:00:00Z', includeAdvisory: true });
  assert.ok(withAdv.some(d => d.advisory && d.regulation === 'CIRCIA_INCIDENT'));
  const without = computeDeadlines(record, { now: '2026-07-21T00:00:00Z', includeAdvisory: false });
  assert.ok(!without.some(d => d.advisory));
});

test('no obligations when org context is empty', () => {
  const dls = computeDeadlines({ timestamps: { awareAt: '2026-07-20T10:00:00Z' }, orgContext: {} }, { now: '2026-07-20T11:00:00Z' });
  assert.strictEqual(dls.length, 0);
});

// ---------- orchestration / determinism ----------
test('createIncident is deterministic for identical inputs', () => {
  const intake = {
    title: 'X', timestamps: { detectedAt: '2026-07-20T09:00:00Z', awareAt: '2026-07-20T10:00:00Z' },
    signals: { dataClasses: ['PII'], recordCount: 10 }, orgContext: { gdprApplies: true },
  };
  const a = core.incident.createIncident(intake, { now: '2026-07-20T12:00:00Z' });
  const b = core.incident.createIncident(intake, { now: '2026-07-20T12:00:00Z' });
  assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
  assert.ok(a.id.startsWith('INC-'));
});

test('severity override is honored', () => {
  const rec = core.incident.createIncident(
    { title: 'x', signals: { dataClasses: ['PHI'], confirmedExfiltration: true }, orgContext: {} },
    { now: '2026-07-20T12:00:00Z', severityOverride: 'SEV3' }
  );
  assert.strictEqual(rec.severity, 'SEV3');
  assert.match(rec.severityRationale[0], /overridden/i);
});

test('renderIncidentReport produces a report with deadlines and disclaimer', () => {
  const rec = core.incident.createIncident({
    title: 'DB exposure', timestamps: { awareAt: '2026-07-20T10:00:00Z' },
    signals: { dataClasses: ['PII'], recordCount: 600 }, orgContext: { gdprApplies: true },
  }, { now: '2026-07-20T12:00:00Z' });
  const md = core.incident.renderIncidentReport(rec);
  assert.match(md, /NOT LEGAL ADVICE/);
  assert.match(md, /GDPR Art 33/);
  assert.match(md, /Timeline/);
});

test('incidentToOcsf emits Incident Finding class 2004 with deterministic time', () => {
  const rec = core.incident.createIncident(
    { title: 'x', signals: { dataClasses: ['PHI'], confirmedExfiltration: true }, orgContext: { gdprApplies: true }, timestamps: { awareAt: '2026-07-20T10:00:00Z' } },
    { now: '2026-07-20T12:00:00Z' }
  );
  const ev = core.incident.incidentToOcsf(rec, { time: 0 });
  assert.strictEqual(ev.class_uid, 2004);
  assert.strictEqual(ev.time, 0);
  assert.strictEqual(ev.severity_id, 5); // SEV1
});

test('incident module is exported from core', () => {
  assert.strictEqual(typeof core.incident.createIncident, 'function');
  assert.strictEqual(typeof core.incident.deadlineBoard, 'function');
});
