/**
 * `policyforge hooks` — emit Claude Code hook configuration
 * =========================================================
 * Prints (or writes) the .claude/settings.json snippet and a wrapper that wire
 * PolicyForge's `gate` adapter as a PreToolUse + UserPromptSubmit hook, so an
 * agent session gets deterministic, framework-cited hard enforcement with zero
 * runtime dependencies.
 */

'use strict';

const fs = require('fs');
const path = require('path');

function hooksConfig() {
  // Uses `policyforge gate` on PATH; falls back to npx if not installed globally.
  const command = 'policyforge gate';
  return {
    hooks: {
      PreToolUse: [
        { matcher: '*', hooks: [{ type: 'command', command }] },
      ],
      UserPromptSubmit: [
        { hooks: [{ type: 'command', command }] },
      ],
    },
  };
}

function cmdHooks(args, C) {
  const cfg = hooksConfig();
  const json = JSON.stringify(cfg, null, 2);

  if (args.install) {
    const dir = path.resolve(args.dir || '.claude');
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, 'settings.json');
    let merged = cfg;
    if (fs.existsSync(target)) {
      try {
        const existing = JSON.parse(fs.readFileSync(target, 'utf8'));
        merged = Object.assign({}, existing);
        merged.hooks = Object.assign({}, existing.hooks, cfg.hooks);
      } catch { /* overwrite if unparseable */ }
    }
    fs.writeFileSync(target, JSON.stringify(merged, null, 2) + '\n');
    console.log(`  Wrote PolicyForge hooks to ${target}`);
    console.log('  Restart Claude Code (or reload settings) to activate.');
    return;
  }

  console.log('');
  console.log('  Add this to your project .claude/settings.json (or run with --install):');
  console.log('');
  console.log(json.replace(/^/gm, '  '));
  console.log('');
  console.log(C.dim('  The `policyforge gate` adapter denies tool calls / prompts that contain'));
  console.log(C.dim('  blocking policy violations (secrets, regulated PII), citing the rule and framework.'));
  console.log('');
}

module.exports = { cmdHooks, hooksConfig };
