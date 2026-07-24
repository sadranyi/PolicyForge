/**
 * MCP server tests — in-process handler + real stdio round-trip
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');

const { handleRequest, TOOLS } = require('../src/server');
const SERVER = path.join(__dirname, '..', 'src', 'server.js');
const KEY = 'sk-ant-api03-' + 'A'.repeat(45);

test('initialize returns protocol version and server info', async () => {
  const r = await handleRequest({ id: 1, method: 'initialize' });
  assert.strictEqual(r.serverInfo.name, 'policyforge');
  assert.ok(r.protocolVersion);
  assert.ok(r.capabilities.tools);
});

test('tools/list exposes the three tools with input schemas', async () => {
  const r = await handleRequest({ id: 2, method: 'tools/list' });
  const names = r.tools.map(t => t.name);
  assert.deepStrictEqual(names.sort(), ['check_tool_call', 'list_rules', 'policy_check']);
  for (const t of r.tools) assert.strictEqual(t.inputSchema.type, 'object');
});

test('policy_check blocks a secret and cites the framework', async () => {
  const r = await handleRequest({ id: 3, method: 'tools/call', params: { name: 'policy_check', arguments: { text: `x ${KEY}` } } });
  const payload = JSON.parse(r.content[0].text);
  assert.strictEqual(payload.verdict, 'block');
  assert.ok(payload.findings[0].frameworks.length);
});

test('check_tool_call denies a call whose arguments carry a secret', async () => {
  const r = await handleRequest({ id: 4, method: 'tools/call', params: { name: 'check_tool_call', arguments: { tool_name: 'post', arguments: { body: KEY } } } });
  const payload = JSON.parse(r.content[0].text);
  assert.strictEqual(payload.allowed, false);
  assert.strictEqual(r.isError, true);
});

test('check_tool_call allows a clean call', async () => {
  const r = await handleRequest({ id: 5, method: 'tools/call', params: { name: 'check_tool_call', arguments: { tool_name: 'ls', arguments: { path: '/tmp' } } } });
  assert.strictEqual(JSON.parse(r.content[0].text).allowed, true);
});

test('unknown method returns a JSON-RPC method-not-found', async () => {
  await assert.rejects(() => handleRequest({ id: 6, method: 'nope/nope' }), /Method not found/);
});

test('server speaks JSON-RPC over real stdio', async () => {
  const proc = spawn('node', [SERVER], { stdio: ['pipe', 'pipe', 'ignore'] });
  const responses = [];
  let buf = '';
  proc.stdout.on('data', d => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (line.trim()) responses.push(JSON.parse(line));
    }
  });
  const send = (obj) => proc.stdin.write(JSON.stringify(obj) + '\n');

  send({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'policy_check', arguments: { text: `leak ${KEY}` } } });
  // notification (no id) must produce no response
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });

  await new Promise(r => setTimeout(r, 600));
  proc.kill();

  const init = responses.find(r => r.id === 1);
  const scan = responses.find(r => r.id === 2);
  assert.ok(init && init.result.serverInfo.name === 'policyforge');
  assert.ok(scan && JSON.parse(scan.result.content[0].text).verdict === 'block');
  // exactly two responses (the notification got none)
  assert.strictEqual(responses.filter(r => r.id !== undefined).length, 2);
});
