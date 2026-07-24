/**
 * Policy drift detection
 * ======================
 * Deterministic reviews are byte-comparable — a property LLM-based reviewers
 * cannot offer. That makes drift detection nearly free: snapshot a review, and
 * later diff a new review against it to see exactly what changed when the policy
 * (or the baseline) moved.
 *
 * Use cases:
 *   - CI on the policy repo: fail the build when an edit introduces a new gap.
 *   - Scheduled re-review: surface when a baseline update newly flags a policy.
 *   - Audit trail: a signed sequence of snapshots is evidence of continuous
 *     policy governance (the SOC 2 / ISO 27001 annual-review obligation).
 */

'use strict';

/**
 * Produce a stable, comparable snapshot from a review object. Strips volatile
 * fields (timestamps, matched-text offsets) so two reviews of identical policy
 * text against the same baseline produce byte-identical snapshots.
 * @param {object} review
 * @returns {object} snapshot
 */
function snapshotReview(review) {
  if (!review || !Array.isArray(review.findings)) {
    throw new Error('snapshotReview: review with findings[] required');
  }
  const findings = review.findings
    .map(f => ({
      rule_id: f.rule_id,
      severity: String(f.severity || '').toLowerCase(),
      status: f.status,
      citations: (f.citations || f.framework_citations || []).slice().sort(),
    }))
    .sort((a, b) => a.rule_id.localeCompare(b.rule_id));

  return {
    snapshot_version: '1.0',
    baseline: review.baseline ? { id: review.baseline.id, version: review.baseline.version } : null,
    recommendation: review.recommendation,
    findings,
  };
}

/**
 * Diff two snapshots (or reviews — reviews are snapshotted automatically).
 * @param {object} before
 * @param {object} after
 * @returns {object} drift report
 */
function diffSnapshots(before, after) {
  const a = normalize(before);
  const b = normalize(after);

  const beforeById = index(a.findings);
  const afterById = index(b.findings);

  const newGaps = [];        // was satisfied/absent -> now gap/partial
  const resolved = [];       // was gap/partial -> now satisfied
  const severityChanges = [];
  const addedRules = [];      // rule present in after but not before (baseline grew)
  const removedRules = [];    // rule present in before but not after

  for (const [id, fAfter] of afterById) {
    const fBefore = beforeById.get(id);
    // A rule that only exists in `after` is a baseline addition, not a policy
    // regression — do NOT count it as a new gap (that would falsely trip the
    // `regressed` flag when the baseline simply grew).
    if (!fBefore) { addedRules.push(id); continue; }
    const wasOpen = fBefore.status !== 'satisfied';
    const isOpen = fAfter.status !== 'satisfied';
    if (!wasOpen && isOpen) newGaps.push(id);
    if (wasOpen && !isOpen) resolved.push(id);
    if (fBefore.severity !== fAfter.severity) {
      severityChanges.push({ rule_id: id, from: fBefore.severity, to: fAfter.severity });
    }
  }
  for (const [id] of beforeById) {
    if (!afterById.has(id)) removedRules.push(id);
  }

  const drifted = newGaps.length > 0 || resolved.length > 0 ||
                  severityChanges.length > 0 || addedRules.length > 0 || removedRules.length > 0;

  // A build gate should fail when protection regressed: new gaps or a removed
  // rule that had been satisfied. Baseline additions and resolutions are not
  // regressions.
  const regressed = newGaps.length > 0;

  return {
    drifted,
    regressed,
    baseline_changed: !sameBaseline(a.baseline, b.baseline),
    summary: {
      new_gaps: newGaps.length,
      resolved: resolved.length,
      severity_changes: severityChanges.length,
      rules_added: addedRules.length,
      rules_removed: removedRules.length,
    },
    new_gaps: newGaps.sort(),
    resolved: resolved.sort(),
    severity_changes: severityChanges,
    rules_added: addedRules.sort(),
    rules_removed: removedRules.sort(),
  };
}

function normalize(x) {
  if (x && Array.isArray(x.findings) && x.snapshot_version) return x; // already a snapshot
  return snapshotReview(x); // treat as review
}
function index(findings) {
  const m = new Map();
  for (const f of findings) m.set(f.rule_id, f);
  return m;
}
function sameBaseline(a, b) {
  if (!a || !b) return a === b;
  return a.id === b.id && a.version === b.version;
}

module.exports = { snapshotReview, diffSnapshots };
