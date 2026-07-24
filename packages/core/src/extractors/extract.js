/**
 * Document extractor
 * ------------------
 * Takes a file path or a buffer + filename and returns normalized text
 * suitable for review by the reviewer.
 *
 * Supported formats:
 *   .md / .markdown / .txt — passed through
 *   .docx                  — extracted via mammoth (Word document)
 *
 * Why not PDF? PDF text extraction quality varies wildly. We accept
 * .docx as the polished-document format and Markdown as the source-control
 * format, and we direct users to convert PDFs to one of those.
 */

const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');

async function extractText(input) {
  let buffer, name;
  if (typeof input === 'string') {
    // file path
    if (!fs.existsSync(input)) throw new Error(`File not found: ${input}`);
    buffer = fs.readFileSync(input);
    name = path.basename(input);
  } else if (input && input.buffer && input.name) {
    buffer = input.buffer;
    name = input.name;
  } else {
    throw new Error('extractText: pass a file path string OR { buffer, name } object');
  }

  const ext = path.extname(name).toLowerCase();

  switch (ext) {
    case '.md':
    case '.markdown':
    case '.txt':
      return {
        text: buffer.toString('utf8'),
        format: ext.slice(1),
        source: name
      };

    case '.docx': {
      const result = await mammoth.extractRawText({ buffer });
      return {
        text: result.value,
        format: 'docx',
        source: name,
        warnings: result.messages || []
      };
    }

    case '.pdf': {
      const { extractPdfText } = require('./pdf');
      const pdf = await extractPdfText(buffer);
      return {
        text: pdf.text,
        format: 'pdf',
        source: name,
        pages: pdf.pages,
        warnings: pdf.warnings || []
      };
    }

    default:
      throw new Error(`Unsupported file extension: "${ext}". Supported: .md, .markdown, .txt, .docx, .pdf`);
  }
}

module.exports = { extractText };
