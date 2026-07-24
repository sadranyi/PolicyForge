/**
 * scan / gate / hooks + sidecar tests
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync, spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');

const CLI = path.join(__dirname, '..', 'src', 'index.js');
const KEY = 'sk-ant-api03-' + 'A'.repeat(45);

function runCli(args, input) {
  try {
    const out = execFileSync('node', [CLI, ...args], { input: input || '', encoding: 'utf8' });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: (e.stdout || '') + (e.stderr || '') };
  }
}

test('scan exits 1 and reports a block on a detected secret', () => {
  const r = runCli(['scan', '--text', `here is ${KEY}`]);
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /BLOCK/);
  assert.match(r.out, /RT-SECRET-001/);
});

test('scan exits 0 on clean text', () => {
  const r = runCli(['scan', '--text', 'a perfectly ordinary sentence']);
  assert.strictEqual(r.code, 0);
  assert.match(r.out, /ALLOW/);
});

test('scan --json emits machine-readable output', () => {
  const r = runCli(['scan', '--text', `x ${KEY}`, '--json']);
  const parsed = JSON.parse(r.out);
  assert.strictEqual(parsed.verdict, 'block');
  assert.ok(parsed.findings[0].framework_citations.length);
});

test('gate denies a PreToolUse call carrying a secret', () => {
  const event = JSON.stringify({ hook_event_name: 'PreToolUse', tool_input: { command: `echo ${KEY}` } });
  const r = runCli(['gate'], event);
  const decision = JSON.parse(r.out);
  assert.strictEqual(decision.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(decision.hookSpecificOutput.permissionDecisionReason, /RT-SECRET-001/);
});

test('gate allows a clean tool call', () => {
  const event = JSON.stringify({ hook_event_name: 'PreToolUse', tool_input: { command: 'ls -la' } });
  const r = runCli(['gate'], event);
  const decision = JSON.parse(r.out);
  assert.ok(!decision.hookSpecificOutput || decision.hookSpecificOutput.permissionDecision !== 'deny');
});

test('gate blocks a UserPromptSubmit prompt with a secret', () => {
  const event = JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: `use ${KEY} please` });
  const r = runCli(['gate'], event);
  const decision = JSON.parse(r.out);
  assert.strictEqual(decision.decision, 'block');
});

test('hooks prints valid settings JSON', () => {
  const r = runCli(['hooks']);
  assert.match(r.out, /PreToolUse/);
  assert.match(r.out, /policyforge gate/);
});

test('POST /v1/scan sidecar returns a cited verdict', async () => {
  const server = spawn('node', [path.join(__dirname, '..', '..', 'web', 'src', 'server.js')], {
    env: Object.assign({}, process.env, { PORT: '3931' }),
    stdio: 'ignore',
  });
  try {
    await waitFor(3931, 4000);
    const res = await post(3931, '/v1/scan', { text: `leak ${KEY} and ssn 123-45-6789`, redact: true });
    assert.strictEqual(res.verdict, 'block');
    assert.ok(res.findings.some(f => f.rule_id === 'RT-SECRET-001'));
    // PII (redact action) produces a redacted copy; the secret is block-action
    assert.ok(res.redacted_text.includes('[REDACTED]'));
    const clean = await post(3931, '/v1/scan', { text: 'nothing to see' });
    assert.strictEqual(clean.verdict, 'allow');
  } finally {
    server.kill();
  }
});

function waitFor(port, timeoutMs) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    (function attempt() {
      const req = http.get({ host: '127.0.0.1', port, path: '/api/health' }, res => { res.resume(); resolve(); });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) reject(new Error('server did not start'));
        else setTimeout(attempt, 100);
      });
    })();
  });
}

function post(port, p, body) {
  const data = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: p, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
      res => { let b = ''; res.on('data', c => b += c); res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } }); });
    req.on('error', reject);
    req.write(data); req.end();
  });
}
