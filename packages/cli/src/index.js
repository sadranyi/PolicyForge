#!/usr/bin/env node
/**
 * PolicyForge CLI
 * ---------------
 * Subcommands:
 *   review    — review a policy document and write a review report
 *   generate  — review + generate a toolkit
 *   wizard    — interactive flow (review → ask questions → generate)
 *
 * This is the canonical entry point. The web UI is a wrapper around the
 * same core engine; everything the web does, the CLI also does.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const core = require('policyforge-core');
const { cmdIncident } = require('./incident-cmd');
const { cmdScan, cmdGate } = require('./scan-cmd');
const { cmdHooks } = require('./hooks-cmd');

// ============================================================
// Argument parsing — minimal, dependency-free
// ============================================================
function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

// ============================================================
// Console formatting
// ============================================================
const tty = process.stdout.isTTY;
const C = {
  bold: s => tty ? `\x1b[1m${s}\x1b[0m` : s,
  dim:  s => tty ? `\x1b[2m${s}\x1b[0m` : s,
  red:  s => tty ? `\x1b[31m${s}\x1b[0m` : s,
  yel:  s => tty ? `\x1b[33m${s}\x1b[0m` : s,
  grn:  s => tty ? `\x1b[32m${s}\x1b[0m` : s,
  blu:  s => tty ? `\x1b[34m${s}\x1b[0m` : s,
  cyan: s => tty ? `\x1b[36m${s}\x1b[0m` : s,
};

function divider() {
  console.log(C.dim('━'.repeat(60)));
}

function header(title) {
  console.log('');
  divider();
  console.log(C.bold(`  ${title}`));
  divider();
  console.log('');
}

// ============================================================
// USAGE
// ============================================================
function printUsage() {
  console.log(`
${C.bold('PolicyForge')} — turn AI policies into agent instructions and CI gates

Usage:
  policyforge wizard
  policyforge review --policy <file> [--baseline ai-usage-policy] [--output <dir>]
  policyforge generate --policy <file> --stack <stack> --ci <ci> [--secret-store <store>] [--output <dir>]
  policyforge incident (--intake <file.json> | --demo) [--now <iso>] [--out <dir>]
  policyforge scan (--text <s> | --file <f> | -) [--json] [--redact] [--strict] [--fail-on <level>]
  policyforge gate            # Claude Code hook adapter (stdin JSON -> decision)
  policyforge hooks [--install]  # print/install Claude Code hook settings
  policyforge dlp-export --target (purview|netskope|zscaler|generic) [--output <f>]

Subcommands:
  ${C.bold('wizard')}     Interactive flow — recommended for first-time use
  ${C.bold('review')}     Review a policy and write a report (no toolkit generated)
  ${C.bold('generate')}   Review + generate a tailored toolkit
  ${C.bold('incident')}   Classify an incident, compute regulatory deadlines, build a dashboard
  ${C.bold('scan')}       Scan text/stdin for policy violations (exit 1 on block)
  ${C.bold('gate')}       Claude Code PreToolUse/UserPromptSubmit hook adapter
  ${C.bold('hooks')}      Print or install the Claude Code hook settings for the gate adapter
  ${C.bold('dlp-export')} Export runtime rules as a Purview/Netskope/Zscaler/generic DLP pack

Common options:
  --policy <file>         Path to policy document (.md, .markdown, .txt, .docx)
  --baseline <id>         Baseline to apply (default: ai-usage-policy)
                          Available:
                            ai-usage-policy          (16 rules — AI policy)
                            secure-coding-standards  (25 rules — secure coding)
                            incident-response        (19 rules — IR policy)
                          Each baseline generates its own toolkit shape.
  --output <dir>          Output directory (default: ./policyforge-output)

Generate options:
  --stack <stack>         Languages: typescript | csharp | python | java | mixed
  --ci <ci>               CI: azure-devops | github-actions | both | none
  --secret-store <store>  Free text describing your secret store (e.g. "Azure Key Vault")
  --org-name <name>       Your organization name (used in generated docs)
  --owner-email <email>   Policy owner contact email

Examples:
  ${C.dim('# Interactive wizard:')}
  policyforge wizard

  ${C.dim('# Review only:')}
  policyforge review --policy ./ai-policy.md

  ${C.dim('# Generate full toolkit:')}
  policyforge generate \\
    --policy ./ai-policy.md \\
    --stack typescript \\
    --ci github-actions \\
    --org-name "Acme Corp"

License: Apache-2.0  •  https://github.com/yourorg/policyforge
`);
}

// ============================================================
// REVIEW subcommand
// ============================================================
async function cmdReview(args) {
  if (!args.policy) { console.error(C.red('Error:') + ' --policy is required'); process.exit(2); }
  if (!fs.existsSync(args.policy)) { console.error(C.red(`Error: file not found: ${args.policy}`)); process.exit(2); }

  header('PolicyForge — Review');
  console.log(`Policy:     ${args.policy}`);
  console.log(`Baseline:   ${args.baseline || 'ai-usage-policy'}`);
  console.log('');

  process.stdout.write(C.dim('Extracting text... '));
  const extracted = await core.extractText(args.policy);
  console.log(C.grn('done'));
  for (const w of extracted.warnings || []) {
    console.log(C.yel('  Warning: ') + (w.message || w.code || String(w)));
  }

  process.stdout.write(C.dim('Loading baseline... '));
  const baseline = await core.loadBaseline(args.baseline || 'ai-usage-policy');
  console.log(C.grn(`done (${baseline.rules.length} rules)`));

  process.stdout.write(C.dim('Running review... '));
  const review = core.reviewPolicy(extracted.text, baseline);
  console.log(C.grn('done'));

  printReviewSummary(review);

  // Write outputs
  const outputDir = args.output || './policyforge-output';
  fs.mkdirSync(outputDir, { recursive: true });

  const reviewDoc = core.generateReviewDocument(review, { org_name: args['org-name'] });
  fs.writeFileSync(path.join(outputDir, 'review.md'), reviewDoc.markdown);
  fs.writeFileSync(path.join(outputDir, 'review.json'), JSON.stringify(review, null, 2));

  // Optional operational/audit emitters (SARIF for code scanning, OCSF for SIEM).
  if (args.sarif || args.emit === 'all') {
    fs.writeFileSync(path.join(outputDir, 'review.sarif'),
      JSON.stringify(core.toSarif(review, { policySource: path.basename(args.policy) }), null, 2));
  }
  if (args.ocsf || args.emit === 'all') {
    fs.writeFileSync(path.join(outputDir, 'review.ocsf.json'),
      JSON.stringify(core.toOcsf(review, { time: Date.parse(review.reviewed_at) || 0, org: args['org-name'] }), null, 2));
  }
  // Optional drift gate: compare against a prior snapshot; exit 1 on regression.
  let driftExit = 0;
  if (args['drift-against']) {
    const prior = JSON.parse(fs.readFileSync(args['drift-against'], 'utf8'));
    const drift = core.diffSnapshots(prior, review);
    fs.writeFileSync(path.join(outputDir, 'drift.json'), JSON.stringify(drift, null, 2));
    console.log('');
    console.log(C.bold('Drift vs prior snapshot: ') +
      (drift.regressed ? C.red(`REGRESSED (+${drift.summary.new_gaps} new gaps)`) :
       drift.drifted ? C.yel('changed (no regression)') : C.grn('no change')));
    if (drift.regressed && args['fail-on-drift']) driftExit = 1;
  }
  // Always write a fresh snapshot for future drift comparisons.
  fs.writeFileSync(path.join(outputDir, 'snapshot.json'), JSON.stringify(core.snapshotReview(review), null, 2));

  console.log('');
  console.log(C.bold('Output written:'));
  console.log(`  ${path.join(outputDir, 'review.md')}`);
  console.log(`  ${path.join(outputDir, 'review.json')}`);
  console.log(`  ${path.join(outputDir, 'snapshot.json')}`);
  console.log('');
  if (driftExit) process.exit(driftExit);
}

// ============================================================
// GENERATE subcommand
// ============================================================
async function cmdGenerate(args) {
  if (!args.policy) { console.error(C.red('Error:') + ' --policy is required'); process.exit(2); }
  if (!args.stack) { console.error(C.red('Error:') + ' --stack is required (typescript|csharp|python|java|mixed)'); process.exit(2); }

  header('PolicyForge — Generate toolkit');
  console.log(`Policy:        ${args.policy}`);
  console.log(`Stack:         ${args.stack}`);
  console.log(`CI:            ${args.ci || 'none'}`);
  console.log(`Org:           ${args['org-name'] || '(not set)'}`);
  console.log('');

  process.stdout.write(C.dim('Extracting text... '));
  const extracted = await core.extractText(args.policy);
  console.log(C.grn('done'));
  for (const w of extracted.warnings || []) {
    console.log(C.yel('  Warning: ') + (w.message || w.code || String(w)));
  }

  process.stdout.write(C.dim('Loading baseline... '));
  const baseline = await core.loadBaseline(args.baseline || 'ai-usage-policy');
  console.log(C.grn('done'));

  process.stdout.write(C.dim('Running review... '));
  const review = core.reviewPolicy(extracted.text, baseline);
  console.log(C.grn('done'));

  printReviewSummary(review);

  const stack = {
    languages: parseStack(args.stack),
    ci: args.ci || 'none',
    secret_store: args['secret-store'],
    org_name: args['org-name'],
    policy_owner_email: args['owner-email']
  };

  process.stdout.write(C.dim('Generating toolkit... '));
  let toolkit;
  try {
    toolkit = core.generateToolkit({ review, baseline, stack });
    console.log(C.grn(`done (${Object.keys(toolkit).length} files)`));
  } catch (err) {
    if (err.code === 'TOOLKIT_BASELINE_UNSUPPORTED') {
      console.log(C.yel('skipped'));
      console.log('');
      console.log(C.yel('Note: ') + err.message);
      console.log(C.dim('      The review was generated successfully — saving review only.'));

      // Still write the review so the user gets value
      const outputDir = args.output || './policyforge-output';
      fs.mkdirSync(outputDir, { recursive: true });
      const reviewDoc = core.generateReviewDocument(review, { org_name: stack.org_name });
      fs.writeFileSync(path.join(outputDir, 'review.md'), reviewDoc.markdown);
      fs.writeFileSync(path.join(outputDir, 'review.json'), JSON.stringify(review, null, 2));

      console.log('');
      console.log(C.bold('Output written:'));
      console.log(`  Review (md):   ${path.join(outputDir, 'review.md')}`);
      console.log(`  Review (json): ${path.join(outputDir, 'review.json')}`);
      return;
    }
    throw err;
  }

  // Write toolkit + review
  const outputDir = args.output || './policyforge-output';
  const toolkitDir = path.join(outputDir, 'toolkit');
  fs.mkdirSync(toolkitDir, { recursive: true });

  for (const [relPath, contents] of Object.entries(toolkit)) {
    const full = path.join(toolkitDir, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, contents);

    // Make hooks and scripts executable
    if (relPath.startsWith('.husky/') || relPath.startsWith('scripts/')) {
      try { fs.chmodSync(full, 0o755); } catch {}
    }
  }

  const reviewDoc = core.generateReviewDocument(review, { org_name: stack.org_name });
  fs.writeFileSync(path.join(outputDir, 'review.md'), reviewDoc.markdown);
  fs.writeFileSync(path.join(outputDir, 'review.json'), JSON.stringify(review, null, 2));

  console.log('');
  console.log(C.bold('Output written:'));
  console.log(`  Review:    ${path.join(outputDir, 'review.md')}`);
  console.log(`  Toolkit:   ${toolkitDir}/`);
  console.log('');
  console.log(C.bold('Next steps:'));
  console.log(`  1. Read ${path.join(outputDir, 'review.md')} to understand identified gaps`);
  if (baseline.baseline.id === 'secure-coding-standards') {
    console.log(`  2. Resolve TODOs in ${path.join(toolkitDir, 'docs/SECURE_CODING_STANDARDS.md')}`);
  } else if (baseline.baseline.id === 'incident-response') {
    console.log(`  2. Resolve TODOs in ${path.join(toolkitDir, 'docs/INCIDENT_RESPONSE_POLICY.md')}`);
  } else {
    console.log(`  2. Customize ${path.join(toolkitDir, 'AGENTS.md')} for your organization`);
  }
  console.log(`  3. Copy the toolkit into your repository`);
  console.log(`  4. See ${path.join(toolkitDir, 'README.md')} for installation steps`);
  console.log('');
}

// ============================================================
// WIZARD subcommand — interactive
// ============================================================
async function cmdWizard() {
  header('PolicyForge — Interactive wizard');

  console.log('This wizard will:');
  console.log('  1. Review your AI policy against published frameworks');
  console.log('  2. Ask about your tech stack');
  console.log('  3. Generate a tailored toolkit you can drop into your repos');
  console.log('');
  console.log(C.dim('Nothing leaves your machine. The CLI does the work locally.'));
  console.log('');

  // Lossless prompter: buffers incoming lines so answers are never dropped
  // when stdin is piped (readline.question loses buffered lines between
  // sequential questions on non-TTY stdin). Behaves identically at a TTY.
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdin.isTTY === true
  });
  const lineQueue = [];
  let lineWaiter = null;
  let stdinClosed = false;
  rl.on('line', (l) => {
    if (lineWaiter) { const w = lineWaiter; lineWaiter = null; w(l); }
    else lineQueue.push(l);
  });
  rl.on('close', () => {
    stdinClosed = true;
    if (lineWaiter) { const w = lineWaiter; lineWaiter = null; w(null); }
  });
  const ask = async (q) => {
    process.stdout.write(q);
    let line;
    if (lineQueue.length > 0) line = lineQueue.shift();
    else if (stdinClosed) line = null;
    else line = await new Promise(res => { lineWaiter = res; });
    if (line === null) {
      console.error('\n' + C.red('Error:') + ' input ended before the wizard finished.');
      process.exit(2);
    }
    return line.trim();
  };

  // Step 1: policy file
  let policyPath;
  while (true) {
    policyPath = await ask(C.cyan('1/6  Path to your policy document (.md, .markdown, .txt, .docx): '));
    if (!policyPath) continue;
    policyPath = policyPath.replace(/^['"]|['"]$/g, '');
    if (fs.existsSync(policyPath)) break;
    console.log(C.red(`     File not found: ${policyPath}. Try again.`));
  }

  // Step 2: org name
  const orgName = await ask(C.cyan('2/6  Your organization name (used in generated docs): '));

  // Step 3: stack
  console.log(C.cyan('3/6  Primary languages in your repo:'));
  console.log('     [1] TypeScript / JavaScript');
  console.log('     [2] C# / .NET');
  console.log('     [3] Python');
  console.log('     [4] Java');
  console.log('     [5] Mixed (multiple of the above)');
  let stackChoice;
  while (true) {
    stackChoice = await ask('     Choose 1-5: ');
    if (['1','2','3','4','5'].includes(stackChoice)) break;
  }
  const stackMap = { '1': 'typescript', '2': 'csharp', '3': 'python', '4': 'java', '5': 'mixed' };
  const stackId = stackMap[stackChoice];

  // Step 4: CI
  console.log(C.cyan('4/6  CI/CD system:'));
  console.log('     [1] Azure DevOps');
  console.log('     [2] GitHub Actions');
  console.log('     [3] Both');
  console.log('     [4] None / other (skip CI generation)');
  let ciChoice;
  while (true) {
    ciChoice = await ask('     Choose 1-4: ');
    if (['1','2','3','4'].includes(ciChoice)) break;
  }
  const ciMap = { '1': 'azure-devops', '2': 'github-actions', '3': 'both', '4': 'none' };
  const ci = ciMap[ciChoice];

  // Step 5: secret store
  const secretStore = await ask(C.cyan('5/6  Where do you store secrets? (e.g. "Azure Key Vault" — press Enter to skip): '));

  // Step 6: contact email
  const ownerEmail = await ask(C.cyan('6/6  Policy owner / security contact email (e.g. security@yourorg.example): '));

  rl.close();

  // Run
  console.log('');
  console.log(C.bold('Running...'));
  console.log('');

  await cmdGenerate({
    policy: policyPath,
    stack: stackId,
    ci: ci,
    'secret-store': secretStore || undefined,
    'org-name': orgName || undefined,
    'owner-email': ownerEmail || undefined,
    output: './policyforge-output'
  });
}

// ============================================================
// Helpers
// ============================================================
function parseStack(stackArg) {
  if (!stackArg) return [];
  if (stackArg === 'mixed') return ['typescript', 'csharp'];   // sensible mixed default
  // Split on comma so users can pass `typescript,csharp` and similar
  return stackArg.split(',').map(s => s.trim()).filter(Boolean);
}

function printReviewSummary(review) {
  const sev = review.summary.by_severity;
  console.log('');
  console.log(C.bold('Review summary'));
  console.log('');
  printSeverityLine('Critical', sev.Critical, C.red);
  printSeverityLine('High',     sev.High,     C.yel);
  printSeverityLine('Medium',   sev.Medium,   C.dim);
  printSeverityLine('Low',      sev.Low,      C.dim);
  console.log('');

  const recColor = review.recommendation === 'material_revision_required' ? C.red
                : review.recommendation === 'material_revision_recommended' ? C.yel
                : C.grn;
  console.log(`Recommendation: ${recColor(review.recommendation.replaceAll('_', ' '))}`);
}

function printSeverityLine(label, counts, colorFn) {
  const total = counts.satisfied + counts.partial + counts.gap;
  if (total === 0) return;
  const bar = `${'█'.repeat(counts.satisfied)}${'▓'.repeat(counts.partial)}${'░'.repeat(counts.gap)}`;
  console.log(`  ${colorFn(label.padEnd(8))}  ${bar.padEnd(20)}  ${counts.satisfied}/${total} satisfied${counts.gap > 0 ? `, ${counts.gap} gap${counts.gap === 1 ? '' : 's'}` : ''}`);
}

// ============================================================
// MAIN

// ============================================================
// DLP-EXPORT subcommand — browser-bridge pattern packs
// ============================================================
async function cmdDlpExport(args) {
  const target = args.target || 'generic';
  const pack = await core.compileRulePack();
  const out = core.toDlpPack(pack, target);
  const outPath = args.output || `policyforge-dlp-${target}.json`;
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log('');
  console.log(C.bold(`DLP pack (${target}) written: `) + outPath);
  console.log(C.dim('  Import into your DLP/CASB so browser-layer enforcement derives from the same policy.'));
  console.log('');
}

// ============================================================
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const subcommand = args._[0];

  if (!subcommand || args.help || args.h) {
    printUsage();
    process.exit(args.help || args.h ? 0 : 1);
  }

  try {
    if (subcommand === 'review') await cmdReview(args);
    else if (subcommand === 'generate') await cmdGenerate(args);
    else if (subcommand === 'wizard') await cmdWizard();
    else if (subcommand === 'incident') await cmdIncident(args, C);
    else if (subcommand === 'scan') await cmdScan(args, C);
    else if (subcommand === 'gate') await cmdGate();
    else if (subcommand === 'hooks') cmdHooks(args, C);
    else if (subcommand === 'dlp-export') await cmdDlpExport(args);
    else {
      console.error(C.red(`Unknown subcommand: ${subcommand}`));
      printUsage();
      process.exit(1);
    }
  } catch (err) {
    console.error('');
    console.error(C.red('Error: ') + err.message);
    if (process.env.POLICYFORGE_DEBUG) console.error(err.stack);
    process.exit(1);
  }
}

main();
