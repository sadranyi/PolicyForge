/**
 * Reviewer tests
 * --------------
 * Pins the satisfied / partial / gap semantics and the recommendation
 * roll-up logic against a small inline baseline, so changes to the
 * reviewer can't silently alter review outcomes.
 */

const { test } = require('node:test');
const assert = require('node:assert');

const { reviewPolicy } = require('../src/reviewers/review');

const BASELINE = {
  baseline: {
    id: 'inline-test',
    name: 'Inline Test Baseline',
    version: '0.0.1',
    citations: [{ id: 'src-1', name: 'Some Framework' }]
  },
  rules: [
    {
      id: 'crit-1', title: 'Critical thing', category: 'a', severity: 'Critical',
      citations: ['src-1'],
      evidence_patterns: { positive: ['encryption at rest'] },
      suggested_resolution: 'Define encryption at rest.'
    },
    {
      id: 'high-1', title: 'High thing', category: 'a', severity: 'High',
      citations: ['src-1'],
      evidence_patterns: {
        positive: ['incident response'],
        negative: ['incident response plan to be defined later']
      },
      suggested_resolution: 'Define incident response.'
    },
    {
      id: 'low-1', title: 'Low thing', category: 'b', severity: 'Low',
      citations: ['src-1'],
      evidence_patterns: { positive: ['review cadence'] },
      suggested_resolution: 'Define review cadence.'
    }
  ]
};

test('satisfied when a positive pattern matches and no negative fires', () => {
  const review = reviewPolicy('We require encryption at rest for all data stores.', BASELINE);
  const f = review.findings.find(x => x.rule_id === 'crit-1');
  assert.strictEqual(f.status, 'satisfied');
  assert.ok(f.positive_matches.length > 0);
  assert.ok(f.positive_matches[0].matched_text.includes('encryption at rest'));
});

test('gap when no positive pattern matches', () => {
  const review = reviewPolicy('This policy says nothing relevant.', BASELINE);
  for (const f of review.findings) {
    assert.strictEqual(f.status, 'gap', `${f.rule_id} should be a gap`);
  }
  assert.strictEqual(review.summary.by_status.gap, 3);
});

test('partial when positive and negative patterns both fire', () => {
  const review = reviewPolicy(
    'Our incident response plan to be defined later covers this topic.',
    BASELINE
  );
  const f = review.findings.find(x => x.rule_id === 'high-1');
  assert.strictEqual(f.status, 'partial');
});

test('matching is case-insensitive', () => {
  const review = reviewPolicy('ENCRYPTION AT REST is mandatory.', BASELINE);
  const f = review.findings.find(x => x.rule_id === 'crit-1');
  assert.strictEqual(f.status, 'satisfied');
});

test('recommendation escalates on Critical gaps', () => {
  const review = reviewPolicy('We have incident response and a review cadence.', BASELINE);
  // crit-1 is a gap, so:
  assert.strictEqual(review.recommendation, 'material_revision_required');
});

test('recommendation is minor_improvements_only when everything passes', () => {
  const review = reviewPolicy(
    'Encryption at rest is required. Incident response is defined. Review cadence is annual.',
    BASELINE
  );
  assert.strictEqual(review.recommendation, 'minor_improvements_only');
  assert.strictEqual(review.summary.by_status.satisfied, 3);
});

test('summary severity roll-up counts correctly', () => {
  const review = reviewPolicy('Encryption at rest is required.', BASELINE);
  assert.strictEqual(review.summary.by_severity.Critical.satisfied, 1);
  assert.strictEqual(review.summary.by_severity.High.gap, 1);
  assert.strictEqual(review.summary.by_severity.Low.gap, 1);
});

test('throws on non-string policy text and missing rules', () => {
  assert.throws(() => reviewPolicy(null, BASELINE), /policyText must be a string/);
  assert.throws(() => reviewPolicy('text', {}), /baseline must include rules/);
});

test('review carries baseline identity and citations through', () => {
  const review = reviewPolicy('anything', BASELINE);
  assert.strictEqual(review.baseline.id, 'inline-test');
  assert.strictEqual(review.baseline.citations.length, 1);
});
