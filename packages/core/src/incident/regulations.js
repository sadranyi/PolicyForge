/**
 * Regulatory reporting rule packs
 * ===============================
 * One data-driven pack per regulation. Each exports:
 *   id, applies(record) -> boolean, buildDeadlines(record, ctx) -> Deadline[]
 *
 * Clock math is delegated to clock.js and all "now"/holiday inputs are injected
 * via ctx — nothing here calls Date.now(). Citations were verified 2026-07-24
 * (see docs/incident/FRD.md and the research notes). NOT LEGAL ADVICE.
 */

'use strict';

const clock = require('./clock');

const RETRIEVED = '2026-07-24';

function cite(ref, url) { return { ref, url, retrievedDate: RETRIEVED }; }

function mkDeadline(d) {
  return Object.assign({
    regulation: null, label: '', stage: null, clockBasis: 'CALENDAR_HOURS',
    amount: null, unit: null, startEvent: 'AWARENESS', startAt: null, dueAt: null,
    status: 'PENDING_TRIGGER', advisory: false, ruleStatus: null,
    whoToNotify: [], citation: null, notes: null,
  }, d);
}

// Resolve a start timestamp from the record for a given start event.
function startTime(record, event) {
  const t = record.timestamps || {};
  switch (event) {
    case 'AWARENESS': return t.awareAt || t.detectedAt || null;
    case 'DISCOVERY': return t.discoveredAt || t.awareAt || t.detectedAt || null;
    case 'MATERIALITY_DETERMINATION': return t.determinedMaterialAt || null;
    case 'RANSOM_PAYMENT': return t.ransomPaidAt || null;
    default: return null;
  }
}

function finalizeStatus(dl, ctx) {
  if (dl.advisory) { dl.status = 'ADVISORY'; return dl; }
  if (dl.startAt == null) { dl.status = 'PENDING_TRIGGER'; return dl; }
  if (dl.clockBasis === 'WITHOUT_UNDUE_DELAY' || dl.clockBasis === 'PROMPT') {
    dl.status = 'OPEN'; return dl; // narrative deadline, no numeric due date
  }
  if (dl.dueAt && ctx && ctx.now) {
    dl.status = clock.deadlineStatus(dl.dueAt, ctx.now, { dueSoonHours: ctx.dueSoonHours });
  } else {
    dl.status = 'OPEN';
  }
  return dl;
}

