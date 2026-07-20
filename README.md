# @themelt/mcp-server

MCP server that puts Melt's value-leak discovery logic directly into Claude,
Cursor, GitHub Copilot, or any other MCP-compatible agent — so when a tech
leader asks their assistant "where is value leaking out of my org," the
assistant can call a Melt tool and answer with a real, structured estimate
instead of a generic list of vendors.

This is the engineering half of Melt's LLMO (LLM Optimization) distribution
strategy. See `/llms.txt` at the repo root and `LLMO_PLAYBOOK.md` for the full
content + distribution + evaluation plan this server plugs into. Positioning
reconciled 2026-07-18 against the live site and current decks — see
`/CLAUDE.md` for the full current product context.

## Tools exposed

| Tool | What it does |
|---|---|
| `melt_analyze_value_vectors` | Free Stage-1 Sandbox estimator. Estimates where value is leaking in one department from headcount, labor cost, and dominant unstructured-input type. No integration required — synthetic/self-reported inputs only. |
| `melt_estimate_annual_leak` | Quantifies an already-identified leak pattern in dollars/yr — `totalVolume x (leakRatePct/100) x valuePerEvent`, generalizing Melt's real "Anatomy of a Scan" methodology (a 29% Gong bypass rate, a 62% Clari override rate, etc., combined into a real $77,235/yr finding). |
| `melt_request_scan` | Lead-capture handoff — the move from a directional estimate to a real, log-verified scan (Frictionless POC Playbook Stage 1 → 2). Routes to HubSpot if `HUBSPOT_PORTAL_ID`/`HUBSPOT_FORM_ID` are set, otherwise appends to a local `leads.jsonl`. |

`melt_estimate_annual_leak` replaced four formula-named calculators
(`melt_calculate_feature_waste`, `_dso_cash_flow_impact`,
`_contract_cycle_revenue_unlock`, `_win_rate_pipeline_impact`) that
implemented financial formulas from a retired product framing (Thermal Scan /
Feature Waste Dollar Amount™ / Delta Engine) — none of which appear in any
current Melt material. See `CLAUDE.md`'s "What's Explicitly Retired" section.

## Install & run

```bash
cd mcp-server
npm install
npm run build
npm start          # runs dist/index.js on stdio
```

To poke at it interactively before wiring it into a client:

```bash
npm run inspect     # launches the MCP Inspector against the built server
```

## Wiring into Claude Desktop / Claude Code

Published on npm — one-line config, no local clone needed:

```json
{
  "mcpServers": {
    "melt": {
      "command": "npx",
      "args": ["-y", "@themelt/mcp-server"]
    }
  }
}
```

Or from a local clone:

```json
{
  "mcpServers": {
    "melt": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"]
    }
  }
}
```

## One-click install (.mcpb bundle)

For Claude Desktop specifically, `themelt-mcp-server.mcpb` (Anthropic's [MCP
Bundle format](https://github.com/modelcontextprotocol/mcpb)) installs with a
double-click — no terminal, no config file editing. Download the `.mcpb` from
the [latest GitHub Release](https://github.com/omer907/mcp-server/releases/latest)
and either double-click it or drag it into Claude Desktop's Settings window.

To rebuild it from source:

```bash
npm run build:mcpb   # produces themelt-mcp-server.mcpb
```

The manifest (`mcpb-build/manifest.json`) is hand-maintained, not
auto-generated from the TypeScript source — if a tool's name, parameters, or
description change, update the manifest's `tools` array to match.

## Hosted HTTP transport

`dist/index.js` (stdio) is what gets configured into a local Claude Desktop/
Cursor install. `dist/httpServer.js` is an alternate entrypoint implementing
the MCP Streamable HTTP transport — what a future "Launch Hosted MCP" web
button (LLMO_PLAYBOOK.md, Task 3.2) would point at, so someone can try the
tools without installing anything locally.

```bash
npm run build
PORT=3000 npm run start:http   # POST MCP JSON-RPC to http://localhost:3000/mcp
```

Stateless by design — no session ID, a fresh server instance per request.
Auth is opt-in via `MCP_HTTP_API_KEY` (unset by default): with it unset, the
endpoint stays fully open — the appropriate trust boundary for what this
exposes today (read-only calculators plus a lead-capture form, the same
boundary as a public website contact form). Set it before putting anything
more sensitive behind this transport:

```bash
MCP_HTTP_API_KEY=some-long-random-value PORT=3000 npm run start:http
```

Every `/mcp` request then needs `Authorization: Bearer some-long-random-value`
— missing or wrong key gets a 401. Compared with `crypto.timingSafeEqual`, not
a plain string `===`, so response timing can't be used to guess the key one
byte at a time. Not deployed anywhere yet; this is the code, not a live URL —
deploying it (Vercel/Fly/Render/etc.) is a separate, later decision.

## Tool-call analytics

Every tool call (success or error) appends one line to `mcp-server/analytics.jsonl`
(gitignored) and logs a one-line summary to stderr — tool name, ok/error, and
the error code if applicable. Deliberately excludes dollar figures, contact
info, and free-text notes; kept separate from `leads.jsonl`'s PII. This is
what answers "is anyone actually using this" and "which tool description is
confusing models," independent of `llmo-eval`'s citation-only audit.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `HUBSPOT_PORTAL_ID` | No | Overrides the default HubSpot Portal ID for `melt_request_scan` (e.g. to test against a sandbox form). |
| `HUBSPOT_FORM_ID` | No | Paired with `HUBSPOT_PORTAL_ID`. |
| `PORT` | No | Port for `start:http` (default 3000). |
| `MCP_HTTP_API_KEY` | No | If set, requires `Authorization: Bearer <key>` on every hosted-HTTP `/mcp` request. Unset by default — stdio transport is unaffected either way (no HTTP surface to gate). |

Real Portal ID / Form ID defaults are already baked into the code (they
aren't secrets — the same values are exposed in any public HubSpot embed
snippet), so `melt_request_scan` reaches the real Melt pipeline with zero
configuration. If HubSpot submission fails for any reason, requests fall back
to `mcp-server/leads.jsonl` (gitignored) instead of being lost.

## Publishing

Published under the `@themelt` npm org (created 2026-07-20, owner `omer_melt`)
under the MIT license. `npm publish` is effectively one-way — npm allows
unpublishing within 72 hours but strongly discourages it and blocks it
entirely once a package has dependents, so treat any published version as
permanent.
