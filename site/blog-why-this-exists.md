# Why PolicyForge exists

*Or: how compliance dies in the gap between the document and the commit.*

---

There's a folder on every company's SharePoint called something like **Policies — Final**. Inside it, somebody has saved the AI usage policy as `AI_Usage_Policy_v6_FINAL_v3.docx`. It was reviewed by Legal, approved by leadership, and rolled out via a mandatory training video that everyone clicks through at 4:55pm on a Friday. The policy is real. It exists. It even has a section header called "Acceptable Use" with bullet points.

And every Tuesday afternoon, someone on the data team pastes a customer support ticket into ChatGPT to help draft a reply.

This is not a story about negligent employees. It's a story about an architectural failure in how organizations connect policy to practice — and what it would take to actually fix it.

## The gap

The work of writing a policy and the work of enforcing it sit in different worlds, owned by different teams, expressed in different formats. They never meet.

The policy lives as prose. It says things like *"Confidential customer data must not be entered into AI systems that have not been approved by IT-Security."* This sentence is unambiguous to a reader and computationally invisible to every system the reader actually uses. The developer's IDE has no idea that rule exists. The CI pipeline doesn't enforce it. The secret-scanner doesn't know what "customer data" is. The Slack channel where someone is about to paste a support ticket has no awareness of the policy that prohibits the paste.

What organizations actually have, in practice, is two parallel realities:

| The policy says | The system does |
|---|---|
| "Don't paste customer data into AI tools" | Cmd+V works in every browser tab |
| "AI-generated code must be reviewed for security issues" | The PR review template doesn't mention AI |
| "Use only approved AI services" | There is no approved-services list anywhere a developer can find at the moment of decision |
| "Report AI security incidents within 24 hours" | There is no defined channel, runbook, or first-step instruction |

The gap between these two columns is where compliance actually lives. Or rather, it's where compliance fails to live.

## What I noticed at one company

I'll spare you the details, but the basic shape was this: a Microsoft Dynamics ISV — about 60 engineers, regulated customers in finance, taking AI seriously enough to write a real policy. The policy was good. Sixteen pages, written by a thoughtful security person, signed off by leadership. It addressed bring-your-own-AI, third-party tool review, customer data prohibition, incident response. By 2026 standards, it was above average for a company that size.

Then I looked at what was actually deployed. There was no `AGENTS.md` file in any of the repos. The pre-commit hooks ran linting and that was it. CI was Azure Pipelines with no AI-specific gates. The pull request template was a six-line template from 2019 that didn't mention AI. The incident response runbook covered ransomware and DDoS but had nothing about an engineer pasting customer records into Claude.

Notice that none of this is a failure of the policy. The policy had all the right concepts. The failure was that the policy lived in `.docx` and the work lived in `git`, and nothing bridged them. The senior engineer who wrote the policy didn't have the right tooling to translate it into enforcement scaffolding. The platform team didn't have time to read a sixteen-page document and figure out what to build. So nothing got built. The policy was a document. The work was a separate thing.

This pattern is everywhere. I've seen it at startups and mid-market companies. I've seen it at firms with paid GRC platforms — the GRC tool tracks whether the policy *exists*, not whether it's *enforced*. The dashboard turns green when the document is signed; it stays green forever.

## What "enforcement" actually means

When I say "enforcement scaffolding," I mean a specific list of artifacts that have to exist in the engineering surface area for a policy to actually have effect:

- **An `AGENTS.md` file** at the root of every repo, telling AI coding assistants the project's specific rules — what data classes are prohibited, what review process applies to AI-generated code, what the incident response path is. Modern AI tools (Claude, Cursor, Copilot) read these files automatically.
- **Pre-commit hooks** that scan staged changes for the patterns the policy prohibits — secrets, customer identifiers, hardcoded credentials, references to non-approved services.
- **CI pipeline gates** that re-run those checks server-side, because pre-commit hooks can be bypassed with `--no-verify` and any policy that depends on developer cooperation is no policy at all.
- **A pull request template** that asks the right AI-specific questions: "did this change include AI-generated code?", "did the change introduce any new third-party AI service calls?", "is the AI content guard passing?"
- **An incident response runbook** that the on-call engineer can actually find in the moment, with named playbooks for the scenarios most likely to happen — customer data leak, secrets exposure, agent misbehavior, prompt injection.
- **Redirector files** for AI assistants that don't natively read `AGENTS.md` (`CLAUDE.md`, `.github/copilot-instructions.md`) so the same rules apply across whichever tool the developer is using.

That's six concrete artifacts, each one a small file, none of them difficult to author *if you know exactly what they should say.* The hard part is the translation from policy prose to working artifact. That's the gap.

