/**
 * PDF text extraction
 * ===================
 * Enterprise security policies overwhelmingly live as PDFs — this was the single
 * largest funnel blocker. We use pdfjs-dist (Mozilla's PDF.js), which is pure JS
 * (no native build, works in the Docker image and on Windows) and extracts a
 * text layer without rendering.
 *
 * Quality caveat, surfaced honestly to the caller: PDF text extraction is
 * imperfect. We reconstruct reading order line-by-line from text-item positions,
 * and we flag low-text-yield PDFs (likely scanned/image-only) so the reviewer
 * doesn't silently mis-review a policy it couldn't actually read.
 */

'use strict';

// pdfjs-dist v4 ships ESM only; load it via dynamic import from CommonJS.
let _pdfjs = null;
async function getPdfjs() {
  if (_pdfjs) return _pdfjs;
  _pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return _pdfjs;
}

/**
 * Extract text from a PDF buffer.
 * @param {Buffer} buffer
 * @param {object} [opts]
 * @param {number} [opts.minCharsPerPage=50] below this average, we warn about a
 *   likely scanned/image PDF.
 * @returns {Promise<{text, pages, warnings}>}
 */
async function extractPdfText(buffer, opts = {}) {
  const minCharsPerPage = opts.minCharsPerPage != null ? opts.minCharsPerPage : 50;
  const pdfjs = await getPdfjs();

  const data = new Uint8Array(buffer);
  const loadingTask = pdfjs.getDocument({
    data,
    // Keep it quiet and dependency-light — we only need the text layer.
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: false,
    verbosity: 0,
  });
  const doc = await loadingTask.promise;

  const warnings = [];
  const pageTexts = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    pageTexts.push(reconstructPageText(content.items));
    // Release page resources promptly for large documents.
    page.cleanup();
  }

  await doc.destroy();

  const text = pageTexts.join('\n\n').replace(/[ \t]+\n/g, '\n').trim();
  const avgChars = doc.numPages > 0 ? text.length / doc.numPages : 0;

  if (avgChars < minCharsPerPage) {
    warnings.push({
      code: 'low_text_yield',
      message:
        `Extracted only ~${Math.round(avgChars)} characters per page. This PDF may be ` +
        `scanned or image-only; the review may be incomplete. Consider providing a ` +
        `text-based PDF, .docx, or Markdown, or run OCR first.`,
    });
  }

  return { text, pages: doc.numPages, warnings };
}

/**
 * Reconstruct readable line-by-line text from PDF.js text items. Items carry a
 * transform matrix; we group by vertical position (y) into lines, order lines
 * top-to-bottom, and order items within a line left-to-right (x).
 */
function reconstructPageText(items) {
  const lines = new Map(); // yKey -> array of {x, str}
  for (const it of items) {
    if (typeof it.str !== 'string' || it.str === '') continue;
    const tr = it.transform || [1, 0, 0, 1, 0, 0];
    const x = tr[4];
    const y = tr[5];
    // Bucket y to the nearest 2 units so items on the same visual line group.
    const yKey = Math.round(y / 2) * 2;
    if (!lines.has(yKey)) lines.set(yKey, []);
    lines.get(yKey).push({ x, str: it.str });
  }
  const sortedYs = Array.from(lines.keys()).sort((a, b) => b - a); // top (higher y) first
  const out = [];
  for (const yKey of sortedYs) {
    const parts = lines.get(yKey).sort((a, b) => a.x - b.x);
    // Join adjacent text items with a space unless the previous item already
    // ends with whitespace or the next starts with it. Joining with '' merged
    // "Customer" + "data" into "Customerdata"; a single space preserves word
    // boundaries, and the final collapse removes any doubled spaces.
    let line = '';
    for (const p of parts) {
      if (line && !/\s$/.test(line) && !/^\s/.test(p.str)) line += ' ';
      line += p.str;
    }
    out.push(line.replace(/\s+/g, ' ').trim());
  }
  return out.filter(Boolean).join('\n');
}

module.exports = { extractPdfText };
