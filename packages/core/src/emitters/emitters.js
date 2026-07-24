/**
 * Emitters
 * ========
 * Serialize a PolicyForge review (and/or scan findings) into the standard wire
 * formats SecOps and compliance teams already consume. Pure serialization over
 * the existing result objects — no new analysis, no network.
 *
 *   toSarif()  — SARIF 2.1.0: gaps surface as GitHub/Azure DevOps code-scanning
 *                alerts and flow into DefectDojo.
 *   toOcsf()   — OCSF Compliance Finding (class_uid 2003) events for SIEMs
 *                (Splunk, Sentinel, Google SecOps, Elastic).
 *   toSigma()  — Sigma detection rules from runtime rules, so PolicyForge can
 *                provision the detection stack the customer already owns.
 *
 * Every emitted record carries the framework citation — the property that makes
 * these outputs auditor-legible and that no generic scanner provides.
 */

'use strict';

const SARIF_LEVEL = { critical: 'error', high: 'error', medium: 'warning', low: 'note' };
// OCSF status_id: 1=New. compliance status_id: 1=Pass, 2=Fail (per OCSF compliance profile)
const OCSF_SEVERITY_ID = { critical: 5, high: 4, medium: 3, low: 2 };

function sevKey(s) { return String(s || 'medium').toLowerCase(); }

/**
 * SARIF 2.1.0 from a review object (from reviewPolicy).
 * Only non-satisfied findings (gap/partial) become results — those are the
 * actionable "problems" a code-scanning surface should show.
 * @param {object} review
 * @param {object} [opts] { toolVersion, policySource }
 */
function toSarif(review, opts = {}) {
  if (!review || !Array.isArray(review.findings)) {
    throw new Error('toSarif: review with findings[] required');
  }
  const version = opts.toolVersion || '0.2.0';
  const artifactUri = opts.policySource || 'policy';

  const ruleIndex = new Map();
  const rules = [];
  const results = [];

  for (const f of review.findings) {
    if (f.status === 'satisfied') continue;
    if (!ruleIndex.has(f.rule_id)) {
      ruleIndex.set(f.rule_id, rules.length);
      rules.push({
        id: f.rule_id,
        name: f.title || f.rule_id,
        shortDescription: { text: f.title || f.rule_id },
        fullDescription: { text: (f.description || f.title || '').trim() },
        helpUri: citationUri(f),
        properties: {
          severity: sevKey(f.severity),
          category: f.category,
          'security-severity': securitySeverityScore(f.severity),
          frameworks: f.citations || f.framework_citations || [],
        },
        defaultConfiguration: { level: SARIF_LEVEL[sevKey(f.severity)] || 'warning' },
      });
    }
    results.push({
      ruleId: f.rule_id,
      ruleIndex: ruleIndex.get(f.rule_id),
      level: SARIF_LEVEL[sevKey(f.severity)] || 'warning',
      message: {
        text: `${f.status === 'partial' ? 'Partially addressed' : 'Gap'}: ${f.title}. ` +
              `${(f.suggested_resolution || '').split('\n')[0].trim()} ` +
              `[frameworks: ${(f.citations || f.framework_citations || []).join(', ')}]`,
      },
      locations: [{
        physicalLocation: {
          artifactLocation: { uri: artifactUri },
          region: { startLine: 1 },
        },
      }],
      properties: { status: f.status, frameworks: f.citations || f.framework_citations || [] },
    });
  }

  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: {
        driver: {
          name: 'PolicyForge',
          informationUri: 'https://github.com/sadranyi/PolicyForge',
          version,
          rules,
        },
      },
      results,
    }],
  };
}

function securitySeverityScore(sev) {
  return ({ critical: '9.0', high: '7.0', medium: '4.0', low: '2.0' })[sevKey(sev)] || '4.0';
}

function citationUri(f) {
  const cites = f.citations || f.framework_citations || [];
  return cites.length ? `https://github.com/sadranyi/PolicyForge#${cites[0]}` : 'https://github.com/sadranyi/PolicyForge';
}

