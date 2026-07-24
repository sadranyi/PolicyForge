/**
 * Baseline loader tests
 * ---------------------
 * The loader's strict validation is the project's defensibility: a rule
 * without a citation must never load. These tests pin that behavior.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { loadBaseline, validateBaseline } = require('../src/baseline/loader');

const BASELINE_IDS = ['ai-usage-policy', 'secure-coding-standards', 'incident-response'];

test('all shipped baselines load and validate', async () => {
  for (const id of BASELINE_IDS) {
    const baseline = await loadBaseline(id);
    assert.strictEqual(baseline.baseline.id, id);
    assert.ok(Array.isArray(baseline.rules) && baseline.rules.length > 0, `${id}: has rules`);
    assert.ok(baseline.baseline.citations.length > 0, `${id}: has citations`);
  }
});

test('shipped baselines total 63 rules', async () => {
  let total = 0;
  for (const id of BASELINE_IDS) {
    const baseline = await loadBaseline(id);
    total += baseline.rules.length;
  }
  assert.strictEqual(total, 63);
});

test('every rule in every baseline cites a declared source', async () => {
  for (const id of BASELINE_IDS) {
    const baseline = await loadBaseline(id);
    const declared = new Set(baseline.baseline.citations.map(c => c.id));
    for (const rule of baseline.rules) {
      assert.ok(rule.citations.length > 0, `${id}/${rule.id}: has at least one citation`);
      for (const cid of rule.citations) {
        assert.ok(declared.has(cid), `${id}/${rule.id}: citation "${cid}" is declared`);
      }
    }
  }
});

test('every evidence pattern in every baseline compiles as regex', async () => {
  for (const id of BASELINE_IDS) {
    const baseline = await loadBaseline(id);
    for (const rule of baseline.rules) {
      const all = [
        ...(rule.evidence_patterns?.positive || []),
        ...(rule.evidence_patterns?.negative || [])
      ];
      for (const pattern of all) {
        assert.doesNotThrow(() => new RegExp(pattern, 'gi'), `${id}/${rule.id}: "${pattern}"`);
      }
    }
  }
});

test('loadBaseline rejects unknown baseline ids', async () => {
  await assert.rejects(() => loadBaseline('does-not-exist'), /Baseline not found/);
});

test('validateBaseline rejects a rule without citations', () => {
  const bad = {
    baseline: {
      id: 'test', name: 'Test',
      citations: [{ id: 'src-1', name: 'Some Framework' }]
    },
    rules: [{
      id: 'r1', title: 'A rule', severity: 'High', category: 'test',
      citations: [],
      evidence_patterns: { positive: ['foo'] },
      suggested_resolution: 'Fix it.'
    }]
  };
  assert.throws(() => validateBaseline(bad, 'inline'), /at least one citation is required/);
});

test('validateBaseline rejects duplicate rule ids and undeclared citations', () => {
  const bad = {
    baseline: {
      id: 'test', name: 'Test',
      citations: [{ id: 'src-1', name: 'Some Framework' }]
    },
    rules: [
      {
        id: 'r1', title: 'A', severity: 'High', category: 'test',
        citations: ['src-1'],
        evidence_patterns: { positive: ['foo'] },
        suggested_resolution: 'Fix.'
      },
      {
        id: 'r1', title: 'B', severity: 'Nope', category: 'test',
        citations: ['ghost'],
        evidence_patterns: { positive: ['bar'] },
        suggested_resolution: 'Fix.'
      }
    ]
  };
  try {
    validateBaseline(bad, 'inline');
    assert.fail('expected validation to throw');
  } catch (err) {
    assert.match(err.message, /duplicate rule id/);
    assert.match(err.message, /citation "ghost" not declared/);
    assert.match(err.message, /severity must be Critical\|High\|Medium\|Low/);
  }
});

test('loadBaseline accepts an explicit .yaml path', async () => {
  const tmp = path.join(os.tmpdir(), `pf-baseline-${process.pid}.yaml`);
  fs.writeFileSync(tmp, [
    'baseline:',
    '  id: tmp-test',
    '  name: Tmp Test',
    '  version: 0.0.1',
    '  citations:',
    '    - id: src-1',
    '      name: Some Framework',
    'rules:',
    '  - id: r1',
    '    title: A rule',
    '    category: test',
    '    severity: Low',
    '    citations: [src-1]',
    '    evidence_patterns:',
    '      positive: ["hello"]',
    '    suggested_resolution: Say hello.',
    ''
  ].join('\n'));
  try {
    const b = await loadBaseline(tmp);
    assert.strictEqual(b.baseline.id, 'tmp-test');
  } finally {
    fs.unlinkSync(tmp);
  }
});
