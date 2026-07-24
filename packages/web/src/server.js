/**
 * PolicyForge web server
 * ----------------------
 * Thin wrapper around policyforge-core. Exposes:
 *   POST /api/review         — upload a policy, return JSON review
 *   POST /api/generate       — review + generate toolkit, return zip
 *   GET  /api/baseline       — return the active baseline (for transparency)
 *   GET  /api/health         — health check
 *   GET  /                   — serves the SPA from public/
 *
 * Privacy posture:
 *   - Files uploaded are kept in memory only; never written to disk on the server
 *   - No telemetry, no analytics, no external calls from the server
 *   - The whole thing is designed to be self-hostable behind a firewall
 */

const express = require('express');
const multer = require('multer');
const archiver = require('archiver');
const path = require('path');
const fs = require('fs');
const core = require('policyforge-core');

const PORT = process.env.PORT || 3000;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5 MB max
});

const app = express();
app.use(express.json({ limit: '5mb' }));

// ============================================================
// API endpoints
// ============================================================

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

app.get('/api/baseline', async (req, res, next) => {
  try {
    const baselineId = req.query.id || 'ai-usage-policy';
    const baseline = await core.loadBaseline(baselineId);
    res.json({
      id: baseline.baseline.id,
      name: baseline.baseline.name,
      version: baseline.baseline.version,
      description: baseline.baseline.description,
      citations: baseline.baseline.citations,
      rules: baseline.rules.map(r => ({
        id: r.id,
        category: r.category,
        title: r.title,
        severity: r.severity,
        citations: r.citations
      }))
    });
  } catch (err) { next(err); }
});

app.post('/api/review', upload.single('policy'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No policy file uploaded' });

    const baselineId = req.body.baseline || 'ai-usage-policy';
    const orgName = req.body.org_name || 'Your Organization';

    const extracted = await core.extractText({
      buffer: req.file.buffer,
      name: req.file.originalname
    });

    const baseline = await core.loadBaseline(baselineId);
    const review = core.reviewPolicy(extracted.text, baseline);
    const reviewDoc = core.generateReviewDocument(review, { org_name: orgName });

    res.json({
      review,
      review_markdown: reviewDoc.markdown,
      file_format: extracted.format,
      file_name: extracted.source
    });
  } catch (err) { next(err); }
});

app.post('/api/generate', upload.single('policy'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No policy file uploaded' });

    const stack = {
      languages: parseLanguages(req.body.stack),
      ci: req.body.ci || 'none',
      secret_store: req.body.secret_store || undefined,
      org_name: req.body.org_name || undefined,
      policy_owner_email: req.body.owner_email || undefined
    };

    const baselineId = req.body.baseline || 'ai-usage-policy';

    const extracted = await core.extractText({
      buffer: req.file.buffer,
      name: req.file.originalname
    });
    const baseline = await core.loadBaseline(baselineId);
    const review = core.reviewPolicy(extracted.text, baseline);
    const toolkit = core.generateToolkit({ review, baseline, stack });
    const reviewDoc = core.generateReviewDocument(review, { org_name: stack.org_name });

    // Stream a zip to the client
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="policyforge-toolkit-${Date.now()}.zip"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', err => { throw err; });
    archive.pipe(res);

    // Top-level review files
    archive.append(reviewDoc.markdown, { name: 'review.md' });
    archive.append(JSON.stringify(review, null, 2), { name: 'review.json' });

    // Toolkit
    for (const [relPath, contents] of Object.entries(toolkit)) {
      archive.append(contents, { name: `toolkit/${relPath}` });
    }

    archive.finalize();
  } catch (err) { next(err); }
});

function parseLanguages(stackStr) {
  if (!stackStr) return ['typescript'];
  if (stackStr === 'mixed') return ['typescript', 'csharp'];
  if (Array.isArray(stackStr)) return stackStr;
  return [stackStr];
}

// ============================================================
// Static SPA
// ============================================================
app.use(express.static(path.join(__dirname, '..', 'public')));

// ============================================================
// Error handler
// ============================================================
app.use((err, req, res, next) => {
  console.error('[policyforge] error:', err.message);
  if (process.env.POLICYFORGE_DEBUG) console.error(err.stack);
  if (res.headersSent) return next(err);
  const status = err.statusCode || 500;
  res.status(status).json({ error: err.message });
});

// ============================================================
// Start
// ============================================================
app.listen(PORT, () => {
  console.log('');
  console.log(`  PolicyForge web server`);
  console.log(`  Listening on http://localhost:${PORT}`);
  console.log(`  Health check:  http://localhost:${PORT}/api/health`);
  console.log(`  Baseline view: http://localhost:${PORT}/api/baseline`);
  console.log('');
  console.log('  Privacy note: uploaded policies are kept in memory only.');
  console.log('  Nothing is written to disk on this server.');
  console.log('');
});
