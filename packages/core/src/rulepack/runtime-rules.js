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
    patterns: ['gh[pousr]_[A-Za-z0-9]{36,}', 'github_pat_[0-9A-Za-z_]{60,}'],
    framework_citations: ['nist-sp-800-53'],
    controls: { 'nist-sp-800-53': ['IA-5'] },
  },
  {
    // Heuristic only: a `password=...` assignment. Downgraded to `flag` (was a
    // block) because it false-positive-blocked benign config placeholders like
    // `DB_PASSWORD=changeme_in_production` and `.env.example`. Placeholder-looking
    // values (changeme, example, <...>, ${...}, etc.) are excluded, and the
    // high-confidence real case (a DB URI with inline credentials) is caught by
    // RT-SECRET-013 at block level instead.
    rule_id: 'RT-SECRET-004', severity: 'medium', action: 'flag', category: 'secrets',
    description: 'Possible password in a key=value assignment (heuristic)',
    patterns: ['(?:password|pwd)\\s*=\\s*["\']?(?!(?:changeme|change_me|changethis|password|passwd|example|placeholder|redacted|your[_-]?password|yourpassword|xxx|<|\\$\\{|sample|dummy|todo))[^;\'\\s"]{8,}'],
    framework_citations: ['nist-sp-800-53'],
    controls: { 'nist-sp-800-53': ['IA-5', 'SC-28'] },
  },
  {
    rule_id: 'RT-SECRET-007', severity: 'critical', action: 'block', category: 'secrets',
    description: 'AWS access key ID',
    patterns: ['\\b(?:AKIA|ASIA|AIDA|AROA)[0-9A-Z]{16}\\b'],
    framework_citations: ['owasp-llm-top10', 'nist-sp-800-53'],
    controls: { 'nist-sp-800-53': ['IA-5', 'SC-28'], 'owasp-llm-top10': ['LLM06'] },
  },
  {
    rule_id: 'RT-SECRET-008', severity: 'critical', action: 'block', category: 'secrets',
    description: 'AWS secret access key (in an aws_secret context)',
    patterns: ['aws_secret_access_key\\s*[=:]\\s*["\']?[A-Za-z0-9/+]{40}'],
    framework_citations: ['owasp-llm-top10', 'nist-sp-800-53'],
    controls: { 'nist-sp-800-53': ['IA-5', 'SC-28'], 'owasp-llm-top10': ['LLM06'] },
  },
  {
    rule_id: 'RT-SECRET-009', severity: 'critical', action: 'block', category: 'secrets',
    description: 'Google API key',
    patterns: ['\\bAIza[0-9A-Za-z_-]{35}\\b'],
    framework_citations: ['owasp-llm-top10', 'nist-sp-800-53'],
    controls: { 'nist-sp-800-53': ['IA-5'], 'owasp-llm-top10': ['LLM06'] },
  },
  {
    rule_id: 'RT-SECRET-010', severity: 'critical', action: 'block', category: 'secrets',
    description: 'Slack token',
    patterns: ['xox[baprs]-[0-9A-Za-z-]{10,}'],
    framework_citations: ['owasp-llm-top10', 'nist-sp-800-53'],
    controls: { 'nist-sp-800-53': ['IA-5'], 'owasp-llm-top10': ['LLM06'] },
  },
  {
    rule_id: 'RT-SECRET-011', severity: 'critical', action: 'block', category: 'secrets',
    description: 'Stripe live secret key',
    patterns: ['\\b(?:sk|rk)_live_[0-9A-Za-z]{16,}\\b'],
    framework_citations: ['owasp-llm-top10', 'nist-sp-800-53'],
    controls: { 'nist-sp-800-53': ['IA-5'], 'owasp-llm-top10': ['LLM06'] },
  },
  {
    rule_id: 'RT-SECRET-013', severity: 'critical', action: 'block', category: 'secrets',
    description: 'Database connection string with inline credentials',
    patterns: ['(?:postgres|postgresql|mysql|mongodb|mongodb\\+srv|redis|amqp|rediss)://[^:/\\s]+:[^@/\\s]+@'],
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
    description: 'Credit card number (Visa/MC/Discover 16, Amex 15, Diners 14)',
    patterns: [
      // Visa / Mastercard / Discover — 16 digits, optional separators
      '\\b(?:4\\d{3}|5[1-5]\\d{2}|6(?:011|5\\d{2}))[\\s-]?\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}\\b',
      // American Express — 15 digits (4-6-5)
      '\\b3[47]\\d{2}[\\s-]?\\d{6}[\\s-]?\\d{5}\\b',
      // Diners Club — 14 digits (4-6-4)
      '\\b3(?:0[0-5]|[68]\\d)\\d[\\s-]?\\d{6}[\\s-]?\\d{4}\\b',
    ],
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
  {
    // Email address, excluding common dummy/example domains to avoid flagging
    // documentation and test data.
    rule_id: 'RT-PII-005', severity: 'medium', action: 'redact', category: 'pii',
    description: 'Email address (likely personal/customer)',
    patterns: ['[A-Za-z0-9._%+-]+@(?!(?:example|test|localhost|acme|contoso|sample|fake|invalid|domain|email|mycompany|yourcompany)\\b)[A-Za-z0-9.-]+\\.[A-Za-z]{2,}'],
    framework_citations: ['eu-ai-act', 'nist-sp-800-53'],
    controls: { 'nist-sp-800-53': ['PT-2'] },
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
