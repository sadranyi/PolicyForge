/**
 * Scan engine
 * ===========
 * The runtime primitive. Given arbitrary text and a compiled Rule Pack, returns
 * every runtime rule that matched, with the matched span, the enforcement action,
 * the severity, and the framework citations. This is what the MCP server, the
 * /v1/scan sidecar, the CLI `scan` command, and the Claude Code hooks all call.
 *
 * Deterministic, local, no network, no LLM. The differentiator versus every
 * chat-DLP / guardrail product is the response body: each finding is traceable
 * to a rule id, a framework citation, and (via emitters) the customer's own
 * policy text.
 *
 * Overall verdict:
 *   - "block" if any matched rule's action is "block"
 *   - "redact" else if any matched rule's action is "redact"
 *   - "coach"  else if any matched rule's action is "coach"
 *   - "flag"   else if anything matched
 *   - "allow"  if nothing matched
 */

'use strict';

const ACTION_PRIORITY = { block: 4, redact: 3, coach: 2, flag: 1 };

function trimSpan(text, maxLen = 120) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > maxLen ? t.slice(0, maxLen) + '…' : t;
}

/**
 * @param {string} text
 * @param {object} pack compiled rule pack
 * @param {object} [opts]
 * @param {'input'|'output'} [opts.direction='input']
 * @param {'chat'|'commit'|'tool_call'} [opts.context='chat']
 * @param {boolean} [opts.redact=false] also return a redacted copy of the text
 * @returns {{verdict, findings, redacted_text?, summary}}
 */
function scanText(text, pack, opts = {}) {
  if (typeof text !== 'string') throw new Error('scanText: text must be a string');
  if (!pack || !Array.isArray(pack.rules)) throw new Error('scanText: pack must be a compiled rule pack');

  const direction = opts.direction || 'input';
  const context = opts.context || 'chat';
  const runtimeRules = pack.rules.filter(r => r.kind === 'runtime');

  const findings = [];
  const redactSpans = [];

  for (const rule of runtimeRules) {
    for (const pattern of rule.patterns) {
      let re;
      try { re = new RegExp(pattern, 'gi'); }
      catch { continue; } // validated at compile time; skip defensively
      let m;
      while ((m = re.exec(text)) !== null) {
        if (m[0] === '') { re.lastIndex++; continue; } // guard against zero-width loops
        findings.push({
          rule_id: rule.rule_id,
          category: rule.category,
          severity: rule.severity,
          action: rule.action,
          description: rule.description,
          framework_citations: rule.framework_citations,
          controls: rule.controls || {},
          match: trimSpan(m[0]),
          offset: m.index,
          length: m[0].length,
        });
        if (rule.action === 'redact') {
          redactSpans.push([m.index, m.index + m[0].length]);
        }
      }
    }
  }

  // Overall verdict from highest-priority action among matches
  let verdict = 'allow';
  let topPriority = 0;
  for (const f of findings) {
    const p = ACTION_PRIORITY[f.action] || 0;
    if (p > topPriority) { topPriority = p; verdict = f.action; }
  }

  const result = {
    verdict,
    direction,
    context,
    findings,
    summary: {
      total: findings.length,
      by_severity: countBy(findings, 'severity'),
      by_action: countBy(findings, 'action'),
    },
  };

  if (opts.redact && redactSpans.length) {
    result.redacted_text = applyRedaction(text, redactSpans);
  }
  return result;
}

function countBy(arr, key) {
  const out = {};
  for (const x of arr) out[x[key]] = (out[x[key]] || 0) + 1;
  return out;
}

function applyRedaction(text, spans) {
  // Merge overlapping spans, then replace each with a fixed token.
  const merged = spans.slice().sort((a, b) => a[0] - b[0]).reduce((acc, s) => {
    const last = acc[acc.length - 1];
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
    else acc.push(s.slice());
    return acc;
  }, []);
  let out = '';
  let cursor = 0;
  for (const [start, end] of merged) {
    out += text.slice(cursor, start) + '[REDACTED]';
    cursor = end;
  }
  out += text.slice(cursor);
  return out;
}

module.exports = { scanText };
