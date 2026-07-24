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

  if (args.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    const verdictColor = result.verdict === 'block' ? C.red : result.verdict === 'redact' ? C.yel : result.verdict === 'allow' ? C.grn : C.yel;
    console.log('');
    console.log('  Verdict: ' + verdictColor(result.verdict.toUpperCase()));
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

  process.exit(result.verdict === 'block' ? 1 : 0);
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

  if (result.verdict === 'block') {
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
    // Concatenate string-valued fields (command, content, text, code, etc.)
    return Object.values(ti).filter(v => typeof v === 'string').join('\n');
  }
  return '';
}

function out(obj) { process.stdout.write(JSON.stringify(obj) + '\n'); }

module.exports = { cmdScan, cmdGate };
