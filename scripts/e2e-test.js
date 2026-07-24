#!/usr/bin/env node
/**
 * End-to-end smoke test for the PolicyForge web server.
 * Spawns the server, hits the endpoints, validates responses, kills the server.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const SERVER_PATH = path.join(ROOT, 'packages/web/src/server.js');
const SAMPLE_POLICY = path.join(ROOT, 'examples/sample-policy.md');
const PORT = 3001;

let serverProc;

function logStep(msg) { console.log(`\n→ ${msg}`); }
function pass(msg) { console.log(`  ✓ ${msg}`); }
function fail(msg, err) { console.error(`  ✗ ${msg}${err ? `: ${err.message || err}` : ''}`); cleanup(); process.exit(1); }

function cleanup() {
  if (serverProc && !serverProc.killed) {
    try { serverProc.kill('SIGKILL'); } catch {}
  }
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });

function get(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${PORT}${urlPath}`, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    }).on('error', reject);
  });
}

function postMultipart(urlPath, fields, fileField, filePath) {
  return new Promise((resolve, reject) => {
    const boundary = '----PolicyForgeBoundary' + Date.now();
    const fileContent = fs.readFileSync(filePath);

    const parts = [];
    for (const [key, value] of Object.entries(fields)) {
      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`
      ));
    }
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${path.basename(filePath)}"\r\nContent-Type: text/markdown\r\n\r\n`
    ));
    parts.push(fileContent);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
    const body = Buffer.concat(parts);

    const opts = {
      method: 'POST',
      hostname: 'localhost',
      port: PORT,
      path: urlPath,
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length
      }
    };
    const req = http.request(opts, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks)
      }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function waitForReady(maxMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const r = await get('/api/health');
      if (r.status === 200) return true;
    } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  return false;
}

(async () => {
  logStep('Starting server on port ' + PORT);
  serverProc = spawn('node', [SERVER_PATH], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  serverProc.stdout.on('data', d => process.stdout.write('  [server] ' + d.toString()));
  serverProc.stderr.on('data', d => process.stderr.write('  [server-err] ' + d.toString()));

  const ready = await waitForReady();
  if (!ready) fail('Server did not become ready within 5s');
  pass('Server ready');

  // Test 1: health
  logStep('GET /api/health');
  const h = await get('/api/health');
  if (h.status !== 200) fail('Health check returned ' + h.status);
  const healthJson = JSON.parse(h.body);
  if (healthJson.status !== 'ok') fail('Health check status not "ok"');
  pass(`Health: ${healthJson.status} v${healthJson.version}`);

  // Test 2: baseline
  logStep('GET /api/baseline');
  const b = await get('/api/baseline');
  if (b.status !== 200) fail('Baseline returned ' + b.status);
  const baseline = JSON.parse(b.body);
  if (!baseline.rules || baseline.rules.length === 0) fail('Baseline has no rules');
  pass(`Baseline: ${baseline.name} v${baseline.version} with ${baseline.rules.length} rules`);

  // Test 3: review
  logStep('POST /api/review');
  const r = await postMultipart(
    '/api/review',
    { org_name: 'Acme Corp' },
    'policy',
    SAMPLE_POLICY
  );
  if (r.status !== 200) fail(`Review returned ${r.status}: ${r.body.toString().slice(0,200)}`);
  const reviewResp = JSON.parse(r.body.toString());
  if (!reviewResp.review || !reviewResp.review.findings) fail('Review response missing findings');
  const summary = reviewResp.review.summary;
  pass(`Review: ${reviewResp.review.findings.length} findings, recommendation=${reviewResp.review.recommendation}`);
  pass(`  Critical gaps: ${summary.by_severity.Critical.gap}, High gaps: ${summary.by_severity.High.gap}`);

  // Test 4: generate (zip download)
  logStep('POST /api/generate');
  const g = await postMultipart(
    '/api/generate',
    {
      org_name: 'Acme Corp',
      stack: 'typescript',
      ci: 'github-actions',
      owner_email: 'security@acme.example',
      secret_store: 'Azure Key Vault'
    },
    'policy',
    SAMPLE_POLICY
  );
  if (g.status !== 200) fail(`Generate returned ${g.status}: ${g.body.toString().slice(0,200)}`);
  if (!g.headers['content-type']?.includes('application/zip')) fail('Generate did not return zip');
  // Save and verify it's a valid zip
  const zipPath = '/tmp/policyforge-e2e-test.zip';
  fs.writeFileSync(zipPath, g.body);
  pass(`Toolkit zip: ${(g.body.length / 1024).toFixed(1)} KB at ${zipPath}`);

  // Verify zip contains expected files
  const { execSync } = require('child_process');
  const listing = execSync(`unzip -l ${zipPath}`).toString();
  const expectedFiles = [
    'review.md',
    'review.json',
    'toolkit/AGENTS.md',
    'toolkit/CLAUDE.md',
    'toolkit/scripts/ai-content-guard.js',
    'toolkit/.gitleaks.toml',
    'toolkit/.github/workflows/ai-policy-gates.yml',
    'toolkit/.github/copilot-instructions.md',
    'toolkit/docs/AI_Incident_Response_Runbook.md',
    'toolkit/.policyforge.json'
  ];
  for (const f of expectedFiles) {
    if (!listing.includes(f)) fail(`Toolkit zip missing expected file: ${f}`);
  }
  pass(`Toolkit zip contains all ${expectedFiles.length} expected files`);

  logStep('All tests passed');
  cleanup();
  process.exit(0);
})().catch(err => fail('Unexpected error', err));
