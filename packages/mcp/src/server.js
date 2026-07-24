#!/usr/bin/env node
/**
 * PolicyForge MCP server
 * ======================
 * A Model Context Protocol server (JSON-RPC 2.0 over stdio) that exposes
 * PolicyForge's deterministic, framework-cited engine to any MCP-capable AI
 * assistant — Claude Desktop/Code, ChatGPT developer mode, Cursor, Codex — so an
 * agent can ask "is this allowed by our policy?" mid-conversation and gate its
 * own tool calls.
 *
 * Implemented dependency-free (no MCP SDK) to preserve PolicyForge's small-
 * dependency ethos; it speaks the MCP wire protocol directly.
 *
 * Tools exposed:
 *   policy_check      — scan text for policy violations (the runtime primitive)
 *   check_tool_call   — gate a proposed tool call by scanning its arguments
 *   list_rules        — introspect the compiled rule pack (transparency)
 *
 * Everything is local: no network egress, no telemetry, no LLM.
 */

'use strict';

const readline = require('readline');
const core = require('policyforge-core');

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'policyforge', version: '0.2.0' };

let _packPromise = null;
function getPack() {
  if (!_packPromise) _packPromise = core.compileRulePack();
  return _packPromise;
}

const TOOLS = [
  {
    name: 'policy_check',
    description: 'Scan text against the organization\'s security policy rules. Returns a verdict ' +
      '(allow/flag/coach/redact/block) and every matched rule with its framework citation. ' +
      'Use before sending sensitive-looking content to an external service or including it in output.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The text to check.' },
        context: { type: 'string', enum: ['chat', 'commit', 'tool_call'], description: 'Where the text is used.' },
      },
      required: ['text'],
    },
  },
  {
    name: 'check_tool_call',
    description: 'Gate a proposed tool/function call by scanning its arguments for policy violations ' +
      '(secrets, regulated PII, prompt injection). Returns {allowed, verdict, reason, findings}. ' +
      'A false "allowed" means the call would violate policy and should not be made.',
    inputSchema: {
      type: 'object',
      properties: {
        tool_name: { type: 'string' },
        arguments: { type: 'object', description: 'The proposed tool arguments.' },
      },
      required: ['tool_name', 'arguments'],
    },
  },
  {
    name: 'list_rules',
    description: 'List the compiled PolicyForge rule pack (rule ids, severities, framework citations). ' +
      'Transparency: shows exactly what policy_check enforces and why.',
    inputSchema: { type: 'object', properties: { kind: { type: 'string', enum: ['runtime', 'review', 'all'] } } },
  },
];

async function callTool(name, args) {
  const pack = await getPack();
  if (name === 'policy_check') {
    const result = core.scanText(String(args.text || ''), pack, { context: args.context || 'chat' });
    return textResult(summarizeScan(result));
  }
  if (name === 'check_tool_call') {
    // Scan the string-valued arguments recursively (nested arrays/objects too),
    // not just a top-level JSON.stringify, so structured tool inputs are covered.
    const argText = collectStrings(args.arguments || {}).join('\n');
    const result = core.scanText(argText, pack, { context: 'tool_call' });
    // Deny on block OR redact: sending regulated PII (redact action) out through
    // a tool call is itself a violation, so the gate must not fail open on it.
    const denied = result.verdict === 'block' || result.verdict === 'redact';
    const allowed = !denied;
    return textResult(JSON.stringify({
      allowed, verdict: result.verdict,
      reason: denied
        ? 'Denied: ' + result.findings.map(f => `${f.rule_id} (${f.description}) [${f.framework_citations.join(', ')}]`).join('; ')
        : (result.findings.length
            ? 'Allowed with warnings: ' + result.findings.map(f => f.rule_id).join(', ')
            : 'No policy violation detected.'),
      findings: result.findings,
    }, null, 2), denied);
  }
  if (name === 'list_rules') {
    const kind = args.kind || 'all';
    const rules = pack.rules
      .filter(r => kind === 'all' || r.kind === kind)
      .map(r => ({ rule_id: r.rule_id, kind: r.kind, severity: r.severity, action: r.action, frameworks: r.framework_citations }));
    return textResult(JSON.stringify({ count: rules.length, rules }, null, 2));
  }
  throw rpcError(-32601, `Unknown tool: ${name}`);
}

function summarizeScan(result) {
  return JSON.stringify({
    verdict: result.verdict,
    findings: result.findings.map(f => ({
      rule_id: f.rule_id, severity: f.severity, action: f.action,
      description: f.description, frameworks: f.framework_citations, controls: f.controls,
    })),
    note: 'Deterministic, framework-cited. NOT LEGAL ADVICE.',
  }, null, 2);
}

function textResult(text, isError) {
  return { content: [{ type: 'text', text }], isError: !!isError };
}

// Recursively collect all string values from a nested value (objects/arrays).
function collectStrings(v, out = []) {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) for (const x of v) collectStrings(x, out);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) collectStrings(x, out);
  return out;
}

// ---- JSON-RPC plumbing ----
function rpcError(code, message) { const e = new Error(message); e.rpcCode = code; return e; }

async function handleRequest(msg) {
  const { id, method, params } = msg;
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      };
    case 'tools/list':
      return { tools: TOOLS };
    case 'tools/call': {
      const { name, arguments: args } = params || {};
      return await callTool(name, args || {});
    }
    case 'ping':
      return {};
    default:
      throw rpcError(-32601, `Method not found: ${method}`);
  }
}

function isNotification(msg) { return msg && msg.id === undefined; }

async function processLine(line, send) {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  // notifications (no id) get no response
  if (isNotification(msg)) return;
  try {
    const result = await handleRequest(msg);
    send({ jsonrpc: '2.0', id: msg.id, result });
  } catch (err) {
    send({ jsonrpc: '2.0', id: msg.id, error: { code: err.rpcCode || -32603, message: err.message } });
  }
}

function main() {
  const rl = readline.createInterface({ input: process.stdin });
  const send = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');
  rl.on('line', (line) => { if (line.trim()) processLine(line, send); });
  // stderr banner (stdout is reserved for protocol)
  process.stderr.write('PolicyForge MCP server ready (stdio)\n');
}

if (require.main === module) main();

module.exports = { handleRequest, TOOLS, callTool };
