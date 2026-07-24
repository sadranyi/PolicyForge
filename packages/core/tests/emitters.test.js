/**
 * Emitter tests — SARIF / OCSF / Sigma
 */

const { test } = require('node:test');
const assert = require('node:assert');

const core = require('../src/index');
const { toSarif, toOcsf, toSigma } = require('../src/emitters/emitters');

async function sampleReview() {
  const b = await core.loadBaseline('ai-usage-policy');
  return core.reviewPolicy(
    'We use data classification tiers. Customer data must not be entered into AI tools.',
    b
  );
}

test('toSarif produces valid 2.1.0 structure with only actionable findings', async () => {
  const review = await sampleReview();
  const sarif = toSarif(review, { policySource: 'policy.md', toolVersion: '0.2.0' });
  assert.strictEqual(sarif.version, '2.1.0');
  assert.strictEqual(sarif.runs[0].tool.driver.name, 'PolicyForge');
  // satisfied findings are excluded from results
  const gapCount = review.findings.filter(f => f.status !== 'satisfied').length;
  assert.strictEqual(sarif.runs[0].results.length, gapCount);
  // every result references a defined rule
  const ruleIds = new Set(sarif.runs[0].tool.driver.rules.map(r => r.id));
  for (const res of sarif.runs[0].results) assert.ok(ruleIds.has(res.ruleId));
});

test('SARIF results carry security-severity and framework metadata', async () => {
  const review = await sampleReview();
  const sarif = toSarif(review);
  const rule = sarif.runs[0].tool.driver.rules[0];
  assert.ok(rule.properties['security-severity']);
  assert.ok(Array.isArray(rule.properties.frameworks));
  assert.ok(['error', 'warning', 'note'].includes(rule.defaultConfiguration.level));
});

test('toOcsf emits one Compliance Finding per rule with pass/fail status', async () => {
  const review = await sampleReview();
  const events = toOcsf(review, { time: 0, org: 'Acme' });
  assert.strictEqual(events.length, review.findings.length);
  for (const e of events) {
    assert.strictEqual(e.class_uid, 2003);
    assert.ok(['Pass', 'Fail'].includes(e.status));
    assert.ok(Array.isArray(e.compliance.standards));
    assert.strictEqual(e.time, 0); // deterministic
  }
  // satisfied -> Pass
  const passIds = events.filter(e => e.status === 'Pass').map(e => e.finding_info.uid);
  const satisfied = review.findings.filter(f => f.status === 'satisfied').map(f => f.rule_id);
  assert.deepStrictEqual(passIds.sort(), satisfied.sort());
});

test('toSigma emits one detection rule per runtime rule with regex modifier', async () => {
  const pack = await core.compileRulePack();
  const sigma = toSigma(pack);
  const runtimeCount = pack.rules.filter(r => r.kind === 'runtime').length;
  assert.strictEqual(sigma.length, runtimeCount);
  for (const s of sigma) {
    assert.ok(s.id.startsWith('policyforge-'));
    assert.ok(s.detection.selection['message|re']);
    assert.ok(Array.isArray(s.tags) && s.tags.length > 0);
    assert.ok(['critical', 'high', 'medium', 'low'].includes(s.level));
  }
});

test('emitters reject malformed input', () => {
  assert.throws(() => toSarif({}), /findings/);
  assert.throws(() => toOcsf(null), /findings/);
  assert.throws(() => toSigma({}), /rule pack/);
});

test('emitters are exported from core', () => {
  assert.strictEqual(typeof core.toSarif, 'function');
  assert.strictEqual(typeof core.toOcsf, 'function');
  assert.strictEqual(typeof core.toSigma, 'function');
});