const PACKS = [
  // ---------- GDPR Art 33 & 34 ----------
  {
    id: 'GDPR',
    applies: r => (r.orgContext || {}).gdprApplies === true,
    buildDeadlines(r, ctx) {
      const start = startTime(r, 'AWARENESS');
      const risk = (r.humanDeterminations || {}).gdprRisk;
      const out = [];
      out.push(finalizeStatus(mkDeadline({
        regulation: 'GDPR_ART33', label: 'GDPR Art 33 – Supervisory authority notification',
        clockBasis: 'CALENDAR_HOURS', amount: 72, unit: 'hours', startEvent: 'AWARENESS',
        startAt: start, dueAt: start ? clock.addHours(start, 72) : null,
        whoToNotify: ['Lead supervisory authority (DPA)'],
        citation: cite('GDPR Art. 33(1)', 'https://gdpr-info.eu/art-33-gdpr/'),
        notes: risk === 'NO_RISK' ? 'May be exempt if unlikely to risk data-subject rights — counsel/DPO to confirm.' : null,
      }), ctx));
      // Art 34: to data subjects, without undue delay, only if high risk
      out.push(finalizeStatus(mkDeadline({
        regulation: 'GDPR_ART34', label: 'GDPR Art 34 – Communication to data subjects',
        clockBasis: 'WITHOUT_UNDUE_DELAY', startEvent: 'AWARENESS', startAt: start,
        whoToNotify: ['Affected data subjects'],
        citation: cite('GDPR Art. 34(1)', 'https://gdpr-info.eu/art-34-gdpr/'),
        notes: 'Required only where the breach is likely to result in a HIGH risk to individuals.',
      }), ctx));
      return out;
    },
  },
  // ---------- NIS2 (three stages) ----------
  {
    id: 'NIS2',
    applies: r => { const e = (r.orgContext || {}).nis2Entity; return e && e !== 'NONE'; },
    buildDeadlines(r, ctx) {
      const start = startTime(r, 'AWARENESS');
      const url = 'https://www.nis-2-directive.com/NIS_2_Directive_Article_23.html';
      return [
        finalizeStatus(mkDeadline({
          regulation: 'NIS2_EARLY', label: 'NIS2 – Early warning', stage: 'early-warning',
          clockBasis: 'CALENDAR_HOURS', amount: 24, unit: 'hours', startEvent: 'AWARENESS',
          startAt: start, dueAt: start ? clock.addHours(start, 24) : null,
          whoToNotify: ['CSIRT / competent authority'],
          citation: cite('NIS2 Art. 23(4)(a)', url),
        }), ctx),
        finalizeStatus(mkDeadline({
          regulation: 'NIS2_NOTIFY', label: 'NIS2 – Incident notification', stage: 'notification',
          clockBasis: 'CALENDAR_HOURS', amount: 72, unit: 'hours', startEvent: 'AWARENESS',
          startAt: start, dueAt: start ? clock.addHours(start, 72) : null,
          whoToNotify: ['CSIRT / competent authority'],
          citation: cite('NIS2 Art. 23(4)(b)', url),
        }), ctx),
        finalizeStatus(mkDeadline({
          regulation: 'NIS2_FINAL', label: 'NIS2 – Final report', stage: 'final',
          clockBasis: 'CALENDAR_DAYS', amount: 30, unit: 'days', startEvent: 'AWARENESS',
          startAt: start, dueAt: start ? clock.addMonths(start, 1) : null,
          whoToNotify: ['CSIRT / competent authority'],
          citation: cite('NIS2 Art. 23(4)(d) — one month', url),
          notes: 'One month after the incident notification.',
        }), ctx),
      ];
    },
  },
  // ---------- SEC Item 1.05 Form 8-K ----------
  {
    id: 'SEC',
    applies: r => (r.orgContext || {}).isSecRegistrant === true,
    buildDeadlines(r, ctx) {
      const material = (r.humanDeterminations || {}).materiality === 'MATERIAL';
      const start = material ? startTime(r, 'MATERIALITY_DETERMINATION') : null;
      const holidays = (ctx && ctx.holidays) || [];
      return [finalizeStatus(mkDeadline({
        regulation: 'SEC_8K_105', label: 'SEC Form 8-K Item 1.05 – Material cybersecurity incident',
        clockBasis: 'BUSINESS_DAYS', amount: 4, unit: 'days', startEvent: 'MATERIALITY_DETERMINATION',
        startAt: start, dueAt: start ? clock.addBusinessDays(start, 4, holidays) : null,
        whoToNotify: ['SEC (EDGAR Form 8-K)'],
        citation: cite('17 CFR 229.105 / Form 8-K Item 1.05',
          'https://www.sec.gov/resources-small-businesses/small-business-compliance-guides/cybersecurity-risk-management-strategy-governance-incident-disclosure'),
        notes: material ? '4 business days after materiality determination. Attorney-General national-security delay may apply (30+30+60 days).'
                        : 'Clock starts only once a MATERIAL determination is made (human decision).',
      }), ctx)];
    },
  },
  // ---------- HIPAA Breach Notification ----------
  {
    id: 'HIPAA',
    applies: r => { const role = (r.orgContext || {}).hipaaRole; return role && role !== 'NONE'; },
    buildDeadlines(r, ctx) {
      const start = startTime(r, 'DISCOVERY');
      const rc = (r.signals || {}).recordCount || 0;
      const large = rc >= 500;
      const out = [
        finalizeStatus(mkDeadline({
          regulation: 'HIPAA_INDIVIDUAL', label: 'HIPAA – Notification to affected individuals',
          clockBasis: 'CALENDAR_DAYS', amount: 60, unit: 'days', startEvent: 'DISCOVERY',
          startAt: start, dueAt: start ? clock.addDays(start, 60) : null,
          whoToNotify: ['Affected individuals'],
          citation: cite('45 CFR 164.404', 'https://www.hhs.gov/hipaa/for-professionals/breach-notification/index.html'),
          notes: 'Without unreasonable delay and no later than 60 calendar days from discovery.',
        }), ctx),
      ];
      out.push(finalizeStatus(mkDeadline({
        regulation: 'HIPAA_HHS', label: large ? 'HIPAA – HHS Secretary notice (contemporaneous, ≥500)' : 'HIPAA – HHS Secretary notice (annual log, <500)',
        clockBasis: large ? 'CALENDAR_DAYS' : 'CALENDAR_DAYS', amount: large ? 60 : null, unit: large ? 'days' : null,
        startEvent: 'DISCOVERY', startAt: start,
        dueAt: large && start ? clock.addDays(start, 60) : null,
        whoToNotify: ['HHS Office for Civil Rights'],
        citation: cite('45 CFR 164.408', 'https://www.hhs.gov/hipaa/for-professionals/breach-notification/index.html'),
        notes: large ? 'Contemporaneous with individual notice for breaches affecting 500+ individuals.'
                     : 'For breaches affecting <500 individuals, notify HHS within 60 days after the end of the calendar year.',
      }), ctx));
      if (large) {
        out.push(finalizeStatus(mkDeadline({
          regulation: 'HIPAA_MEDIA', label: 'HIPAA – Media notice (≥500 in a state/jurisdiction)',
          clockBasis: 'CALENDAR_DAYS', amount: 60, unit: 'days', startEvent: 'DISCOVERY',
          startAt: start, dueAt: start ? clock.addDays(start, 60) : null,
          whoToNotify: ['Prominent media outlets in the affected jurisdiction'],
          citation: cite('45 CFR 164.406', 'https://www.hhs.gov/hipaa/for-professionals/breach-notification/index.html'),
        }), ctx));
      }
      return out;
    },
  },
  // ---------- US State (California, representative) ----------
  {
    id: 'US_STATE_CA',
    applies: r => ((r.orgContext || {}).jurisdictions || []).includes('US-CA'),
    buildDeadlines(r, ctx) {
      const start = startTime(r, 'DISCOVERY');
      const rc = (r.signals || {}).recordCount || 0;
      const out = [finalizeStatus(mkDeadline({
        regulation: 'US_STATE_CA', label: 'California – Breach notice to residents',
        clockBasis: 'CALENDAR_DAYS', amount: 30, unit: 'days', startEvent: 'DISCOVERY',
        startAt: start, dueAt: start ? clock.addDays(start, 30) : null,
        whoToNotify: ['Affected California residents'],
        citation: cite('Cal. Civ. Code §1798.82 (SB 446, eff. 2026-01-01)',
          'https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?sectionNum=1798.82&lawCode=CIV'),
        notes: '30-day hard clock effective 2026-01-01. Confirm applicable version for the incident date with counsel.',
      }), ctx)];
      if (rc >= 500) {
        out.push(finalizeStatus(mkDeadline({
          regulation: 'US_STATE_CA', label: 'California – Attorney General notice (≥500 residents)',
          stage: 'ag', clockBasis: 'CALENDAR_DAYS', amount: 15, unit: 'days', startEvent: 'DISCOVERY',
          startAt: start, dueAt: start ? clock.addDays(start, 15) : null,
          whoToNotify: ['California Attorney General'],
          citation: cite('Cal. Civ. Code §1798.82(f)',
            'https://oag.ca.gov/privacy/databreach/reporting'),
        }), ctx));
      }
      return out;
    },
  },
  // ---------- PCI DSS ----------
  {
    id: 'PCI',
    applies: r => (r.orgContext || {}).processesCardholderData === true,
    buildDeadlines(r, ctx) {
      const start = startTime(r, 'DISCOVERY');
      return [finalizeStatus(mkDeadline({
        regulation: 'PCI_DSS', label: 'PCI DSS – Notify acquirer / card brands',
        clockBasis: 'PROMPT', startEvent: 'DISCOVERY', startAt: start,
        whoToNotify: ['Acquiring bank', 'Card brands (Visa/Mastercard/etc.)', 'Engage a PCI Forensic Investigator'],
        citation: cite('PCI DSS Req. 12.10 / brand breach programs',
          'https://blog.pcisecuritystandards.org/updated-guidance-responding-to-a-data-breach'),
        notes: 'Notify promptly per acquirer/brand agreements; timelines are contractual, not a fixed statutory clock.',
      }), ctx)];
    },
  },
  // ---------- CIRCIA (advisory: not yet in force) ----------
  {
    id: 'CIRCIA',
    applies: r => !!(r.orgContext || {}).criticalInfraSector,
    buildDeadlines(r, ctx) {
      const aware = startTime(r, 'AWARENESS');
      const ransom = startTime(r, 'RANSOM_PAYMENT');
      const url = 'https://www.federalregister.gov/documents/2024/04/04/2024-06526/cyber-incident-reporting-for-critical-infrastructure-act-circia-reporting-requirements';
      return [
        finalizeStatus(mkDeadline({
          regulation: 'CIRCIA_INCIDENT', label: 'CIRCIA – Covered cyber incident report (ADVISORY)',
          clockBasis: 'CALENDAR_HOURS', amount: 72, unit: 'hours', startEvent: 'AWARENESS',
          startAt: aware, dueAt: aware ? clock.addHours(aware, 72) : null,
          advisory: true, ruleStatus: 'NPRM; final rule pending (~2026), not yet in force',
          whoToNotify: ['CISA'], citation: cite('CIRCIA NPRM (6 CFR Part 226)', url),
        }), ctx),
        finalizeStatus(mkDeadline({
          regulation: 'CIRCIA_RANSOM', label: 'CIRCIA – Ransom payment report (ADVISORY)',
          clockBasis: 'CALENDAR_HOURS', amount: 24, unit: 'hours', startEvent: 'RANSOM_PAYMENT',
          startAt: ransom, dueAt: ransom ? clock.addHours(ransom, 24) : null,
          advisory: true, ruleStatus: 'NPRM; final rule pending (~2026), not yet in force',
          whoToNotify: ['CISA'], citation: cite('CIRCIA NPRM (6 CFR Part 226)', url),
        }), ctx),
      ];
    },
  },
];

/**
 * Compute all applicable deadlines for a record.
 * @param {object} record
 * @param {object} ctx { now (ISO, injected), holidays: [YYYY-MM-DD], dueSoonHours, includeAdvisory }
 */
function computeDeadlines(record, ctx = {}) {
  const includeAdvisory = ctx.includeAdvisory !== false;
  const deadlines = [];
  for (const pack of PACKS) {
    let applies;
    try { applies = pack.applies(record); } catch { applies = false; }
    if (!applies) continue;
    for (const dl of pack.buildDeadlines(record, ctx)) {
      if (dl.advisory && !includeAdvisory) continue;
      deadlines.push(dl);
    }
  }
  return deadlines;
}

module.exports = { computeDeadlines, PACKS };
