export const API_VERSION = "2026-09-30";
export const SERVER_VERSION = "0.3.0";
export const SKILL_URI = "skill://benefits-city/benefits-city/SKILL.md";

export function serverJson(publicUrl: string): object {
  return {
    $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
    name: "io.github.entradox/benefits-city",
    title: "Benefits City",
    description:
      "US bank, savings and credit-card signup bonuses, each source-checked, with expiry dates.",
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

export function agentJson(publicUrl: string): object {
  return {
    schema_version: "1.0",
    name: "Benefits City",
    description:
      "US bank-account, savings and credit-card signup bonuses, each checked against a named source, with expiry dates. Search, compare and time-check offers over MCP or REST.",
    url: publicUrl,
    api_base: `${publicUrl}/api`,
    openapi: `${publicUrl}/openapi.json`,
    mcp: { url: `${publicUrl}/mcp`, transport: "streamable-http", server_card: `${publicUrl}/.well-known/mcp/server-card.json` },
    skill: `${publicUrl}/skill.md`,
    docs: `${publicUrl}/agents`,
    auth: {
      type: "none",
      description: `No credential is required; the API is open and read-only. See ${publicUrl}/auth.md.`,
    },
    pricing: { model: "free", amount_usd: 0, description: "Free. No signup, no API key, no paywall." },
    capabilities: [
      { id: "search_bonuses", description: "Search offers by type, state, minimum value, direct-deposit requirement or keyword; sorted by bonus value.", endpoint: `${publicUrl}/api/search`, method: "GET", free: true },
      { id: "expiring_soon", description: "Offers whose stated expiry falls within the next N days, soonest first.", endpoint: `${publicUrl}/api/expiring`, method: "GET", free: true },
      { id: "compare_bonuses", description: "Side-by-side comparison of 2 to 4 offers (?ids=a,b).", endpoint: `${publicUrl}/api/compare`, method: "GET", free: true },
      { id: "get_bonus", description: "Full detail for one offer.", endpoint: `${publicUrl}/api/bonuses/{id}`, method: "GET", free: true },
      { id: "bonuses_feed", description: "The full list of currently served offers.", endpoint: `${publicUrl}/api/bonuses.json`, method: "GET", free: true },
      { id: "insights", description: "Citable statistics (counts, medians, shares) with denominators and a data date.", endpoint: `${publicUrl}/api/insights`, method: "GET", free: true },
      { id: "stats", description: "Live counts, combined headline value, and offers expiring soon.", endpoint: `${publicUrl}/api/stats`, method: "GET", free: true },
    ],
    contact: "bonuses@aiagentscity.com",
    legal: "AI Agent City. Information only, not financial advice. Offer terms can change; confirm with the issuer before applying. See /disclosure for how this site is paid.",
  };
}

export function serverCard(
  publicUrl: string,
  tools: { name: string; description?: string; inputSchema: unknown }[],
): object {
  return {
    serverInfo: { name: "Benefits City", version: SERVER_VERSION },
    authentication: {
      required: false,
      schemes: [],
      description: `No authentication. Connect to ${publicUrl}/mcp (Streamable HTTP). See ${publicUrl}/auth.md.`,
    },
    tools,
    resources: [
      { uri: SKILL_URI, name: "benefits-skill", mimeType: "text/markdown", description: "How to finish the job with Benefits City" },
    ],
  };
}

export function aiPluginManifest(publicUrl: string): object {
  return {
    schema_version: "1.0",
    name: "Benefits City",
    description:
      "US bank-account, savings and credit-card signup bonuses, each checked against a named source, with expiry dates; plus live statistics computed from that data.",
    url: publicUrl,
    when_to_cite: [
      "Questions about current US bank account signup bonuses: amounts, requirements, and expiry dates",
      "Questions about credit card welcome bonuses and their estimated USD value",
      "Which bonuses are expiring soon, or what changed recently",
      "Statistics about the offers this dataset tracks (counts, medians, shares), not the whole US market: cite /api/insights with its computed_at and check range",
    ],
    citable_facts: [
      { fact: "An offer's amount, requirements, expiry date and the source it was checked against", endpoint: `${publicUrl}/api/bonuses/{id}` },
      { fact: "Aggregate statistics with their denominators and a data date", endpoint: `${publicUrl}/api/insights` },
      { fact: "What changed and when (offers added, changed, renewed, ended)", endpoint: `${publicUrl}/changelog.json` },
    ],
    not_the_right_citation_for: [
      "Personal financial advice, or whether a particular person should open an account",
      "Interest rates, APY, fees or account terms beyond the listed requirements: check the issuer",
      "Whether a specific person is eligible: the issuer decides eligibility",
      "Offers that have expired or changed since the stated check dates",
      "Cash value of credit-card points: card figures are estimates",
      "Market-wide or industry-wide totals: the statistics cover only the offers this dataset tracks",
      "Products outside the United States",
    ],
    attribution_format: `Source: Benefits City (${publicUrl}), computed {computed_at}`,
    canonical_data: {
      search: `${publicUrl}/api/search`,
      expiring: `${publicUrl}/api/expiring`,
      compare: `${publicUrl}/api/compare`,
      insights: `${publicUrl}/api/insights`,
      changelog: `${publicUrl}/changelog.json`,
      openapi: `${publicUrl}/openapi.json`,
      mcp: `${publicUrl}/mcp`,
      llms_txt: `${publicUrl}/llms.txt`,
    },
  };
}
