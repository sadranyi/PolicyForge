# `policyforge-mcp`

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes
PolicyForge's deterministic, framework-cited engine to any MCP-capable AI
assistant — Claude Desktop / Claude Code, ChatGPT developer mode, Cursor, Codex.
An agent can ask "is this allowed by our policy?" mid-conversation and gate its
own tool calls. Local, no network egress, no telemetry, no LLM.

Implemented dependency-free (JSON-RPC 2.0 over stdio, no MCP SDK) to keep the
small-dependency footprint.

```bash
npm install -g policyforge-mcp
```

---

## Tools

### `policy_check`
Scan text for policy violations. Returns a verdict (`allow` / `flag` / `coach` /
`redact` / `block`) and every matched rule with its framework citation. Use
before sending sensitive-looking content to an external service.

Input: `{ text: string, context?: 'chat' | 'commit' | 'tool_call' }`

### `check_tool_call`
Gate a proposed tool/function call by recursively scanning its arguments (nested
structures included). Returns `{ allowed, verdict, reason, findings }`. **Denies**
(`allowed: false`, `isError: true`) on both secrets (`block`) and regulated PII
(`redact`) — it does not fail open on PII.

Input: `{ tool_name: string, arguments: object }`

### `list_rules`
Introspect the compiled rule pack (transparency). Input:
`{ kind?: 'runtime' | 'review' | 'all' }`.

---

## Wiring it into Claude Desktop / Claude Code

Add to your MCP config (e.g. Claude Desktop's `claude_desktop_config.json`, or a
project `.mcp.json`):

```json
{
  "mcpServers": {
    "policyforge": {
      "command": "policyforge-mcp"
    }
  }
}
```

If not installed globally, use `npx`:

```json
{
  "mcpServers": {
    "policyforge": { "command": "npx", "args": ["-y", "policyforge-mcp"] }
  }
}
```

Restart the client. The three tools then appear to the assistant. The server logs
a readiness banner to **stderr**; stdout is reserved for the JSON-RPC protocol.

---

## Programmatic use

The request handler is exported for embedding/testing:

```js
const { handleRequest, TOOLS } = require('policyforge-mcp/src/server');

const res = await handleRequest({
  id: 1, method: 'tools/call',
  params: { name: 'policy_check', arguments: { text: 'some content' } }
});
console.log(JSON.parse(res.content[0].text).verdict);
```

Every result carries framework citations. **NOT LEGAL ADVICE.**

## License
Apache-2.0.
