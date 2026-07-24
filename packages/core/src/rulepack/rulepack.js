/**
 * PolicyForge Rule Pack
 * =====================
 * The canonical, versioned rule format that every PolicyForge surface compiles
 * from. One primitive — a named rule with a deterministic pattern, a severity,
 * an enforcement action, and (uniquely to PolicyForge) framework citations and
 * control-ID mappings — feeds the reviewer, the runtime scan engine, the MCP
 * server, and every emitter (SARIF / OCSF / Sigma / DLP packs).
 *
 * Two rule kinds live in one pack:
 *   - kind: "review"   — evidence patterns that detect whether a POLICY DOCUMENT
 *                        addresses a requirement (drives `policyforge review`).
 *   - kind: "runtime"  — content patterns that detect sensitive data / policy
 *                        violations in ARBITRARY TEXT at runtime (drives the
 *                        scan engine, content guard, MCP server, DLP packs).
 *
 * The compiler (compile.js) builds a pack from the existing baselines and the
 * content-guard detection set, so there is exactly one source of truth.
 *
 * Design invariants (enforced by validateRulePack):
 *   - every rule has at least one framework citation (the moat)
 *   - every rule has a severity in the canonical set
 *   - every runtime rule declares an action verb
 *   - every pattern compiles as a JS regex
 */

'use strict';

const SEVERITIES = ['critical', 'high', 'medium', 'low'];

// Runtime action verbs. Deliberately small and aligned with what chat-DLP
// products expose so downstream emitters can map cleanly. This is a PolicyForge
// convention, not a formal standard.
const ACTIONS = ['block', 'redact', 'coach', 'flag'];

const RULEPACK_FORMAT_VERSION = '1.0';

/**
 * Normalize a severity string to the canonical lowercase set.
 * Accepts "Critical"/"critical"/"CRITICAL" etc.
 */
function normalizeSeverity(sev) {
  if (!sev) return 'medium';
  const s = String(sev).toLowerCase();
  return SEVERITIES.includes(s) ? s : 'medium';
}

/**
 * Default enforcement action derived from severity, used when a runtime rule
 * does not specify one explicitly.
 *   critical -> block, high -> block, medium -> flag, low -> flag
 */
function defaultActionForSeverity(sev) {
  const s = normalizeSeverity(sev);
  return (s === 'critical' || s === 'high') ? 'block' : 'flag';
}

/**
 * Strict validation. Throws on the first structural problem with a precise
 * message — a malformed pack is far worse than a loud failure.
 */
function validateRulePack(pack) {
  const errors = [];
  if (!pack || typeof pack !== 'object') {
    throw new Error('validateRulePack: pack must be an object');
  }
  if (pack.format_version !== RULEPACK_FORMAT_VERSION) {
    errors.push(`format_version must be "${RULEPACK_FORMAT_VERSION}" (got "${pack.format_version}")`);
  }
  if (!Array.isArray(pack.citations) || pack.citations.length === 0) {
    errors.push('citations must be a non-empty array');
  }
  if (!Array.isArray(pack.rules) || pack.rules.length === 0) {
    errors.push('rules must be a non-empty array');
  }

  const citationIds = new Set((pack.citations || []).map(c => c.id));
  const seen = new Set();

  (pack.rules || []).forEach((r, i) => {
    const prefix = `rule[${i}]${r && r.rule_id ? ` (${r.rule_id})` : ''}`;
    if (!r || typeof r !== 'object') { errors.push(`${prefix}: not an object`); return; }
    if (!r.rule_id) errors.push(`${prefix}: rule_id is required`);
    if (r.rule_id && seen.has(r.rule_id)) errors.push(`${prefix}: duplicate rule_id`);
    if (r.rule_id) seen.add(r.rule_id);

    if (!['review', 'runtime'].includes(r.kind)) {
      errors.push(`${prefix}: kind must be "review" or "runtime" (got "${r.kind}")`);
    }
    if (!SEVERITIES.includes(r.severity)) {
      errors.push(`${prefix}: severity must be one of ${SEVERITIES.join('|')} (got "${r.severity}")`);
    }
    if (!Array.isArray(r.framework_citations) || r.framework_citations.length === 0) {
      errors.push(`${prefix}: at least one framework_citation is required`);
    }
    (r.framework_citations || []).forEach(cid => {
      if (!citationIds.has(cid)) errors.push(`${prefix}: citation "${cid}" not declared in pack.citations`);
    });

    if (r.kind === 'runtime') {
      if (!ACTIONS.includes(r.action)) {
        errors.push(`${prefix}: runtime rule action must be one of ${ACTIONS.join('|')} (got "${r.action}")`);
      }
      if (!Array.isArray(r.patterns) || r.patterns.length === 0) {
        errors.push(`${prefix}: runtime rule must have at least one pattern`);
      }
    } else {
      // review rule
      const pos = r.patterns && r.patterns.positive;
      if (!Array.isArray(pos)) {
        errors.push(`${prefix}: review rule patterns.positive must be an array`);
      }
    }

    // All patterns must compile
    const allPatterns = r.kind === 'runtime'
      ? (r.patterns || [])
      : [...((r.patterns && r.patterns.positive) || []), ...((r.patterns && r.patterns.negative) || [])];
    for (const p of allPatterns) {
      try { new RegExp(p, 'gi'); }
      catch (e) { errors.push(`${prefix}: invalid pattern "${p}": ${e.message}`); }
    }
  });

  if (errors.length) {
    const err = new Error(`Rule pack validation failed:\n  - ${errors.join('\n  - ')}`);
    err.validationErrors = errors;
    throw err;
  }
  return true;
}

module.exports = {
  SEVERITIES,
  ACTIONS,
  RULEPACK_FORMAT_VERSION,
  normalizeSeverity,
  defaultActionForSeverity,
  validateRulePack,
};
