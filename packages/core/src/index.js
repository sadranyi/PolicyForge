/**
 * policyforge-core — public API
 *
 * Exports the three pipeline stages:
 *   - extractor: turn an input document into normalized text
 *   - reviewer:  evaluate normalized text against the baseline
 *   - generator: produce a tailored toolkit from review + stack profile
 *
 * Plus the baseline loader for direct introspection.
 */

const { loadBaseline } = require('./baseline/loader');
const { extractText } = require('./extractors/extract');
const { reviewPolicy } = require('./reviewers/review');
const { generateToolkit } = require('./generators/toolkit');
const { generateReviewDocument } = require('./generators/review-document');
const { compileRulePack } = require('./rulepack/compile');
const { scanText } = require('./rulepack/scan');
const { validateRulePack } = require('./rulepack/rulepack');
const { toSarif, toOcsf, toSigma } = require('./emitters/emitters');
const { toPurviewSIT, toNetskopeDLP, toZscalerDLP, toGenericDictionary, toDlpPack } = require('./emitters/dlp-packs');
const { snapshotReview, diffSnapshots } = require('./drift/drift');
const incident = require('./incident/incident');

module.exports = {
  loadBaseline,
  extractText,
  reviewPolicy,
  generateToolkit,
  generateReviewDocument,
  compileRulePack,
  scanText,
  validateRulePack,
  toSarif,
  toOcsf,
  toSigma,
  toPurviewSIT,
  toNetskopeDLP,
  toZscalerDLP,
  toGenericDictionary,
  toDlpPack,
  snapshotReview,
  diffSnapshots,
  incident,

  /**
   * One-shot pipeline: text → review → toolkit
   * @param {object} opts
   * @param {string} opts.policyText - Normalized policy text
   * @param {string} opts.baselineId - e.g. 'ai-usage-policy'
   * @param {object} opts.stack - Stack profile (see docs/stack-profile.md)
   * @returns {Promise<{review, toolkit}>}
   */
  async run(opts) {
    const baseline = await loadBaseline(opts.baselineId || 'ai-usage-policy');
    const review = reviewPolicy(opts.policyText, baseline);
    const toolkit = generateToolkit({ review, baseline, stack: opts.stack });
    return { review, toolkit };
  }
};
