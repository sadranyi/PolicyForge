# Contributing to PolicyForge

Thanks for your interest. PolicyForge is a small project with a focused mission, and we want to keep contributions aligned with that mission.

## What we welcome

- **Baseline rule contributions** — see `docs/BASELINE_METHODOLOGY.md`. New rules need named-framework citations.
- **Evidence pattern improvements** — if you can show a real-world policy where a rule produces a false positive or false negative, a pattern improvement is high-value.
- **Bug fixes** in the engine.
- **Stack expansions** — additional language profiles, CI systems, secret stores.
- **Test coverage** for the reviewer and generators.
- **Documentation improvements**, especially around real-world adoption stories.
- **Translations** — both rule descriptions and language-specific evidence patterns.

## What we don't want

- LLM-based "intelligent" review modes. Determinism and transparency are core to the project's value.
- Telemetry, analytics, or any feature that phones home.
- Commercial "premium" features built into the core.
- Rules without framework citations. The validation will reject these anyway.

## Process

1. Open an issue describing what you want to do **before** writing code, especially for baseline changes
2. For baseline changes, attach the framework citation upfront
3. Submit a PR with focused scope
4. Be ready to discuss — we'd rather have a slow conversation about a rule than a fast merge of a wrong one

## Code style

- Node 18+ throughout
- No build step where avoidable; the CLI runs directly on `.js` files
- No new runtime dependencies without strong justification (the engine has 2; let's keep it small)
- Tests with `node --test` (built-in test runner)

## Community standards

Be kind. Disagree with arguments, not people. We're operating in a domain (security and AI governance) where good-faith disagreement is normal — assume good faith in others and demonstrate it yourself.

## Maintainers

PolicyForge is currently sustained by a single maintainer with the explicit goal of expanding to 3-5 named co-maintainers. If you've contributed several baseline updates that have all aligned with the methodology, that's the path to co-maintainership.
