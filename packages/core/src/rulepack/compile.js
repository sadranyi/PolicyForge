/**
 * Rule Pack compiler
 * ==================
 * Builds a single canonical Rule Pack from:
 *   - the loaded baselines (their rules become kind:"review" entries)
 *   - the shared runtime detection set (kind:"runtime" entries)
 *
 * The pack is the one artifact every downstream surface consumes. Compiling it
 * (rather than hand-maintaining it) guarantees there is exactly one source of
 * truth: fix a baseline rule and every emitter, the scan engine, and the MCP
 * server all update.
 */

'use strict';

const { loadBaseline } = require('../baseline/loader');
const { normalizeSeverity, validateRulePack, RULEPACK_FORMAT_VERSION } = require('./rulepack');
const { RUNTIME_RULES } = require('./runtime-rules');

const DEFAULT_BASELINES = ['ai-usage-policy', 'secure-coding-standards', 'incident-response'];

/**
 * Compile a Rule Pack.
 * @param {object} opts
 * @param {string[]} [opts.baselines] baseline ids to include (default: all three)
 * @param {boolean} [opts.includeRuntime=true] include runtime detection rules
 * @returns {Promise<object>} validated rule pack
 */
async function compileRulePack(opts = {}) {
  const baselineIds = opts.baselines || DEFAULT_BASELINES;
  const includeRuntime = opts.includeRuntime !== false;

  const citationsById = new Map();
  const rules = [];

  for (const id of baselineIds) {
    const baseline = await loadBaseline(id);
    for (const c of baseline.baseline.citations) {
      if (!citationsById.has(c.id)) citationsById.set(c.id, c);
    }
    for (const r of baseline.rules) {
      rules.push({
        rule_id: `${id}:${r.id}`,
        kind: 'review',
        source_baseline: id,
        title: r.title,
        category: r.category,
        severity: normalizeSeverity(r.severity),
        framework_citations: r.citations.slice(),
        controls: r.controls || {},
        patterns: {
          positive: (r.evidence_patterns && r.evidence_patterns.positive) || [],
          negative: (r.evidence_patterns && r.evidence_patterns.negative) || [],
        },
        description: (r.description || '').trim(),
        suggested_resolution: (r.suggested_resolution || '').trim(),
      });
    }
  }

  if (includeRuntime) {
    for (const rr of RUNTIME_RULES) {
      // Ensure runtime-rule citations are represented in the pack. They come
      // from the baselines above; if a baseline was excluded, synthesize a
      // minimal citation entry so validation passes and the pack stays portable.
      for (const cid of rr.framework_citations) {
        if (!citationsById.has(cid)) {
          citationsById.set(cid, { id: cid, name: cid, url: '' });
        }
      }
      rules.push({
        rule_id: rr.rule_id,
        kind: 'runtime',
        category: rr.category,
        severity: normalizeSeverity(rr.severity),
        action: rr.action,
        framework_citations: rr.framework_citations.slice(),
        controls: rr.controls || {},
        patterns: rr.patterns.slice(),
        description: rr.description,
      });
    }
  }

  const pack = {
    format_version: RULEPACK_FORMAT_VERSION,
    generated_by: 'policyforge',
    baselines: baselineIds.slice(),
    citations: Array.from(citationsById.values()),
    rules,
  };

  validateRulePack(pack);
  return pack;
}

module.exports = { compileRulePack, DEFAULT_BASELINES };
