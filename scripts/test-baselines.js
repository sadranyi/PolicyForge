#!/usr/bin/env node
/**
 * Baseline correctness tests.
 *
 * For each baseline, runs the reviewer against:
 *   - a deliberately bad sample policy (should produce many gaps)
 *   - a deliberately comprehensive sample policy (should produce few gaps)
 *
 * If a "good" sample policy fails too many rules, the rules have too-strict
 * positive patterns (false negatives — flagging gaps where there aren't any).
 * If a "bad" sample policy passes too many rules, the rules have too-loose
 * patterns (false positives — passing rules that aren't actually addressed).
 *
 * Both are baseline-quality bugs that should fail this test.
 */

const path = require('path');
const fs = require('fs');
const core = require(path.join(__dirname, '..', 'packages/core/src/index.js'));

const ROOT = path.resolve(__dirname, '..');

// Each test case: a baseline + a "bad" policy that should mostly fail + a "good" policy that should mostly pass.
const TEST_CASES = [
  {
    baseline: 'ai-usage-policy',
    bad: path.join(ROOT, 'examples/sample-policy.md'),
    good: path.join(ROOT, 'examples/sample-ai-usage-good.md'),
    expectations: {
      bad: { max_satisfied_ratio: 0.4 },  // bad sample should pass < 40% of rules
      good: { min_satisfied_ratio: 0.85 }, // good sample should pass >= 85%
    }
  },
  {
    baseline: 'secure-coding-standards',
    bad: path.join(ROOT, 'examples/sample-secure-coding-bad.md'),
    good: path.join(ROOT, 'examples/sample-secure-coding-good.md'),
    expectations: {
      bad: { max_satisfied_ratio: 0.1 },   // bad sample should pass <= 10%
      good: { min_satisfied_ratio: 0.85 }, // good sample should pass >= 85%
    }
  },
  {
    baseline: 'incident-response',
    bad: path.join(ROOT, 'examples/sample-incident-response-bad.md'),
    good: path.join(ROOT, 'examples/sample-incident-response-good.md'),
    expectations: {
      bad: { max_satisfied_ratio: 0.1 },
      good: { min_satisfied_ratio: 0.85 },
    }
  }
];

let pass = 0;
let fail = 0;
const failures = [];

function logStep(msg) { console.log(`\n→ ${msg}`); }
function ok(msg) { console.log(`  ✓ ${msg}`); pass++; }
function bad(msg) { console.log(`  ✗ ${msg}`); fail++; failures.push(msg); }

async function testCase(tc) {
  logStep(`Baseline: ${tc.baseline}`);

  const baseline = await core.loadBaseline(tc.baseline);
  ok(`Loaded baseline (${baseline.rules.length} rules, ${baseline.baseline.citations.length} citations)`);

  if (tc.bad && fs.existsSync(tc.bad)) {
    const extracted = await core.extractText(tc.bad);
    const review = core.reviewPolicy(extracted.text, baseline);
    const ratio = review.summary.by_status.satisfied / review.summary.total;
    const limit = tc.expectations.bad.max_satisfied_ratio;

    if (ratio <= limit) {
      ok(`bad sample: ${review.summary.by_status.satisfied}/${review.summary.total} satisfied (ratio ${ratio.toFixed(2)} ≤ ${limit})`);
    } else {
      bad(`bad sample: ${review.summary.by_status.satisfied}/${review.summary.total} satisfied (ratio ${ratio.toFixed(2)} > ${limit}) — false positives in baseline?`);
    }

    if (review.recommendation !== 'material_revision_required' && tc.expectations.bad.max_satisfied_ratio < 0.5) {
      bad(`bad sample: recommendation was "${review.recommendation}" — expected material_revision_required`);
    } else {
      ok(`bad sample recommendation: ${review.recommendation}`);
    }
  }

  if (tc.good && fs.existsSync(tc.good)) {
    const extracted = await core.extractText(tc.good);
    const review = core.reviewPolicy(extracted.text, baseline);
    const ratio = review.summary.by_status.satisfied / review.summary.total;
    const limit = tc.expectations.good.min_satisfied_ratio;

    if (ratio >= limit) {
      ok(`good sample: ${review.summary.by_status.satisfied}/${review.summary.total} satisfied (ratio ${ratio.toFixed(2)} ≥ ${limit})`);
    } else {
      // Show which rules failed for diagnostic value
      const gaps = review.findings.filter(f => f.status !== 'satisfied').map(f => `${f.severity} · ${f.rule_id} (${f.status})`);
      bad(`good sample: ${review.summary.by_status.satisfied}/${review.summary.total} satisfied (ratio ${ratio.toFixed(2)} < ${limit}) — false negatives. Failing: ${gaps.join(', ')}`);
    }
  }
}

(async () => {
  console.log('PolicyForge — baseline correctness tests');
  console.log('=========================================');

  for (const tc of TEST_CASES) {
    try {
      await testCase(tc);
    } catch (err) {
      bad(`Baseline ${tc.baseline} threw: ${err.message}`);
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.log('\nFailures:');
    failures.forEach(f => console.log(`  - ${f}`));
    process.exit(1);
  }
  process.exit(0);
})();
