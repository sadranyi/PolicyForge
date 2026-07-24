/**
 * DLP pattern-pack exporter tests
 */
const { test } = require('node:test');
const assert = require('node:assert');
const core = require('../src/index');
const { toPurviewSIT, toNetskopeDLP, toZscalerDLP, toGenericDictionary, toDlpPack } = require('../src/emitters/dlp-packs');

async function pack() { return core.compileRulePack(); }

test('every exporter emits one entry per runtime rule', async () => {
  const p = await pack();
  const rt = p.rules.filter(r => r.kind === 'runtime').length;
  assert.strictEqual(toPurviewSIT(p).rulePackage.entities.length, rt);
  assert.strictEqual(toNetskopeDLP(p).dlp_entities.length, rt);
  assert.strictEqual(toZscalerDLP(p).dlpDictionaries.length, rt);
  assert.strictEqual(toGenericDictionary(p).entries.length, rt);
});

test('exports carry framework citations through', async () => {
  const p = await pack();
  const gen = toGenericDictionary(p);
  for (const e of gen.entries) assert.ok(e.frameworks.length > 0, `${e.id} keeps frameworks`);
  const purview = toPurviewSIT(p);
  for (const e of purview.rulePackage.entities) assert.ok(e.metadata.frameworks.length > 0);
});

test('exported patterns are the runtime rule regexes and compile', async () => {
  const p = await pack();
  const gen = toGenericDictionary(p);
  for (const e of gen.entries) {
    for (const pat of e.patterns) assert.doesNotThrow(() => new RegExp(pat, 'gi'));
  }
});

test('toDlpPack dispatches and rejects unknown targets', async () => {
  const p = await pack();
  assert.ok(toDlpPack(p, 'purview').rulePackage);
  assert.ok(toDlpPack(p, 'netskope').dlp_entities);
  assert.throws(() => toDlpPack(p, 'nope'), /unknown target/);
  assert.throws(() => toDlpPack({}, 'purview'), /rule pack required/);
});

test('DLP exporters exported from core', () => {
  assert.strictEqual(typeof core.toDlpPack, 'function');
  assert.strictEqual(typeof core.toPurviewSIT, 'function');
});
