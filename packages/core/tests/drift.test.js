/**
 * Policy drift detection tests
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const core = require('../src/index');
const { snapshotReview, diffSnapshots } = require('../src/drift/drift');

const GOOD = path.join(__dirname, '..', '..', '..', 'examples', 'sample-ai-usage-good.md');

async function review(text) {
  const b = await core.loadBaseline('ai-usage-policy');
  return core.reviewPolicy(text, b);
}

test('snapshots are deterministic for identical policy text', async () => {
  const a = snapshotReview(await review('We use data classification tiers.'));
  const b = snapshotReview(await review('We use data classification tiers.'));
  assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
});

test('strengthening a policy shows resolutions and no regression', async () => {
  const weak = await review('We use data classification tiers.');
  const strong = await review(fs.readFileSync(GOOD, 'utf8'));
  const d = diffSnapshots(weak, strong);
  assert.ok(d.summary.resolved > 0);
  assert.strictEqual(d.summary.new_gaps, 0);
  assert.strictEqual(d.regressed, false);
  assert.strictEqual(d.drifted, true);
});

test('weakening a policy is flagged as a regression', async () => {
  const strong = await review(fs.readFileSync(GOOD, 'utf8'));
  const weak = await review('We use data classification tiers.');
  const d = diffSnapshots(strong, weak);
  assert.ok(d.summary.new_gaps > 0);
  assert.strictEqual(d.regressed, true);
});

test('no change means no drift', async () => {
  const r = await review(fs.readFileSync(GOOD, 'utf8'));
  const d = diffSnapshots(snapshotReview(r), snapshotReview(r));
  assert.strictEqual(d.drifted, false);
  assert.strictEqual(d.regressed, false);
});

test('diff accepts raw reviews as well as snapshots', async () => {
  const a = await review('nothing relevant here');
  const b = await review(fs.readFileSync(GOOD, 'utf8'));
  const d = diffSnapshots(a, b); // raw reviews
  assert.ok(d.summary.resolved > 0);
});

test('snapshotReview strips volatile fields', async () => {
  const r = await review('We use data classification tiers.');
  const snap = snapshotReview(r);
  assert.ok(!('reviewed_at' in snap));
  for (const f of snap.findings) {
    assert.ok(!('positive_matches' in f), 'no offsets/match text retained');
  }
});
