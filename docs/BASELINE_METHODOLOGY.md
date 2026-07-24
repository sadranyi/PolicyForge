# Baseline methodology

> Why the baseline is the project's most important asset, and how it stays trustworthy.

## What the baseline is

The PolicyForge baseline is a YAML file (`packages/core/baseline-data/ai-usage-policy.yaml`) that defines the rules the reviewer applies. Every rule has:

- A **title** stating the requirement
- A **severity** (Critical / High / Medium / Low) reflecting impact if absent
- One or more **citations** to named, public frameworks
- **Evidence patterns** the reviewer searches for in policy text
- A **suggested resolution** that goes into the generated AGENTS.md if the rule is flagged as a gap

## Why it matters

A policy-review tool is only as useful as the standard it measures against. PolicyForge's distinguishing claim is *transparency*: when we tell you your policy has a gap, we can show you exactly which rule fired, exactly which framework it cites, and exactly what evidence we did or did not find.

This is the project's defensibility. The tool around it is just the delivery mechanism.

## Citations are mandatory

Every rule must cite at least one source from `baseline.citations`. This is enforced by the loader; a rule without a citation will fail validation and the baseline will not load.

The acceptable citation sources are:

**For AI usage policy baseline:**

- **NIST AI Risk Management Framework** (and its companions)
- **OWASP Top 10 for LLM Applications**
- **ISO/IEC 42001** AI management system standard
- **EU AI Act** (Regulation EU 2024/1689)

**For secure coding standards baseline:**

- **OWASP Application Security Verification Standard (ASVS)**
- **OWASP Top 10**
- **NIST Secure Software Development Framework (SP 800-218)**
- **CWE Top 25 Most Dangerous Software Weaknesses**

**For incident response policy baseline:**

- **NIST SP 800-61** Computer Security Incident Handling Guide
- **ISO/IEC 27035** Information security incident management
- **GDPR Article 33** breach notification requirements
- **NIS2 Directive** (EU 2022/2555) reporting obligations
- **CISA Cybersecurity Incident & Vulnerability Response Playbooks**

**Cross-cutting (used by multiple baselines):**

- **NIST SP 800-53** (when general security control mapping is appropriate)
- Other named, public frameworks may be added — they go into `baseline.citations` first

Internal opinions, individual blog posts, and vendor whitepapers are **not** acceptable citation sources for the baseline. If a rule can't be grounded in a named public framework, it doesn't belong in the baseline. (It might belong in a generated AGENTS.md as guidance, but that's different.)

## Severity rubric

- **Critical** — absence of this rule materially weakens the policy's enforceability or creates direct exposure to a high-likelihood threat. Examples: customer data prohibition, secret handling, AI-specific incident response.
- **High** — absence creates significant exposure but does not by itself collapse the policy. Examples: vendor security review, MCP governance, training requirement.
- **Medium** — absence is a procedural gap that should be closed in the next revision but is not blocking. Examples: review cadence, offboarding details.
- **Low** — absence is a minor refinement opportunity.

A rule's severity is set when the rule is added and is not changed lightly. Severity escalation requires a PR with rationale grounded in observed harm or threat-landscape changes.

## Evidence patterns

Each rule has positive and (optionally) negative evidence patterns interpreted as case-insensitive regex.

**Positive patterns:** if any one matches, the policy is considered to have addressed the rule. Patterns should be specific enough to avoid false-positive matches against unrelated text. They should also be flexible enough to accommodate the variety of phrasings real policies use — different organizations use very different language for the same concept.

**Negative patterns:** signal that the policy mentions the topic in a way that does not actually constitute coverage (e.g., a passing reference to "data classification framework" without defining one). When a positive and a negative pattern both fire, the rule is flagged as `partial`.

## How the baseline evolves

### Cadence

Reviewed at least every six months. AI evolves fast enough that 6 months is the right cadence; longer is too slow.

### Triggers for ad-hoc updates

- Publication of a new revision of any cited framework
- Material expansion of a citable framework's coverage area
- Post-incident review at a reference-customer organization that surfaces a generalizable gap
- Maintainer consensus that an emerging threat warrants a new rule

### Process for proposing a change

1. Open a GitHub issue describing the proposed rule (or change to existing rule)
2. Attach the citation grounding the rule
3. Provide the evidence pattern(s) and rationale for severity
4. The maintainers review against this methodology
5. If accepted, the change goes into the next baseline release

### Process for disputing a finding

If you believe a rule produces incorrect findings against your policy, open an issue with:

1. The rule ID
2. The relevant excerpt from your policy (anonymized as needed)
3. Why you believe the finding is wrong

Maintainers will either:

- Update the evidence pattern (if the rule's intent matches your policy but the pattern missed it)
- Update the rule's wording (if the rule's intent isn't what we thought it was)
- Explain why the finding stands (and update the rule's description for clarity)

## Versioning

The baseline carries a semantic version (`baseline.version`). Changes are versioned as:

- **Patch (1.0.0 → 1.0.1):** evidence pattern improvements that don't change which rules fire on the median policy
- **Minor (1.0.0 → 1.1.0):** new rules added, severity adjustments, citation updates
- **Major (1.0.0 → 2.0.0):** structural changes to rule schema, removed rules, fundamental changes to the rubric

Generated toolkits record the baseline version in `.policyforge.json`. This means an organization can rerun PolicyForge against an updated baseline and see what changed.

## Translation note

The baseline is currently English-only. Policies in other languages will not review well. Multi-language support is a v0.3 goal and requires both translated rule descriptions and language-specific evidence patterns.

## Who maintains the baseline

The honest answer at v0.1 is: a single maintainer, with the project explicitly seeking co-maintainers from the security and AI governance communities.

This is the project's biggest sustainability risk. If the baseline doesn't have multiple knowledgeable maintainers who can review changes against the rubric, it will go stale and become misleading. We'd rather have the project visibly governed by 3-5 named people who actively review baseline changes than by a single point of failure.

If you're a security engineer, AI safety researcher, or compliance lead who wants to help: open an issue, contribute a baseline update, and reach out about co-maintainership. The bar is contribution quality and consistency with this methodology, not credentials.

## What the baseline is not

- Not legal advice. Some rules align with regulatory requirements; the baseline does not certify compliance.
- Not exhaustive. A staff security engineer reading your policy will catch things the baseline won't. Use it as a starting point.
- Not unbiased. The baseline is *opinionated* — it takes positions that not every organization will share. The transparency of the citations lets you evaluate those positions on their merits.

---

*This methodology document is itself part of the baseline's defensibility. Changes to it should be deliberated openly.*
