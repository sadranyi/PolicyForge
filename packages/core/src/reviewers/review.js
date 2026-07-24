/**
 * Reviewer
 * --------
 * Applies a baseline's rules to a normalized policy text and returns a
 * structured review object.
 *
 * For each rule, the reviewer checks whether the policy's text contains
 * evidence of addressing the rule. The check is deliberately conservative:
 *
 *   - "Satisfied" means the policy's text matches one of the rule's
 *     positive evidence_patterns AND no negative pattern fired.
 *   - "Gap" means no positive pattern matched.
 *
 * False positives (rule satisfied when it isn't really) and false negatives
 * (gap flagged when it shouldn't be) are both possible. The review document
 * we produce explicitly invites human verification — this tool is a
 * starting point, not an endpoint.
 *
 * Match algorithm:
 *   - Patterns are interpreted as case-insensitive regex
 *   - Match is against the *full normalized text* (not line-by-line)
 *   - We record the matched substring as evidence in the output
 */

function reviewPolicy(policyText, baseline) {
  if (typeof policyText !== 'string') {
    throw new Error('reviewPolicy: policyText must be a string');
  }
  if (!baseline?.rules) {
    throw new Error('reviewPolicy: baseline must include rules');
  }

  const normalized = policyText.replace(/\r\n/g, '\n');
  const lower = normalized.toLowerCase();
  const findings = [];

  for (const rule of baseline.rules) {
    const positiveMatches = [];
    const negativeMatches = [];

    // Test positive patterns
    for (const pattern of rule.evidence_patterns?.positive || []) {
      try {
        const re = new RegExp(pattern, 'gi');
        const m = re.exec(normalized);
        if (m) {
          positiveMatches.push({
            pattern,
            matched_text: trimMatch(m[0]),
            offset: m.index
          });
        }
      } catch (err) {
        // Bad regex in baseline — fail loudly during validation, not silently here
        throw new Error(`Rule ${rule.id}: invalid positive pattern "${pattern}": ${err.message}`);
      }
    }

    // Test negative patterns (signals that *appear* to address the rule but don't)
    for (const pattern of rule.evidence_patterns?.negative || []) {
      try {
        const re = new RegExp(pattern, 'gi');
        const m = re.exec(normalized);
        if (m) {
          negativeMatches.push({
            pattern,
            matched_text: trimMatch(m[0]),
            offset: m.index
          });
        }
      } catch (err) {
        throw new Error(`Rule ${rule.id}: invalid negative pattern "${pattern}": ${err.message}`);
      }
    }

    // Determine status
    let status;
    if (positiveMatches.length > 0 && negativeMatches.length === 0) {
      status = 'satisfied';
    } else if (positiveMatches.length > 0 && negativeMatches.length > 0) {
      // The policy mentions the topic but the negative pattern suggests it's
      // a passing reference rather than an actual definition. Flag for review.
      status = 'partial';
    } else {
      status = 'gap';
    }

    findings.push({
      rule_id: rule.id,
      title: rule.title,
      category: rule.category,
      severity: rule.severity,
      citations: rule.citations,
      status,
      positive_matches: positiveMatches,
      negative_matches: negativeMatches,
      description: rule.description,
      suggested_resolution: rule.suggested_resolution
    });
  }

  // Roll-up summary
  const summary = {
    total: findings.length,
    by_status: {
      satisfied: findings.filter(f => f.status === 'satisfied').length,
      partial: findings.filter(f => f.status === 'partial').length,
      gap: findings.filter(f => f.status === 'gap').length
    },
    by_severity: {
      Critical: { satisfied: 0, partial: 0, gap: 0 },
      High: { satisfied: 0, partial: 0, gap: 0 },
      Medium: { satisfied: 0, partial: 0, gap: 0 },
      Low: { satisfied: 0, partial: 0, gap: 0 }
    }
  };
  for (const f of findings) {
    if (summary.by_severity[f.severity]) {
      summary.by_severity[f.severity][f.status]++;
    }
  }

  // Recommendation: if any Critical or High gaps exist, recommend revision
  const criticalGaps = findings.filter(f => f.severity === 'Critical' && f.status !== 'satisfied').length;
  const highGaps = findings.filter(f => f.severity === 'High' && f.status !== 'satisfied').length;

  let recommendation;
  if (criticalGaps > 0) {
    recommendation = 'material_revision_required';
  } else if (highGaps >= 3) {
    recommendation = 'material_revision_recommended';
  } else if (highGaps > 0) {
    recommendation = 'targeted_revision_recommended';
  } else {
    recommendation = 'minor_improvements_only';
  }

  return {
    baseline: {
      id: baseline.baseline.id,
      name: baseline.baseline.name,
      version: baseline.baseline.version,
      citations: baseline.baseline.citations
    },
    reviewed_at: new Date().toISOString(),
    summary,
    recommendation,
    findings
  };
}

function trimMatch(text, maxLen = 120) {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  return t.length > maxLen ? t.slice(0, maxLen) + '…' : t;
}

module.exports = { reviewPolicy };
