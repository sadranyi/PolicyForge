/**
 * DLP pattern-pack exporters (the browser bridge)
 * ===============================================
 * The pain evidence is dominated by non-developer employees pasting sensitive
 * data into browser chatbots — a vector PolicyForge's own surfaces (hooks, MCP,
 * sidecar) don't reach. The bridge: export PolicyForge's runtime detection rules
 * as import packs for the enterprise DLP tools that DO own the browser, so the
 * customer's policy stays the single source of truth even where PolicyForge is
 * not the enforcement point.
 *
 * Targets:
 *   - Microsoft Purview  — custom Sensitive Information Type (SIT) definitions.
 *   - Netskope           — custom DLP regex dictionary/entities (JSON).
 *   - Zscaler            — custom DLP dictionary (JSON, phrase/pattern list).
 *   - generic            — a portable regex dictionary any tool can adapt.
 *
 * All exporters read the SAME runtime rules from a compiled rule pack, so the
 * browser-layer config and the commit/agent-layer enforcement derive from one
 * source.
 */

'use strict';

function runtimeRules(pack) {
  if (!pack || !Array.isArray(pack.rules)) throw new Error('DLP export: compiled rule pack required');
  return pack.rules.filter(r => r.kind === 'runtime');
}

const CONFIDENCE = { critical: 85, high: 75, medium: 65, low: 55 };

/**
 * Microsoft Purview custom Sensitive Information Types.
 * Returns an object shaped like a Purview SIT rule package (JSON representation
 * of the rulepackage the admin imports; the admin converts to XML or uses the
 * Graph API). One entity per runtime rule; each pattern becomes a regex.
 */
function toPurviewSIT(pack) {
  const rules = runtimeRules(pack);
  return {
    rulePackage: {
      name: 'PolicyForge Sensitive Information Types',
      description: 'Generated from PolicyForge runtime rules. Each entity maps to a framework citation.',
      version: '0.2.0',
      entities: rules.map(r => ({
        id: r.rule_id,
        name: r.description,
        recommendedConfidence: CONFIDENCE[r.severity] || 65,
        patterns: r.patterns.map((p, i) => ({
          confidenceLevel: CONFIDENCE[r.severity] || 65,
          idMatch: { regex: p, index: i },
        })),
        metadata: { severity: r.severity, frameworks: r.framework_citations, controls: r.controls || {} },
      })),
    },
  };
}

/**
 * Netskope custom DLP entities (JSON). Netskope custom DLP supports regex-based
 * entities with a required minimum match count; we default to 1.
 */
function toNetskopeDLP(pack) {
  const rules = runtimeRules(pack);
  return {
    dlp_entities: rules.map(r => ({
      name: `PolicyForge_${r.rule_id}`,
      description: `${r.description} (${r.framework_citations.join(', ')})`,
      severity: r.severity,
      match_count_threshold: 1,
      patterns: r.patterns.map(p => ({ regex: p })),
    })),
  };
}

/**
 * Zscaler custom DLP dictionary (JSON). Zscaler dictionaries carry pattern
 * entries with a threshold "numOfMatches" and a phrase/pattern type.
 */
function toZscalerDLP(pack) {
  const rules = runtimeRules(pack);
  return {
    dlpDictionaries: rules.map(r => ({
      name: `PolicyForge ${r.rule_id}`,
      description: `${r.description} — ${r.framework_citations.join(', ')}`,
      confidenceThreshold: r.severity === 'critical' ? 'CONFIDENCE_HIGH' : r.severity === 'high' ? 'CONFIDENCE_MEDIUM' : 'CONFIDENCE_LOW',
      dictionaryType: 'PATTERNS_AND_PHRASES',
      patterns: r.patterns.map(p => ({ action: 'PATTERN_COUNT_TYPE_UNIQUE', pattern: p })),
    })),
  };
}

/**
 * Generic portable regex dictionary — any tool can adapt this. Keeps citations
 * so the mapping to frameworks survives the export.
 */
function toGenericDictionary(pack) {
  const rules = runtimeRules(pack);
  return {
    name: 'PolicyForge regex dictionary',
    version: '0.2.0',
    entries: rules.map(r => ({
      id: r.rule_id,
      description: r.description,
      severity: r.severity,
      action: r.action,
      patterns: r.patterns,
      frameworks: r.framework_citations,
      controls: r.controls || {},
    })),
  };
}

/**
 * Convenience dispatcher.
 * @param {object} pack compiled rule pack
 * @param {'purview'|'netskope'|'zscaler'|'generic'} target
 */
function toDlpPack(pack, target) {
  switch (String(target || '').toLowerCase()) {
    case 'purview': return toPurviewSIT(pack);
    case 'netskope': return toNetskopeDLP(pack);
    case 'zscaler': return toZscalerDLP(pack);
    case 'generic': return toGenericDictionary(pack);
    default: throw new Error(`toDlpPack: unknown target "${target}" (purview|netskope|zscaler|generic)`);
  }
}

module.exports = { toPurviewSIT, toNetskopeDLP, toZscalerDLP, toGenericDictionary, toDlpPack };