## Why nothing currently bridges it

There are tools that help you *write* the policy — policy templates, ChatGPT prompts that generate first drafts. There are tools that *track* the policy — GRC platforms that record whether it exists and who has signed off. There are tools that *scan for compliance violations* after the fact — DLP systems, SIEM rules.

None of these bridge the gap between the document and the commit. The document gets written by Legal. The commit happens in git. The intervening step — turning the document into something git can act on — is left to "the security team will figure it out," and most security teams are too small and too busy to spend a week on it for every policy.

What you need is a tool that does the translation. You give it the policy. It gives you the working enforcement scaffolding, tailored to your stack, ready to commit.

That's PolicyForge.

## What it does, specifically

PolicyForge takes an AI usage policy as input — markdown, plain text, or Word document — and does two things:

**First, it reviews the policy** against a transparent baseline of rules cited from named public frameworks: NIST AI Risk Management Framework, OWASP LLM Top 10, ISO/IEC 42001, EU AI Act. Every finding is tied to a specific rule; every rule is tied to a specific framework. The review tells you what the policy covers, what it partially covers, and what's missing entirely. The output is a severity-rated report you can act on.

**Second, if you ask it to, it generates the enforcement scaffolding** — the six artifacts above, tailored to your stack. Tell it you're a TypeScript shop using GitHub Actions and AWS Secrets Manager; it generates Husky-based pre-commit hooks, a GitHub Actions workflow, an AGENTS.md tuned to those tools, and a runbook scaffold. Tell it you're .NET on Azure DevOps; it generates Husky.NET hooks and an Azure pipeline template. The output is a zip you can drop into a repo.

What makes the project credible — to me, and I hope to the people who try it — is that the baseline is the project's defensibility, not its features. The features are easy. Anyone can write a tool that generates files. The hard, important, ongoing work is keeping the baseline current, well-cited, and trustworthy. That's where the actual value sits.

## What it doesn't do

PolicyForge is not legal advice. It identifies gaps against published frameworks; it doesn't certify regulatory compliance. The output of every review includes that disclaimer in its first paragraph.

PolicyForge is not a replacement for human security expertise. A staff security engineer reading your policy will catch things the tool won't. The tool's job is to be a competent first pass — to handle the well-trodden ground so the human can spend their time on the parts that actually require judgment.

PolicyForge is not exhaustive. v0.1 ships with three baselines — AI usage policy (16 rules), secure coding standards (25 rules), and incident response policy (19 rules) — covering the core ground in each. Sixty rules don't cover everything. The engine supports adding categories — vendor risk management, data retention, application privacy are natural next steps — but the project will always be smaller than the actual problem space.

And critically: PolicyForge is not yet a community. It's a working prototype maintained by one person, which is a known anti-pattern for security tooling. Single-maintainer baselines go stale within a year. The single most important non-code priority for this project is recruiting co-maintainers who will keep the baseline honest and current. If that's interesting to you, the contribution path is documented in the repo.

## The narrow claim

I'm not going to tell you this tool will solve your AI governance problem. The honest claim is much narrower:

If you have an AI policy and you don't yet have the enforcement scaffolding to make it real, PolicyForge can compress what would be a week of platform-team work into about fifteen minutes of running a CLI and reviewing the output. The output isn't perfect. It's a starting point. But the difference between "starting point" and "nothing" is the entire reason the gap exists.

If your policy is mostly there but you're not sure where it's weakest, PolicyForge can give you a citable, severity-rated review you can take to leadership without having to commission a security audit.

That's it. That's the whole pitch. The category doesn't need another tool that promises to revolutionize compliance. It needs a tool that does one specific, narrow, currently-undone job.

## How to try it

Apache 2.0, no paid tier, no accounts, no telemetry. The CLI runs locally — your policy never leaves your machine. The web app holds policies in memory only and writes nothing to disk; Docker compose included if you want to self-host.

```bash
git clone github.com/sadranyi/PolicyForge
cd PolicyForge && npm install
node packages/cli/src/index.js wizard
```

Or fork the repo, propose a baseline rule, dispute a finding, file an issue. The work that matters most for this project happens in the open, in the issue tracker, in the baseline YAML. That's where you can help.

The folder is still called *Policies — Final*. The Word document is still there. But maybe — for the first time — the work it's supposed to govern can actually know what it says.

---

*Samuel Adranyi is a systems architect. PolicyForge is open-source under the Apache 2.0 license. The project's baseline methodology, governance model, and dispute process are documented at [github.com/sadranyi/PolicyForge](https://github.com/sadranyi/PolicyForge).*
