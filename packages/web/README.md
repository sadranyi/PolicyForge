# `policyforge-web`

The PolicyForge web app — the same engine (`policyforge-core`) behind an HTTP
interface, plus the runtime guard sidecar. Useful for walking a policy through
with non-technical stakeholders and for programmatic integration. Self-hostable;
uploads are held in memory only and nothing is written to disk on the server.

Not published to npm — ships via Docker / self-hosting.

```bash
# from the repo root
cd packages/web && npm install && npm start      # http://localhost:3000
# or, whole stack via Docker:
docker compose up
```

`PORT` env var overrides the default `3000`.

---

## Endpoints

### `GET /api/health`
`{ status: 'ok', version: '0.2.0' }`.

### `GET /api/baseline?id=<baseline>`
Return the active baseline (id, name, citations, rule summaries) for transparency.

### `POST /api/review` (multipart)
Upload a policy file (`policy` field). Returns `{ review, review_markdown,
file_format, file_name, warnings }`. `warnings` surfaces e.g. a scanned-PDF notice.

```bash
curl -F policy=@ai-policy.pdf -F baseline=ai-usage-policy http://localhost:3000/api/review
```

### `POST /api/generate` (multipart)
Upload a policy + stack fields (`stack`, `ci`, `org_name`, `owner_email`,
`secret_store`). Returns the generated toolkit as a **zip** stream.

```bash
curl -F policy=@ai-policy.md -F stack=typescript -F ci=github-actions \
  -o toolkit.zip http://localhost:3000/api/generate
```

### `POST /v1/scan` (JSON) — the guard sidecar
Deterministic scan of arbitrary text against the compiled rule pack. Every
finding is traceable to a rule id **and** a framework citation.

Body: `{ text: string, direction?: 'input'|'output', context?: 'chat'|'commit'|'tool_call', redact?: boolean }`

```bash
curl -X POST http://localhost:3000/v1/scan \
  -H 'Content-Type: application/json' \
  -d '{"text":"prompt containing an SSN 123-45-6789","redact":true}'
# -> { "verdict":"redact", "findings":[…cited…], "redacted_text":"… [REDACTED] …" }
```

Use it as an inline guard in front of an LLM gateway: scan `input` before the
call and `output` after, block on `verdict === 'block'`.

---

## Privacy posture
Files are kept in memory only; nothing is written to disk on the server. No
telemetry, no external calls. Designed to be self-hosted behind a firewall.

## License
Apache-2.0.
