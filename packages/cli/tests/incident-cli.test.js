/**
 * Incident CLI + dashboard renderer tests
 */
const { test } = require('node:test');
const assert = require('node:assert');
const core = require('policyforge-core');
const { renderDashboard } = require('../src/incident-dashboard');
const { DEMO_INTAKE } = require('../src/incident-cmd');

test('renderDashboard produces a self-contained HTML dashboard', () => {
  const rec = core.incident.createIncident(DEMO_INTAKE, { now: '2026-07-21T15:00:00Z' });
  const html = renderDashboard([rec], { now: '2026-07-21T15:00:00Z' });
  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /Incident Reporting Dashboard/);
  assert.match(html, /NOT LEGAL ADVICE/);
  assert.match(html, /GDPR Art 33/);
  assert.match(html, /data-due=/); // countdown wiring present
  assert.ok(!/<script src=/.test(html), 'no external scripts');
});

test('dashboard escapes incident content', () => {
  const rec = core.incident.createIncident(
    { title: '<img src=x onerror=alert(1)>', signals: { dataClasses: ['PII'] }, orgContext: { gdprApplies: true }, timestamps: { awareAt: '2026-07-20T10:00:00Z' } },
    { now: '2026-07-20T12:00:00Z' }
  );
  const html = renderDashboard([rec], { now: '2026-07-20T12:00:00Z' });
  assert.ok(!html.includes('<img src=x onerror'));
  assert.match(html, /&lt;img/);
});
