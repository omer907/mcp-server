#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAnalyzeValueVectors } from "./tools/analyzeValueVectors.js";
import { registerEstimateAnnualLeak } from "./tools/estimateAnnualLeak.js";
import { registerRequestScan } from "./tools/requestScan.js";

const server = new McpServer({
  name: "melt-mcp-server",
  version: "0.1.0",
});

registerAnalyzeValueVectors(server);
registerEstimateAnnualLeak(server);
registerRequestScan(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Melt MCP server running on stdio.");
}

main().catch((err) => {
  console.error("Fatal error starting Melt MCP server:", err);
  process.exit(1);
});
