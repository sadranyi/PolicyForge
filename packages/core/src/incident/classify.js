/**
 * Deterministic severity classification (SEV1–SEV4)
 * ================================================
 * Implements the decision table from the Implementation Spec. Inputs are derived
 * from the incident's signals into four ordinal factors plus one boolean, then a
 * top-down rule table assigns severity. Each branch records a cited rationale.
 *
 * Factors:
 *   D = data sensitivity   (0 none .. 3 regulated-sensitive: PHI/PCI/special/gov)
 *   V = volume             (0 unknown/0 .. 3 for >=500 records)
 *   S = system criticality (0 none .. 4 a CRITICAL system compromised)
 *   R = regulatory regimes in scope (count-ish, 0..3)
 *   X = confirmed exfiltration (boolean)
 */

'use strict';

const REGULATED_SENSITIVE = new Set(['PHI', 'PCI_CHD', 'SPECIAL_CATEGORY', 'GOV_CLASSIFIED', 'BIOMETRIC', 'CHILDREN']);
const ORDINARY_SENSITIVE = new Set(['PII', 'FINANCIAL', 'CREDENTIALS', 'IP_CONFIDENTIAL']);
const CRIT_RANK = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

function deriveFactors(record) {
  const s = record.signals || {};
  const classes = s.dataClasses || [];

  let D = 0;
  if (classes.some(c => REGULATED_SENSITIVE.has(c))) D = 3;
  else if (classes.some(c => ORDINARY_SENSITIVE.has(c))) D = 2;
  else if (classes.length && !(classes.length === 1 && classes[0] === 'NONE')) D = 1;

  const rc = s.recordCount;
  let V = 0;
  if (rc != null) {
    if (rc >= 500) V = 3;
    else if (rc >= 100) V = 2;
    else if (rc > 0) V = 1;
  }

  let S = 0;
  for (const sys of s.affectedSystems || []) {
    S = Math.max(S, CRIT_RANK[sys.criticality] || 0);
  }

  const oc = record.orgContext || {};
  let R = 0;
  if (oc.gdprApplies) R++;
  if (oc.isSecRegistrant) R++;
  if (oc.hipaaRole && oc.hipaaRole !== 'NONE') R++;
  if (oc.nis2Entity && oc.nis2Entity !== 'NONE') R++;
  if (oc.processesCardholderData) R++;
  R = Math.min(R, 3);

  const X = s.confirmedExfiltration === true;

  return { D, V, S, R, X };
}

/**
 * @param {object} record incident record (needs signals + orgContext)
 * @returns {{severity, rationale, factors}}
 */
function classifySeverity(record) {
  const f = deriveFactors(record);
  const { D, V, S, R, X } = f;
  let severity, rationale;

  if (X && D >= 3) {
    severity = 'SEV1';
    rationale = 'Confirmed exfiltration of regulated-sensitive data (NIST 800-61 information impact = breach of regulated info; ISO 27035 high impact).';
  } else if (S === 4 && (X || D >= 3)) {
    severity = 'SEV1';
    rationale = 'A CRITICAL system is compromised alongside sensitive-data loss (NIST 800-61 functional impact = critical).';
  } else if (D >= 3 && V >= 3) {
    severity = 'SEV2';
    rationale = 'Regulated-sensitive data at ≥500-record scale (HIPAA/state ≥500 escalation; NIST information impact).';
  } else if (X && D === 2) {
    severity = 'SEV2';
    rationale = 'Confirmed exfiltration of ordinary PII/financial data (confirmed loss of confidentiality).';
  } else if (S >= 3 && R >= 2) {
    severity = 'SEV2';
    rationale = 'High/critical system affected with multi-regime regulatory exposure (NIST functional impact).';
  } else if (D >= 2 || V >= 2 || S >= 2 || R >= 2) {
    severity = 'SEV3';
    rationale = 'Moderate impact: regulated data or notable systems in scope (NIST moderate information/functional impact).';
  } else {
    severity = 'SEV4';
    rationale = 'Low functional and information impact (NIST 800-61 low prioritization).';
  }

  return { severity, rationale, factors: f };
}

module.exports = { classifySeverity, deriveFactors };
