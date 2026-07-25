/**
 * `policyforge scan` and `policyforge gate`
 * =========================================
 * The deterministic runtime enforcement surface, reusing the core scan engine.
 *
 *   scan  — scan text/stdin/file against the compiled rule pack; human or JSON
 *           output; exit code 1 on a block verdict (CI / pre-commit friendly).
 *
 *   gate  — Claude Code hook adapter. Reads a hook event JSON on stdin
 *           (PreToolUse / UserPromptSubmit), scans the relevant text, and emits
 *           the hook's decision JSON. A block verdict denies the tool call /
 *           prompt; everything else allows. Zero dependencies, local, no LLM —
 *           deterministic hard enforcement at the agent layer.
 *
 * Exit codes (scan): 0 allow/flag/coach, 1 block, 2 usage error.
 */

'use strict';

const fs = require('fs');
const core = require('policyforge-core');

let _packPromise = null;
function getPack() {
  if (!_packPromise) _packPromise = core.compileRulePack();
  return _packPromise;
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

// Verdict severity ranking, used to decide whether a scan "fails" (exit 1).
const VERDICT_RANK = { allow: 0, flag: 1, coach: 2, redact: 3, block: 4 };

/**
 * Decide whether a verdict should fail the scan (exit 1), given flags:
 *   default            -> fail only on `block` (secrets)
 *   --strict           -> fail on `redact` or higher (also regulated PII)
 *   --fail-on <level>  -> fail on <level> or higher; level in
 *                         block|redact|coach|flag|any (any = any match)
 * The explicit --fail-on wins over --strict if both are given.
 */
function isFailing(verdict, args) {
  const rank = VERDICT_RANK[verdict] != null ? VERDICT_RANK[verdict] : 0;
  let threshold = VERDICT_RANK.block; // default
  if (args['fail-on']) {
    const v = String(args['fail-on']).toLowerCase();
    threshold = v === 'any' ? 1 : (VERDICT_RANK[v] != null ? VERDICT_RANK[v] : VERDICT_RANK.block);
  } else if (args.strict) {
    threshold = VERDICT_RANK.redact;
  }
  return rank >= threshold && rank > 0;
}

async function cmdScan(args, C) {
  let text;
  if (args.text != null) text = String(args.text);
  else if (args.file) text = fs.readFileSync(args.file, 'utf8');
  else text = readStdin();

  if (!text) {
    console.error(C.red('Error:') + ' no input (use --text, --file, or pipe to stdin)');
    process.exit(2);
  }

  const pack = await getPack();
  const result = core.scanText(text, pack, {
    direction: args.direction || 'input',
    context: args.context || 'chat',
    redact: !!args.redact,
  });

  const failing = isFailing(result.verdict, args);

  if (args.json) {
    process.stdout.write(JSON.stringify(Object.assign({}, result, { failing }), null, 2) + '\n');
  } else {
    const verdictColor = result.verdict === 'block' ? C.red : result.verdict === 'redact' ? C.yel : result.verdict === 'allow' ? C.grn : C.yel;
    console.log('');
    console.log('  Verdict: ' + verdictColor(result.verdict.toUpperCase()) +
      (failing ? C.red('  (fails threshold)') : ''));
    console.log(`  Findings: ${result.findings.length}`);
    for (const f of result.findings.slice(0, 20)) {
      console.log(`   [${f.severity}] ${f.rule_id} — ${f.description}  (${f.framework_citations.join(', ')})`);
    }
    if (result.redacted_text) {
      console.log('');
      console.log('  Redacted:');
      console.log('  ' + result.redacted_text.replace(/\n/g, '\n  '));
    }
    console.log('');
  }

  process.exit(failing ? 1 : 0);
}

/**
 * Claude Code hook adapter. Reads the hook JSON on stdin and writes a hook
 * decision on stdout. Supports PreToolUse and UserPromptSubmit event shapes.
 * See https://code.claude.com/docs/en/hooks-guide
 */
async function cmdGate() {
  const raw = readStdin();
  let event = {};
  try { event = raw ? JSON.parse(raw) : {}; } catch { event = {}; }

  const eventName = event.hook_event_name || event.hookEventName || '';
  const text = extractHookText(event);
  const pack = await getPack();
  const result = text ? core.scanText(text, pack, { context: 'tool_call' }) : { verdict: 'allow', findings: [] };

  const reason = result.findings.length
    ? `PolicyForge blocked: ${result.findings.map(f => `${f.rule_id} (${f.description})`).join('; ')}`
    : '';

  // Hard enforcement denies on block OR redact — a redact-action finding means
  // regulated PII (e.g. an SSN) is present, which must not leave via a tool call
  // or prompt just because it is "redactable" rather than "blockable".
  const denied = result.verdict === 'block' || result.verdict === 'redact';
  if (denied) {
    // PreToolUse: deny the tool call. UserPromptSubmit: block the prompt.
    if (eventName === 'UserPromptSubmit') {
      out({ decision: 'block', reason });
    } else {
      out({ hookSpecificOutput: { hookEventName: eventName || 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });
    }
    process.exit(0);
  }

  // Allow (optionally surface a non-blocking warning for flag/coach verdicts).
  if (result.findings.length) {
    out({ systemMessage: `PolicyForge notice: ${result.findings.length} policy signal(s) detected (non-blocking).` });
  } else {
    out({});
  }
  process.exit(0);
}

function extractHookText(event) {
  // Try the common shapes for prompt / tool input.
  if (typeof event.prompt === 'string') return event.prompt;
  const ti = event.tool_input || event.toolInput;
  if (ti) {
    if (typeof ti === 'string') return ti;
    // Recursively collect ALL string values, including nested arrays/objects
    // (e.g. MultiEdit's edits[].new_string), so structured payloads are covered.
    return collectStrings(ti).join('\n');
  }
  return '';
}

function collectStrings(v, out = []) {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) for (const x of v) collectStrings(x, out);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) collectStrings(x, out);
  return out;
}

function out(obj) { process.stdout.write(JSON.stringify(obj) + '\n'); }

module.exports = { cmdScan, cmdGate };
