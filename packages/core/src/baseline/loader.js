/**
 * Baseline loader
 * ---------------
 * Reads a baseline YAML file and returns a validated, normalized object.
 * Validation is intentional and strict — a malformed baseline causes
 * unpredictable review output, which is much worse than a clear error.
 */

const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

/**
 * Load a baseline by id (e.g., 'ai-usage-policy') or by absolute path.
 */
async function loadBaseline(idOrPath) {
  const candidatePath = idOrPath.endsWith('.yaml') || idOrPath.endsWith('.yml')
    ? idOrPath
    : path.join(__dirname, '..', '..', 'baseline-data', `${idOrPath}.yaml`);

  if (!fs.existsSync(candidatePath)) {
    throw new Error(`Baseline not found: ${candidatePath}`);
  }

  const raw = fs.readFileSync(candidatePath, 'utf8');
  const parsed = YAML.parse(raw);

  validateBaseline(parsed, candidatePath);
  return parsed;
}

function validateBaseline(b, filePath) {
  const errors = [];

  if (!b.baseline) errors.push('missing top-level "baseline" object');
  if (!b.baseline?.id) errors.push('baseline.id is required');
  if (!b.baseline?.name) errors.push('baseline.name is required');
  if (!Array.isArray(b.baseline?.citations) || b.baseline.citations.length === 0) {
    errors.push('baseline.citations must be a non-empty array');
  }
  if (!Array.isArray(b.rules) || b.rules.length === 0) {
    errors.push('rules must be a non-empty array');
  }

  if (b.rules) {
    const citationIds = new Set((b.baseline?.citations || []).map(c => c.id));
    const seenRuleIds = new Set();

    b.rules.forEach((rule, i) => {
      const prefix = `rule[${i}]${rule.id ? ` (${rule.id})` : ''}`;

      if (!rule.id) errors.push(`${prefix}: id is required`);
      if (rule.id && seenRuleIds.has(rule.id)) {
        errors.push(`${prefix}: duplicate rule id`);
      }
      if (rule.id) seenRuleIds.add(rule.id);

      if (!rule.title) errors.push(`${prefix}: title is required`);
      if (!rule.severity) errors.push(`${prefix}: severity is required`);
      if (rule.severity && !['Critical', 'High', 'Medium', 'Low'].includes(rule.severity)) {
        errors.push(`${prefix}: severity must be Critical|High|Medium|Low (got "${rule.severity}")`);
      }

      // Citations are MANDATORY — this is the project's defensibility
      if (!Array.isArray(rule.citations) || rule.citations.length === 0) {
        errors.push(`${prefix}: at least one citation is required`);
      }
      (rule.citations || []).forEach(cid => {
        if (!citationIds.has(cid)) {
          errors.push(`${prefix}: citation "${cid}" not declared in baseline.citations`);
        }
      });

      if (!rule.evidence_patterns?.positive || !Array.isArray(rule.evidence_patterns.positive)) {
        errors.push(`${prefix}: evidence_patterns.positive must be an array`);
      }

      if (!rule.suggested_resolution) {
        errors.push(`${prefix}: suggested_resolution is required`);
      }
    });
  }

  if (errors.length > 0) {
    const msg = `Baseline validation failed for ${filePath}:\n  - ${errors.join('\n  - ')}`;
    const err = new Error(msg);
    err.validationErrors = errors;
    throw err;
  }
}

module.exports = { loadBaseline, validateBaseline };
