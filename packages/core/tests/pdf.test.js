/**
 * PDF extraction tests
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { extractText } = require('../src/extractors/extract');
const { extractPdfText } = require('../src/extractors/pdf');
const core = require('../src/index');

const FIX = path.join(__dirname, 'fixtures');

test('extractText reads a text-based PDF and returns readable text', async () => {
  const res = await extractText(path.join(FIX, 'sample-policy.pdf'));
  assert.strictEqual(res.format, 'pdf');
  assert.strictEqual(res.pages, 1);
  assert.match(res.text, /Acme AI Usage Policy/);
  assert.match(res.text, /Customer data must not/);
  assert.match(res.text, /GDPR and CCPA/);
  assert.strictEqual(res.warnings.length, 0);
});

test('lines are reconstructed in reading order', async () => {
  const { text } = await extractPdfText(fs.readFileSync(path.join(FIX, 'sample-policy.pdf')));
  const iTitle = text.indexOf('Acme AI Usage Policy');
  const iVendors = text.indexOf('New AI vendors');
  assert.ok(iTitle >= 0 && iVendors > iTitle, 'title precedes later lines');
});

test('a scanned/image-only PDF yields a low_text_yield warning', async () => {
  const res = await extractPdfText(fs.readFileSync(path.join(FIX, 'scanned-like.pdf')));
  assert.ok(res.warnings.some(w => w.code === 'low_text_yield'));
});

test('a PDF policy flows through the full review pipeline', async () => {
  const res = await extractText(path.join(FIX, 'sample-policy.pdf'));
  const baseline = await core.loadBaseline('ai-usage-policy');
  const review = core.reviewPolicy(res.text, baseline);
  assert.ok(review.findings.length === baseline.rules.length);
  // The sample PDF addresses classification, customer-data, prompt injection.
  const satisfied = review.findings.filter(f => f.status === 'satisfied').map(f => f.rule_id);
  assert.ok(satisfied.includes('foundational-classification'));
  assert.ok(satisfied.includes('foundational-customer-data-prohibition'));
});
