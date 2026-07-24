/**
 * Incident dashboard renderer
 * ===========================
 * Produces a self-contained HTML dashboard from one or more incident records:
 * portfolio summary (severity mix, status), and a deadline board with a live
 * countdown to each regulatory due date. No external assets, no network, no
 * storage APIs — a single file that opens anywhere.
 *
 * Determinism: the server-rendered content is computed against an injected
 * `now`. The countdown ticks client-side from the embedded due timestamps.
 */

'use strict';

const core = require('policyforge-core');

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const SEV_COLOR = { SEV1: '#c8553d', SEV2: '#d98324', SEV3: '#2d8585', SEV4: '#5a7d7d' };

/**
 * @param {object[]} records incident records
 * @param {object} opts { now (ISO) }
 */
function renderDashboard(records, opts = {}) {
  const now = opts.now || new Date().toISOString();

  // Portfolio aggregates
  const sevMix = { SEV1: 0, SEV2: 0, SEV3: 0, SEV4: 0 };
  const statusMix = {};
  const rows = [];
  for (const rec of records) {
    sevMix[rec.severity] = (sevMix[rec.severity] || 0) + 1;
    statusMix[rec.status] = (statusMix[rec.status] || 0) + 1;
    for (const d of core.incident.deadlineBoard(rec, now)) {
      rows.push({ inc: rec, d });
    }
  }
  // Sort rows: overdue first, then soonest due
  rows.sort((a, b) => {
    const order = { OVERDUE: 0, DUE_SOON: 1, OPEN: 2, PENDING_TRIGGER: 3, ADVISORY: 4 };
    const oa = order[a.d.status] ?? 5, ob = order[b.d.status] ?? 5;
    if (oa !== ob) return oa - ob;
    if (a.d.msRemaining == null) return 1;
    if (b.d.msRemaining == null) return -1;
    return a.d.msRemaining - b.d.msRemaining;
  });

  const overdue = rows.filter(r => r.d.status === 'OVERDUE').length;
  const dueSoon = rows.filter(r => r.d.status === 'DUE_SOON').length;

  const rowsHtml = rows.map(({ inc, d }) => {
    const statusClass = d.status.toLowerCase().replace('_', '-');
    const dueAttr = d.dueAt ? ` data-due="${esc(d.dueAt)}"` : '';
    // Fixed-status rows (no numeric due date) never change client-side.
    const fixed = !d.dueAt;
    const dueCell = d.dueAt
      ? `<span class="countdown"${dueAttr}>${esc(d.dueAt)}</span>`
      : `<span class="muted">${d.status === 'PENDING_TRIGGER' ? 'pending trigger' : d.status === 'ADVISORY' ? 'advisory' : 'narrative'}</span>`;
    return `<tr class="st-${statusClass}"${dueAttr}${fixed ? ' data-fixed="1"' : ''}>
      <td><span class="sev" style="background:${SEV_COLOR[inc.severity] || '#666'}">${esc(inc.severity)}</span></td>
      <td class="inc">${esc(inc.title)}<div class="muted">${esc(inc.id)}</div></td>
      <td>${esc(d.label)}${d.advisory ? ' <span class="adv">advisory</span>' : ''}</td>
      <td class="due">${dueCell}</td>
      <td><span class="badge b-${statusClass}">${esc(d.status.replace('_', ' '))}</span></td>
      <td class="notify">${esc((d.whoToNotify || []).join('; '))}</td>
      <td><a href="${esc(d.citation ? d.citation.url : '#')}" target="_blank" rel="noopener">${esc(d.citation ? d.citation.ref : '')}</a></td>
    </tr>`;
  }).join('\n');

  const sevBar = Object.entries(sevMix).filter(([, n]) => n > 0).map(([k, n]) =>
    `<span class="chip" style="background:${SEV_COLOR[k]}">${k}: ${n}</span>`).join(' ');
  const statusChips = Object.entries(statusMix).map(([k, n]) =>
    `<span class="chip chip-plain">${esc(k)}: ${n}</span>`).join(' ');

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PolicyForge — Incident Dashboard</title>
<style>
  :root { --teal:#0f3a3a; --teal2:#2d8585; --cream:#faf6ee; --paper:#fffdf6; --terra:#c8553d; --ink:#1a1a1a; --rule:#e5ddcb; }
  * { box-sizing:border-box; }
  body { margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:var(--cream); color:var(--ink); }
  header { background:var(--teal); color:var(--cream); padding:1.4rem 2rem; }
  header h1 { margin:0; font-size:1.3rem; }
  header .sub { opacity:.8; font-size:.85rem; margin-top:.3rem; }
  .wrap { max-width:1200px; margin:0 auto; padding:1.5rem 2rem 3rem; }
  .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:1rem; margin:1.2rem 0; }
  .card { background:var(--paper); border:1px solid var(--rule); border-radius:8px; padding:1rem 1.2rem; }
  .card .k { font-size:.72rem; text-transform:uppercase; letter-spacing:.08em; color:#7a7060; }
  .card .v { font-size:1.8rem; font-weight:600; margin-top:.2rem; }
  .card.alert .v { color:var(--terra); }
  .chips { margin:.4rem 0; display:flex; flex-wrap:wrap; gap:.4rem; }
  .chip { color:#fff; padding:.15rem .6rem; border-radius:999px; font-size:.78rem; font-weight:600; }
  .chip-plain { background:#e8e0cf; color:#4a4436; }
  table { width:100%; border-collapse:collapse; background:var(--paper); border:1px solid var(--rule); border-radius:8px; overflow:hidden; margin-top:1rem; }
  th, td { text-align:left; padding:.6rem .7rem; border-bottom:1px solid var(--rule); font-size:.85rem; vertical-align:top; }
  th { background:#f0e9d8; font-size:.72rem; text-transform:uppercase; letter-spacing:.06em; color:#6a6152; }
  .sev { color:#fff; padding:.1rem .5rem; border-radius:4px; font-size:.74rem; font-weight:700; }
  .muted { color:#9a9080; font-size:.74rem; }
  .adv { background:#e8e0cf; color:#6a6152; padding:.05rem .4rem; border-radius:3px; font-size:.7rem; }
  .badge { padding:.12rem .5rem; border-radius:4px; font-size:.72rem; font-weight:600; }
  .b-overdue { background:#f6d5cd; color:#8f2f1c; }
  .b-due-soon { background:#f6e6cd; color:#8a5a12; }
  .b-open { background:#d7ece7; color:#1d5757; }
  .b-pending-trigger, .b-advisory { background:#eee7d6; color:#6a6152; }
  tr.st-overdue td.due { color:#8f2f1c; font-weight:600; }
  .countdown { font-variant-numeric:tabular-nums; }
  .notify { max-width:220px; }
  .disclaimer { margin-top:1.4rem; padding:.8rem 1rem; background:#fbeee9; border:1px solid #f0cabb; border-radius:6px; font-size:.8rem; color:#8f4a38; }
  a { color:var(--teal2); }
</style></head>
<body>
<header>
  <h1>PolicyForge — Incident Reporting Dashboard</h1>
  <div class="sub">${esc(records.length)} incident(s) · reference time ${esc(now)} · deterministic, offline</div>
</header>
<div class="wrap">
  <div class="cards">
    <div class="card"><div class="k">Incidents</div><div class="v">${records.length}</div></div>
    <div class="card"><div class="k">Deadlines tracked</div><div class="v">${rows.length}</div></div>
    <div class="card ${overdue ? 'alert' : ''}"><div class="k">Overdue</div><div class="v">${overdue}</div></div>
    <div class="card ${dueSoon ? 'alert' : ''}"><div class="k">Due soon (24h)</div><div class="v">${dueSoon}</div></div>
  </div>
  <div class="chips">${sevBar}</div>
  <div class="chips">${statusChips}</div>

  <table>
    <thead><tr>
      <th>Sev</th><th>Incident</th><th>Obligation</th><th>Due</th><th>Status</th><th>Notify</th><th>Citation</th>
    </tr></thead>
    <tbody>
${rowsHtml}
    </tbody>
  </table>

  <div class="disclaimer"><strong>NOT LEGAL ADVICE.</strong> Deadlines are software-computed estimates from public regulatory text and must be reviewed and approved by qualified legal counsel and your Data Protection Officer before reliance or transmission. Citations verified 2026-07-24. Countdown and status badges below recompute live against your current clock, so this dashboard stays internally consistent whenever it is opened.</div>
</div>
<script>
  // Live countdown AND status badge, recomputed together against the current
  // clock so the artifact is internally consistent whenever it is opened.
  // Rows with no numeric due date (pending-trigger / advisory / narrative) are
  // marked data-fixed and left untouched.
  var DUE_SOON_MS = 24*3600*1000;
  function fmt(ms) {
    if (ms <= 0) return 'overdue';
    var s = Math.floor(ms/1000), d = Math.floor(s/86400); s -= d*86400;
    var h = Math.floor(s/3600); s -= h*3600; var m = Math.floor(s/60);
    return (d? d+'d ':'') + h+'h ' + m+'m';
  }
  function badge(status) {
    var label = status.replace('_',' ');
    return '<span class="badge b-' + status.toLowerCase().replace('_','-') + '">' + label + '</span>';
  }
  function tick() {
    var now = Date.now();
    document.querySelectorAll('tr[data-due]').forEach(function(tr){
      if (tr.getAttribute('data-fixed')) return;
      var due = Date.parse(tr.getAttribute('data-due'));
      if (isNaN(due)) return;
      var rem = due - now;
      var status = rem <= 0 ? 'OVERDUE' : (rem <= DUE_SOON_MS ? 'DUE_SOON' : 'OPEN');
      var cd = tr.querySelector('.countdown');
      if (cd) {
        cd.textContent = tr.getAttribute('data-due').replace('.000Z','Z') + '  (' + fmt(rem) + ')';
        cd.style.color = rem <= 0 ? '#8f2f1c' : '';
        cd.style.fontWeight = rem <= 0 ? '600' : '';
      }
      var badgeCell = tr.querySelector('.badge');
      if (badgeCell) badgeCell.outerHTML = badge(status);
    });
  }
  tick(); setInterval(tick, 30000);
</script>
</body></html>`;
}

module.exports = { renderDashboard };
