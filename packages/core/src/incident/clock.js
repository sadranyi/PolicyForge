/**
 * Deterministic time arithmetic for regulatory deadlines.
 * ======================================================
 * Every function takes explicit inputs and never calls Date.now() — the whole
 * incident subsystem is deterministic and unit-testable. Timestamps are ISO-8601
 * UTC strings at the boundary; math is done on epoch milliseconds internally.
 */

'use strict';

const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;

function toMs(iso) {
  if (iso == null) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) throw new Error(`clock: invalid timestamp "${iso}"`);
  return t;
}
function toIso(ms) {
  if (ms == null) return null;
  return new Date(ms).toISOString();
}

/** Add calendar hours. */
function addHours(iso, hours) {
  const ms = toMs(iso);
  return ms == null ? null : toIso(ms + hours * HOUR_MS);
}

/** Add calendar days. */
function addDays(iso, days) {
  const ms = toMs(iso);
  return ms == null ? null : toIso(ms + days * DAY_MS);
}

/** Add N calendar months, clamping to end-of-month (e.g. Jan 31 + 1mo = Feb 28/29). */
function addMonths(iso, months) {
  const ms = toMs(iso);
  if (ms == null) return null;
  const d = new Date(ms);
  const targetMonth = d.getUTCMonth() + months;
  const y = d.getUTCFullYear() + Math.floor(targetMonth / 12);
  const m = ((targetMonth % 12) + 12) % 12;
  const day = d.getUTCDate();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDay);
  return toIso(Date.UTC(y, m, clampedDay, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()));
}

function isWeekend(ms) {
  const dow = new Date(ms).getUTCDay(); // 0 Sun .. 6 Sat
  return dow === 0 || dow === 6;
}

/**
 * Add N business days (skipping weekends and any holidays provided as an array
 * of YYYY-MM-DD strings). The start day itself is not counted; we advance to the
 * Nth following business day.
 */
function addBusinessDays(iso, days, holidays = []) {
  let ms = toMs(iso);
  if (ms == null) return null;
  const holidaySet = new Set(holidays);
  let remaining = days;
  while (remaining > 0) {
    ms += DAY_MS;
    const ymd = toIso(ms).slice(0, 10);
    if (!isWeekend(ms) && !holidaySet.has(ymd)) remaining--;
  }
  return toIso(ms);
}

/**
 * Classify a deadline's status relative to a reference time.
 * @param {string|null} dueAt
 * @param {string} refIso  reference "now" (injected)
 * @param {object} [opts] { dueSoonHours=24 }
 * @returns {'OPEN'|'DUE_SOON'|'OVERDUE'}
 */
function deadlineStatus(dueAt, refIso, opts = {}) {
  const dueSoonHours = opts.dueSoonHours != null ? opts.dueSoonHours : 24;
  const due = toMs(dueAt);
  const now = toMs(refIso);
  if (due == null || now == null) return 'OPEN';
  if (now > due) return 'OVERDUE';
  if (due - now <= dueSoonHours * HOUR_MS) return 'DUE_SOON';
  return 'OPEN';
}

/** Milliseconds remaining until dueAt from refIso (negative if overdue). */
function msRemaining(dueAt, refIso) {
  const due = toMs(dueAt), now = toMs(refIso);
  if (due == null || now == null) return null;
  return due - now;
}

module.exports = {
  HOUR_MS, DAY_MS,
  toMs, toIso, addHours, addDays, addMonths, addBusinessDays,
  deadlineStatus, msRemaining, isWeekend,
};
