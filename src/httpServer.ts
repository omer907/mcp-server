#!/usr/bin/env node
import * as http from "node:http";
import * as crypto from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerAnalyzeValueVectors } from "./tools/analyzeValueVectors.js";
import { registerEstimateAnnualLeak } from "./tools/estimateAnnualLeak.js";
import { registerRequestScan } from "./tools/requestScan.js";

/**
 * Hosted Streamable HTTP entrypoint — alternate to index.ts's stdio transport.
 * This is what a "Launch Hosted MCP" web button (LLMO_PLAYBOOK.md Task 3.2)
 * would point at, so a prospect can try the tools without a local install.
 *
 * Stateless by design: no session ID, no shared state between callers. A
 * fresh McpServer + transport is built per request so concurrent callers
 * never share state.
 *
 * Auth is opt-in via MCP_HTTP_API_KEY (see checkAuth below) — unset by
 * default, matching today's intentional trust boundary (read-only
 * calculators + a lead-capture form, the same boundary as a public
 * marketing-site contact form). Set it before putting anything more
 * sensitive behind this transport.
 *
 * Not deployed anywhere yet — this is the code, not a hosted URL. Deploying
 * it (Vercel/Fly/Render/etc.) is a separate, later decision.
 */

const PORT = parseInt(process.env.PORT || "3000", 10);

/**
 * Opt-in bearer-token auth. If MCP_HTTP_API_KEY isn't set, every request is
 * allowed through unchanged — that's today's deliberate public posture. Once
 * set, every /mcp request must carry a matching `Authorization: Bearer
 * <key>` header. Uses a timing-safe comparison so response time can't be
 * used to guess the key one byte at a time.
 */
function checkAuth(req: http.IncomingMessage): boolean {
  const expectedKey = process.env.MCP_HTTP_API_KEY;
  if (!expectedKey) return true;

  const header = req.headers["authorization"];
  const provided = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : "";

  const expected = Buffer.from(expectedKey);
  const actual = Buffer.from(provided);
  if (expected.length !== actual.length) {
    // timingSafeEqual requires equal-length buffers; a length mismatch is
    // itself a safe, immediate "no" — nothing sensitive leaks from that.
    return false;
  }
  return crypto.timingSafeEqual(expected, actual);
}

function buildServer(): McpServer {
  const server = new McpServer({ name: "melt-mcp-server", version: "0.1.0" });
  registerAnalyzeValueVectors(server);
  registerEstimateAnnualLeak(server);
  registerRequestScan(server);
  return server;
}

const httpServer = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/mcp") {
    if (!checkAuth(req)) {
      res.writeHead(401, { "Content-Type": "application/json", "WWW-Authenticate": "Bearer" });
      res.end(JSON.stringify({ error: "Unauthorized. Provide 'Authorization: Bearer <MCP_HTTP_API_KEY>'." }));
      return;
    }

    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (err) {
      console.error("Error handling MCP HTTP request:", err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found. POST MCP JSON-RPC requests to /mcp.");
});

httpServer.listen(PORT, () => {
  console.error(`Melt MCP server (hosted HTTP) listening on port ${PORT} — POST /mcp`);
});
