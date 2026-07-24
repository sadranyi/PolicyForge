/**
 * `policyforge incident` — CLI surface for the incident-reporting subsystem.
 *
 * Modes:
 *   policyforge incident --intake <file.json> [--now <iso>] [--out <dir>]
 *   policyforge incident --demo [--out <dir>]
 *
 * Produces: incident.json (record), incident-report.md, incident.ocsf.json,
 * and a self-contained incident-dashboard.html.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const core = require('policyforge-core');
const { renderDashboard } = require('./incident-dashboard');

const DEMO_INTAKE = {
  title: 'Customer database exposure via misconfigured storage',
  description: 'A publicly-readable object store bucket exposed a customer records table. Confirmed external access in logs.',
  status: 'INVESTIGATING',
  timestamps: {
    detectedAt: '2026-07-20T09:00:00Z',
    awareAt: '2026-07-20T10:00:00Z',
    discoveredAt: '2026-07-20T10:00:00Z',
    determinedMaterialAt: '2026-07-21T14:00:00Z',
  },
  signals: {
    dataClasses: ['PII', 'PHI'],
    recordCount: 1200,
    confirmedExfiltration: true,
    affectedSystems: [{ name: 'customer-db', criticality: 'HIGH' }],
    confidentiality: true, integrity: false, availability: false,
  },
  orgContext: {
    isSecRegistrant: true, hipaaRole: 'COVERED_ENTITY', gdprApplies: true,
    nis2Entity: 'ESSENTIAL', processesCardholderData: false, jurisdictions: ['US-CA', 'EU-DE'],
  },
  humanDeterminations: { materiality: 'MATERIAL', gdprRisk: 'HIGH_RISK', hipaaIsBreach: 'BREACH' },
};

function nowIsoFallback() {
  // The CLI is a boundary; using the wall clock here is fine (the engine stays
  // deterministic because `now` is passed in explicitly).
  return new Date().toISOString();
}

async function cmdIncident(args, C) {
  const outDir = args.out || args.output || './incident-output';
  const now = args.now || nowIsoFallback();

  let intake;
  if (args.demo) {
    intake = DEMO_INTAKE;
  } else if (args.intake) {
    const raw = fs.readFileSync(args.intake, 'utf8');
    intake = JSON.parse(raw);
  } else {
    console.error(C.red('Error:') + ' provide --intake <file.json> or --demo');
    process.exit(2);
  }

  const record = core.incident.createIncident(intake, {
    now,
    holidays: args.holidays ? String(args.holidays).split(',') : [],
    includeAdvisory: args['include-advisory'] !== false,
  });

  fs.mkdirSync(outDir, { recursive: true });
  const recPath = path.join(outDir, 'incident.json');
  const mdPath = path.join(outDir, 'incident-report.md');
  const ocsfPath = path.join(outDir, 'incident.ocsf.json');
  const dashPath = path.join(outDir, 'incident-dashboard.html');

  fs.writeFileSync(recPath, JSON.stringify(record, null, 2));
  fs.writeFileSync(mdPath, core.incident.renderIncidentReport(record));
  fs.writeFileSync(ocsfPath, JSON.stringify(core.incident.incidentToOcsf(record), null, 2));
  fs.writeFileSync(dashPath, renderDashboard([record], { now }));

  const board = core.incident.deadlineBoard(record, now);
  const overdue = board.filter(d => d.status === 'OVERDUE').length;
  const dueSoon = board.filter(d => d.status === 'DUE_SOON').length;

  console.log('');
  console.log(C.bold(`Incident ${record.id} — ${record.severity}`));
  console.log(`  ${record.title}`);
  console.log('');
  console.log(`  Deadlines: ${board.length}  ` +
    (overdue ? C.red(`${overdue} overdue  `) : '') +
    (dueSoon ? C.yel(`${dueSoon} due soon  `) : ''));
  for (const d of board.slice(0, 8)) {
    const tag = d.status === 'OVERDUE' ? C.red('OVERDUE ') : d.status === 'DUE_SOON' ? C.yel('DUE SOON') : d.status.padEnd(8);
    console.log(`   ${tag}  ${d.dueAt || d.status}  ${d.label}`);
  }
  console.log('');
  console.log('  Output:');
  console.log(`    ${recPath}`);
  console.log(`    ${mdPath}`);
  console.log(`    ${ocsfPath}`);
  console.log(`    ${dashPath}`);
  console.log('');
  console.log(C.dim('  NOT LEGAL ADVICE — deadlines are software estimates; have counsel/DPO review.'));
}

module.exports = { cmdIncident, DEMO_INTAKE };