/**
 * OCSF Compliance Finding events (class_uid 2003) from a review.
 * One event per finding. Fixed timestamp must be injected by the caller (the
 * engine avoids Date.now for determinism/testability); defaults to 0.
 * @param {object} review
 * @param {object} [opts] { time (ms epoch), org }
 */
function toOcsf(review, opts = {}) {
  if (!review || !Array.isArray(review.findings)) {
    throw new Error('toOcsf: review with findings[] required');
  }
  const time = opts.time != null ? opts.time : 0;
  const org = opts.org || 'unknown';
  const baselineName = review.baseline && review.baseline.name;

  return review.findings.map(f => {
    const pass = f.status === 'satisfied';
    return {
      // OCSF metadata
      metadata: {
        version: '1.3.0',
        product: { name: 'PolicyForge', vendor_name: 'PolicyForge', version: opts.toolVersion || '0.2.0' },
      },
      class_uid: 2003,
      class_name: 'Compliance Finding',
      category_uid: 2,
      category_name: 'Findings',
      type_uid: 200301, // Compliance Finding: Create
      activity_id: 1,
      time,
      severity_id: OCSF_SEVERITY_ID[sevKey(f.severity)] || 3,
      severity: capitalize(sevKey(f.severity)),
      // Top-level Finding status is the lifecycle state (1=New); pass/fail is a
      // compliance concept and lives in the `compliance` object per the OCSF
      // Compliance Finding profile.
      status_id: 1,
      status: 'New',
      message: `${f.title} — ${f.status}`,
      finding_info: {
        title: f.title,
        uid: f.rule_id,
        desc: (f.description || '').trim(),
      },
      compliance: {
        control: f.rule_id,
        standards: f.citations || f.framework_citations || [],
        status: pass ? 'Pass' : 'Fail',
        status_detail: f.suggested_resolution ? f.suggested_resolution.split('\n')[0].trim() : undefined,
      },
      unmapped: {
        baseline: baselineName,
        category: f.category,
        org,
        controls: f.controls || {},
      },
    };
  });
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/**
 * Sigma detection rules from a compiled rule pack's runtime rules. Each Sigma
 * rule matches the runtime patterns against a generic message field, so a SOC
 * can convert them into Splunk/Sentinel/Elastic queries.
 * Returns an array of Sigma rule objects (YAML-serializable).
 * @param {object} pack compiled rule pack
 */
function toSigma(pack) {
  if (!pack || !Array.isArray(pack.rules)) throw new Error('toSigma: compiled rule pack required');
  const runtime = pack.rules.filter(r => r.kind === 'runtime');
  return runtime.map(r => {
    // Some patterns use PCRE lookaround, which RE2-based backends (Splunk,
    // Elastic, pySigma default) do not support. Flag those so the SOC knows to
    // adapt them rather than silently dropping the rule.
    const hasLookaround = r.patterns.some(p => /\(\?[=!<]/.test(p));
    const rule = {
      title: `PolicyForge: ${r.description}`,
      id: `policyforge-${r.rule_id.toLowerCase()}`,
      status: 'experimental',
      description: `${r.description}. Maps to ${r.framework_citations.join(', ')}.` +
        (hasLookaround ? ' NOTE: pattern uses regex lookaround; adapt for RE2-based backends (Splunk/Elastic).' : ''),
      references: ['https://github.com/sadranyi/PolicyForge'],
      tags: r.framework_citations.map(c => `policyforge.${c}`),
      logsource: { product: 'policyforge', service: 'ai-gateway' },
      detection: {
        // Sigma 're' modifier: value is a regular expression (PCRE).
        selection: { 'message|re': r.patterns },
        condition: 'selection',
      },
      level: mapSigmaLevel(r.severity),
      falsepositives: ['Legitimate content that structurally resembles the pattern'],
    };
    if (hasLookaround) rule.custom = { requires_pcre: true };
    return rule;
  });
}

function mapSigmaLevel(sev) {
  return ({ critical: 'critical', high: 'high', medium: 'medium', low: 'low' })[sevKey(sev)] || 'medium';
}

module.exports = { toSarif, toOcsf, toSigma };
