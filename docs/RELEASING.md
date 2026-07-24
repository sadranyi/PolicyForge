# Releasing PolicyForge

Checklist for cutting a release and publishing the pieces people actually consume.

## Before every release

1. `npm install` on a clean checkout
2. `npm test` (unit tests: loader, reviewer, generators)
3. `node scripts/test-baselines.js` (baseline correctness, all bad+good pairs)
4. `node scripts/e2e-test.js` (web server end to end)
5. `docker build -t policyforge:local .` builds cleanly
6. Bump versions together in `package.json`, `packages/core/package.json`, `packages/cli/package.json`, `packages/web/package.json` (they release in lockstep at this stage of the project)
7. Update the version string in `packages/web/src/server.js` health endpoint if it changed

## Publishing to npm

Core must be published before (or with) the CLI, since the CLI depends on it by version.

```bash
npm login                       # one time
npm publish --workspace policyforge-core
npm publish --workspace policyforge
```

The web package is not published to npm; it ships via Docker / self-hosting.

After publishing, verify:

```bash
npx policyforge review --policy examples/sample-ai-usage-good.md --baseline ai-usage-policy
```

## Deploying the site

The marketing site in `site/` deploys to GitHub Pages automatically on push to `main` (see `.github/workflows/site.yml`). One-time setup: in the repo settings, under Pages, set the source to "GitHub Actions".

## Tagging

```bash
git tag -a v0.1.0 -m "PolicyForge v0.1.0"
git push origin v0.1.0
```

Create a GitHub Release from the tag and paste the highlights from the README's "What's in this version" table.

## One-time repo setup (still pending)

- Create issue labels: `baseline-rule`, `dispute-finding` (the README and CONTRIBUTING link to them)
- Add a repo description and topics on GitHub
- Enable GitHub Pages (source: GitHub Actions)
- Consider branch protection on `main` requiring CI to pass
