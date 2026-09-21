#!/usr/bin/env node
/**
 * Benefits City — MCP server (stdio transport).
 *
 * Tool definitions live in src/mcp-tools.ts so stdio and Streamable HTTP
 * can never drift apart.
 *
 * Run:  npm run mcp
 * Env:  BONUS_DB_PATH  (optional override of data/bonuses.json)
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./mcp-tools.js";

async function main(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCP server failed to start:", err);
  process.exit(1);
});
