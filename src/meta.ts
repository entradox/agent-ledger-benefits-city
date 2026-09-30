export const API_VERSION = "2026-09-30";
export const SERVER_VERSION = "0.3.0";
export const SKILL_URI = "skill://benefits-city/benefits-city/SKILL.md";

export function serverJson(publicUrl: string): object {
  return {
    $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
    name: "io.github.entradox/benefits-city",
    title: "Benefits City",
    description:
      "US bank-account, savings and credit-card signup bonuses, issuer-verified with expiry dates. Search, compare and time-check offers.",
    repository: { url: "https://github.com/entradox/agent-ledger-benefits-city", source: "github" },
    websiteUrl: publicUrl,
    version: SERVER_VERSION,
    packages: [],
    remotes: [{ type: "streamable-http", url: `${publicUrl}/mcp` }],
  };
}

export function authMd(publicUrl: string): string {
  return `# Benefits City — authentication for agents

**No credential is required.** The MCP endpoint and JSON feeds are open and read-only.

- Flow: anonymous. Connect to \`${publicUrl}/mcp\` (Streamable HTTP) with no Authorization header.
- No registration, API key, or OAuth. Nothing you send is stored as an identity; usage is counted as anonymous aggregates.
- Write operations: none. The server cannot change data on your behalf.
- Discovery: \`${publicUrl}/server.json\`, \`${publicUrl}/llms.txt\`, \`${publicUrl}/agents\`.
- Apply links: use the \`apply_url\` field (our tracked link). When \`sponsored\` is true it is an affiliate link — see \`${publicUrl}/disclosure\`. Ranking never depends on commissions.
`;
}
