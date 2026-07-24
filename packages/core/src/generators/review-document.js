/**
 * Review document generator
 * -------------------------
 * Produces a structured review document from a review object. Two outputs:
 *   - markdown: lightweight, suitable for GitHub PRs / wiki
 *   - data:     the underlying findings, useful for the web UI
 *
 * The Word (.docx) generator is in a separate module (review-docx.js) because
 * it requires the `docx` library; we keep it optional so the core engine
 * works even if `docx` isn't installed (e.g. in browser bundlers).
 */

function generateReviewDocument(review, opts = {}) {
  const orgName = opts.org_name || 'Your Organization';
  const md = renderMarkdown(review, orgName);
  return {
    markdown: md,
    data: review
  };
}

function renderMarkdown(review, orgName) {
  const sev = review.summary.by_severity;
  const totalCritical = sev.Critical.gap + sev.Critical.partial + sev.Critical.satisfied;
  const totalHigh = sev.High.gap + sev.High.partial + sev.High.satisfied;
  const totalMedium = sev.Medium.gap + sev.Medium.partial + sev.Medium.satisfied;

  const recommendationText = {
    material_revision_required: '**Material revision recommended before adoption.** One or more Critical observations should be resolved.',
    material_revision_recommended: '**Material revision recommended before next adoption cycle.** Multiple High-severity gaps were identified.',
    targeted_revision_recommended: 'Targeted revision recommended in the next planned update.',
    minor_improvements_only: 'Policy is well-aligned with the baseline. Only minor improvements suggested.'
  }[review.recommendation];

  const lines = [];
  lines.push(`# Pre-Adoption Review`);
  lines.push(``);
  lines.push(`**Organization:** ${orgName}`);
  lines.push(`**Reviewed against:** ${review.baseline.name} v${review.baseline.version}`);
  lines.push(`**Reviewed at:** ${review.reviewed_at}`);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);
  lines.push(`## Summary`);
  lines.push(``);
  lines.push(`${recommendationText}`);
  lines.push(``);
  lines.push(`| Severity | Total rules | Satisfied | Partial | Gap |`);
  lines.push(`|---|---|---|---|---|`);
  lines.push(`| Critical | ${totalCritical} | ${sev.Critical.satisfied} | ${sev.Critical.partial} | ${sev.Critical.gap} |`);
  lines.push(`| High     | ${totalHigh}     | ${sev.High.satisfied}     | ${sev.High.partial}     | ${sev.High.gap} |`);
  lines.push(`| Medium   | ${totalMedium}   | ${sev.Medium.satisfied}   | ${sev.Medium.partial}   | ${sev.Medium.gap} |`);
  lines.push(``);

  // Group findings by category
  const byCategory = {};
  for (const f of review.findings) {
    if (!byCategory[f.category]) byCategory[f.category] = [];
    byCategory[f.category].push(f);
  }

  lines.push(`## Findings by category`);
  lines.push(``);

  for (const [category, items] of Object.entries(byCategory)) {
    lines.push(`### ${category}`);
    lines.push(``);
    for (const f of items) {
      const statusEmoji = f.status === 'satisfied' ? '✓' : f.status === 'partial' ? '◐' : '✗';
      const sevLabel = `[${f.severity}]`;
      lines.push(`#### ${statusEmoji} ${sevLabel} ${f.title}`);
      lines.push(``);
      lines.push(`*Rule ID: \`${f.rule_id}\`* — *Status: ${f.status}*`);
      lines.push(``);
      lines.push(f.description.trim());
      lines.push(``);

      if (f.status === 'satisfied' && f.positive_matches.length > 0) {
        lines.push(`**Evidence found:** "${f.positive_matches[0].matched_text}"`);
        lines.push(``);
      } else if (f.status === 'partial') {
        lines.push(`**Partial coverage** — policy mentions the topic but a passing reference may not constitute full coverage.`);
        if (f.positive_matches[0]) {
          lines.push(`Matched: "${f.positive_matches[0].matched_text}"`);
        }
        lines.push(``);
      } else {
        lines.push(`**Gap:** the policy does not appear to address this requirement.`);
        lines.push(``);
        lines.push(`**Suggested resolution:**`);
        lines.push(``);
        lines.push(f.suggested_resolution.trim().split('\n').map(l => '> ' + l).join('\n'));
        lines.push(``);
      }

      lines.push(`*Cited frameworks: ${f.citations.join(', ')}*`);
      lines.push(``);
      lines.push(`---`);
      lines.push(``);
    }
  }

  lines.push(``);
  lines.push(`## How to read this review`);
  lines.push(``);
  lines.push(`PolicyForge applies a transparent, citable baseline to your policy text. Every observation references named frameworks (NIST AI RMF, OWASP LLM Top 10, ISO 42001, EU AI Act).`);
  lines.push(``);
  lines.push(`**False positives are possible.** A "satisfied" status means the reviewer found text matching the rule's evidence pattern — not that a human security expert has verified the coverage is sufficient. Use this review as input to a human review, not as a substitute for one.`);
  lines.push(``);
  lines.push(`**False negatives are possible.** A "gap" means the reviewer did not find pattern matches — but your policy may address the requirement via wording the pattern didn't catch. Review each gap with that in mind, and consider proposing pattern improvements to the PolicyForge project.`);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);
  lines.push(`*Generated by PolicyForge v0.1. Open source under Apache-2.0. Not legal advice.*`);

  return lines.join('\n');
}

module.exports = { generateReviewDocument };
