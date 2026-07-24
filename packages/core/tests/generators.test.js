/**
 * Generator tests
 * ---------------
 * Each baseline's toolkit generator must produce its expected core files,
 * and the dispatcher must fail loudly on unknown baselines.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const core = require('../src/index');

const STACK = {
  languages: ['typescript'],
  ci: 'github-actions',
  org_name: 'Test Org',
  policy_owner_email: 'security@test.example'
};

async function runPipeline(baselineId, policyPath) {
  const policyText = fs.readFileSync(policyPath, 'utf8');
  const baseline = await core.loadBaseline(baselineId);
  const review = core.reviewPolicy(policyText, baseline);
  const toolkit = core.generateToolkit({ review, baseline, stack: STACK });
  return { review, toolkit };
}

const EXAMPLES = path.resolve(__dirname, '..', '..', '..', 'examples');

test('ai-usage-policy toolkit produces agent instructions and guards', async () => {
  const { toolkit } = await runPipeline(
    'ai-usage-policy',
    path.join(EXAMPLES, 'sample-policy.md')
  );
  const files = Object.keys(toolkit);
  assert.ok(files.includes('AGENTS.md'), 'AGENTS.md present');
  assert.ok(files.includes('CLAUDE.md'), 'CLAUDE.md present');
  assert.ok(files.includes('.github/copilot-instructions.md'), 'copilot redirector present');
  for (const [name, content] of Object.entries(toolkit)) {
    assert.ok(typeof content === 'string' && content.length > 0, `${name} is non-empty`);
  }
});

test('secure-coding toolkit produces in-repo standards and CI config', async () => {
  const { toolkit } = await runPipeline(
    'secure-coding-standards',
    path.join(EXAMPLES, 'sample-secure-coding-good.md')
  );
  const files = Object.keys(toolkit);
  assert.ok(files.some(f => /SECURE_CODING_STANDARDS\.md$/.test(f)), 'standards doc present');
  assert.ok(files.some(f => f.startsWith('.github/')), 'GitHub config present');
});

test('incident-response toolkit produces policy doc and playbooks', async () => {
  const { toolkit } = await runPipeline(
    'incident-response',
    path.join(EXAMPLES, 'sample-incident-response-good.md')
  );
  const files = Object.keys(toolkit);
  assert.ok(files.some(f => /INCIDENT_RESPONSE_POLICY\.md$/.test(f)), 'IR policy doc present');
  assert.ok(files.some(f => /playbook/i.test(f)), 'at least one playbook present');
});

test('generateToolkit throws a coded error on unknown baseline ids', async () => {
  const baseline = await core.loadBaseline('ai-usage-policy');
  const review = core.reviewPolicy('text', baseline);
  const fake = JSON.parse(JSON.stringify(baseline));
  fake.baseline.id = 'mystery-baseline';
  try {
    core.generateToolkit({ review, baseline: fake, stack: STACK });
    assert.fail('expected generateToolkit to throw');
  } catch (err) {
    assert.strictEqual(err.code, 'TOOLKIT_BASELINE_UNSUPPORTED');
  }
});

test('generateReviewDocument renders markdown with findings', async () => {
  const baseline = await core.loadBaseline('ai-usage-policy');
  const review = core.reviewPolicy('We prohibit customer data in AI services. It must not be used.', baseline);
  const doc = core.generateReviewDocument(review, { org_name: 'Test Org' });
  assert.ok(typeof doc.markdown === 'string' && doc.markdown.length > 100);
  assert.ok(doc.markdown.includes(review.baseline.name), 'names the baseline');
  assert.strictEqual(doc.data, review, 'carries the raw review data');
});

test('core.run one-shot pipeline returns review and toolkit', async () => {
  const policyText = fs.readFileSync(path.join(EXAMPLES, 'sample-policy.md'), 'utf8');
  const { review, toolkit } = await core.run({
    policyText,
    baselineId: 'ai-usage-policy',
    stack: STACK
  });
  assert.ok(review.findings.length > 0);
  assert.ok(Object.keys(toolkit).length > 0);
});
