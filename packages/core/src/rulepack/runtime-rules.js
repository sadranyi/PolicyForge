/**
 * Runtime detection rules
 * =======================
 * The content-detection rule set used at RUNTIME — scanning arbitrary text
 * (AI prompts, tool-call arguments, commit diffs) for sensitive data and
 * policy violations. These mirror the patterns shipped in the generated
 * content guard (templates/ai-content-guard.js.tmpl) but are expressed as
 * data so every surface (scan engine, MCP server, sidecar, DLP export) shares
 * one source of truth, and each carries framework citations — the thing no
 * competing DLP/guardrail product does.
 *
 * Patterns are stored as source strings (not RegExp literals) so the pack is
 * serializable to JSON and portable to non-JS surfaces (Purview/Netskope
 * dictionaries, Sigma rules).
 */

'use strict';

// Each entry: rule_id, severity, action, category, description, patterns[],
// framework_citations[], controls{ framework: [ids] }.
const RUNTIME_RULES = [
  // ---- Secrets ----
  {
    rule_id: 'RT-SECRET-001', severity: 'critical', action: 'block', category: 'secrets',
    description: 'Anthropic API key',
    patterns: ['sk-ant-(?:api|admin)\\d{2}-[A-Za-z0-9_-]{40,}'],
    framework_citations: ['owasp-llm-top10', 'nist-sp-800-53'],
    controls: { 'nist-sp-800-53': ['IA-5', 'SC-28'], 'owasp-llm-top10': ['LLM06'] },
  },
  {
    rule_id: 'RT-SECRET-002', severity: 'critical', action: 'block', category: 'secrets',
    description: 'OpenAI API key',
    patterns: ['sk-(?!ant-)(?:proj-)?[A-Za-z0-9_-]{40,}'],
    framework_citations: ['owasp-llm-top10', 'nist-sp-800-53'],
    controls: { 'nist-sp-800-53': ['IA-5', 'SC-28'], 'owasp-llm-top10': ['LLM06'] },
  },
  {
    rule_id: 'RT-SECRET-003', severity: 'critical', action: 'block', category: 'secrets',
    description: 'GitHub personal access token',
    patterns: ['gh[pousr]_[A-Za-z0-9]{36,}'],
    framework_citations: ['nist-sp-800-53'],
    controls: { 'nist-sp-800-53': ['IA-5'] },
  },
  {
    rule_id: 'RT-SECRET-004', severity: 'critical', action: 'block', category: 'secrets',
    description: 'Connection string with embedded password',
    patterns: ['(?:password|pwd)\\s*=\\s*[^;\'\\s"]{6,}'],
    framework_citations: ['nist-sp-800-53'],
    controls: { 'nist-sp-800-53': ['IA-5', 'SC-28'] },
  },
  {
    rule_id: 'RT-SECRET-005', severity: 'critical', action: 'block', category: 'secrets',
    description: 'JSON Web Token (often pasted from debugging)',
    patterns: ['eyJ[A-Za-z0-9_-]{10,}\\.eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}'],
    framework_citations: ['nist-sp-800-53'],
    controls: { 'nist-sp-800-53': ['IA-5'] },
  },
  {
    rule_id: 'RT-SECRET-006', severity: 'critical', action: 'block', category: 'secrets',
    description: 'Private key / certificate (PEM block start)',
    patterns: ['-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----'],
    framework_citations: ['nist-sp-800-53'],
    controls: { 'nist-sp-800-53': ['IA-5', 'SC-12'] },
  },
  // ---- Customer / personal data ----
  {
    rule_id: 'RT-PII-001', severity: 'high', action: 'redact', category: 'pii',
    description: 'US Social Security Number',
    patterns: ['\\b(?!000|666)[0-8]\\d{2}-(?!00)\\d{2}-(?!0000)\\d{4}\\b'],
    framework_citations: ['eu-ai-act', 'nist-sp-800-53'],
    controls: { 'nist-sp-800-53': ['PT-2', 'SC-28'] },
  },
  {
    rule_id: 'RT-PII-002', severity: 'high', action: 'redact', category: 'pii',
    description: 'Credit card number (Luhn-shaped, 13-19 digits)',
    patterns: ['\\b(?:4\\d{3}|5[1-5]\\d{2}|3[47]\\d{2}|6(?:011|5\\d{2}))[\\s-]?\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}\\b'],
    framework_citations: ['eu-ai-act', 'nist-sp-800-53'],
    controls: { 'nist-sp-800-53': ['PT-2', 'SC-28'] },
  },
  {
    rule_id: 'RT-PII-003', severity: 'high', action: 'redact', category: 'pii',
    description: 'US bank routing number in payment context',
    patterns: ['(?:routing|aba|rtn)[\\s_]*(?:number|#|no)?[\\s:=]+\\d{9}\\b'],
    framework_citations: ['nist-sp-800-53'],
    controls: { 'nist-sp-800-53': ['PT-2'] },
  },
  {
    rule_id: 'RT-PII-004', severity: 'medium', action: 'flag', category: 'pii',
    description: 'Phone number in contact context',
    patterns: ['(?:phone|tel|mobile|cell)[\\s_]*(?:number|#|no)?[\\s:=]+\\+?\\d[\\d\\s().-]{9,}'],
    framework_citations: ['eu-ai-act'],
    controls: {},
  },
  // ---- AI-specific threats ----
  {
    rule_id: 'RT-INJECT-001', severity: 'high', action: 'flag', category: 'prompt-injection',
    description: 'Prompt-injection override phrase in untrusted content',
    patterns: [
      'ignore (?:all |the |your )?(?:previous|prior|above) (?:instructions|prompts?|rules?)',
      'disregard (?:all |the |your )?(?:previous|prior|system) (?:instructions|prompt)',
      '(?:you are now|act as|pretend to be) (?:a |an )?(?:DAN|jailbroken|unrestricted)',
    ],
    framework_citations: ['owasp-llm-top10', 'nist-ai-rmf'],
    controls: { 'owasp-llm-top10': ['LLM01'] },
  },
  {
    rule_id: 'RT-INJECT-002', severity: 'medium', action: 'flag', category: 'prompt-injection',
    description: 'Attempt to exfiltrate the system prompt',
    patterns: [
      '(?:reveal|print|repeat|show me|what (?:is|are)) (?:your |the )?system prompt',
      'repeat (?:everything|the text) above',
    ],
    framework_citations: ['owasp-llm-top10'],
    controls: { 'owasp-llm-top10': ['LLM01', 'LLM07'] },
  },
];

module.exports = { RUNTIME_RULES };
