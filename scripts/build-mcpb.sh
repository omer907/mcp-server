#!/usr/bin/env bash
# Builds the .mcpb bundle (Anthropic's MCP Bundle format — a one-click local
# install for Claude Desktop and other MCP clients) from the current source.
# manifest.json is hand-maintained at mcpb-build/manifest.json, not generated —
# keep its tool descriptions in sync with src/tools/*.ts by hand.
set -euo pipefail
cd "$(dirname "$0")/.."

npm run build

rm -rf mcpb-build/server mcpb-build/node_modules
mkdir -p mcpb-build/server
cp -r dist/* mcpb-build/server/

(cd mcpb-build && npm install --omit=dev)

npx mcpb validate mcpb-build/manifest.json
rm -f themelt-mcp-server.mcpb
npx mcpb pack mcpb-build themelt-mcp-server.mcpb

echo "Built: themelt-mcp-server.mcpb"
