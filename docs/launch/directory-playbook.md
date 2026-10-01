# Benefits City - MCP/AI Directory Submission Playbook

Researched by Alan, all pages fetched live 2026-10-01 (access date for every source below). Research only; nothing submitted. Fetch tool summarizes pages, so quotes are paraphrase unless marked.

## Summary table

| Directory | Method | Remote (streamable-http) | Cost | Key requirement | Status 2026-10-01 |
|---|---|---|---|---|---|
| Official MCP Registry | CLI `mcp-publisher publish` | Yes (`remotes`) | none stated | namespace proven by auth; description <=100 chars | Open (preview) |
| Smithery | URL publish at smithery.ai/new or `smithery mcp publish` | Yes (requires Streamable HTTP) | none stated | allow `SmitheryBot/1.0` through WAF or serve `/.well-known/mcp/server-card.json` | Open |
| Glama | auto-index / add flow | Listed as "remote-capable" | UNVERIFIED | UNVERIFIED | Submission page not retrievable |
| PulseMCP | form | n/a | n/a | n/a | **Paused** since 2026-09-03; will ingest official-registry listings |
| mcp.so | web form /submit | Yes ("Remote Server" type) | Free tier exists; $39 one-time for instant publish + badge | Repository URL field required | Open |
| awesome-mcp-servers | PR | **No** (public GitHub repo, self-run servers only) | free | public GitHub repo | Open |
| awesome-remote-mcp-servers | PR | Yes | free | Glama connector badge, `initialize` must respond, star repo | Open |
| Cursor | UNVERIFIED | UNVERIFIED | UNVERIFIED | `/marketplace/publish` exists, content not retrievable | UNVERIFIED |
| Claude Connectors Directory | Dev portal claude.ai/directory/manage -> "MCP connector" | Yes (HTTPS) | any paid Claude plan to submit | tool annotations, docs, privacy policy URL, test account | Open always |
| ChatGPT app directory | OpenAI Platform dashboard, ZIP package | Yes | not stated | verified org, domain challenge, demo video | Open |

## Per-directory notes

**1. Official MCP Registry.** Flow: `mcp-publisher init` -> edit `server.json` -> `mcp-publisher login <method>` -> `mcp-publisher publish`. Remote entry: `"remotes":[{"type":"streamable-http","url":"https://..."}]`; server "MUST be publicly accessible"; SSE deprecated. Auth: GitHub (name must be `io.github.<user>/*`), DNS TXT (`v=MCPv1; k=ed25519; p=...`), HTTP (`/.well-known/mcp-registry-auth`); domain methods need name `com.example.*/*` reverse-DNS. For aiagentscity.com the name would be `com.aiagentscity/benefits` via HTTP or DNS auth (inference from rule; confirm at publish). Schema limits (2025-12-11 schema): name 3-200 chars, pattern `^[a-zA-Z0-9.-]+/[a-zA-Z0-9._-]+$`; **description 1-100 chars**; title 1-100; version <=255; icon src <=255; `_meta` publisher data <=4096 bytes under key `io.modelcontextprotocol.registry/publisher-provided`. Registry hosts metadata only; remote-only needs no npm package. Troubleshooting doc: "Invalid or expired Registry JWT token" -> re-run login. Token lifetime: UNVERIFIED in docs (your 5-minute figure not confirmed; login immediately before publish).
Sources: modelcontextprotocol.io/registry/quickstart, /registry/remote-servers, /registry/authentication; static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json; github.com/modelcontextprotocol/registry docs/reference/server-json/official-registry-requirements.md.

**2. Smithery.** Three paths; URL publish needs Streamable HTTP, optional OAuth. Automatic scan catalogs tools/prompts/resources; fallback static card at `/.well-known/mcp/server-card.json`. Common failure: 403 from WAF/bot protection against UA `SmitheryBot/1.0`. Verification checklist under Settings -> Verification. No fee mentioned. Review time not stated.
Source: smithery.ai/docs/build/publish.

**3. Glama.** Directory shows 94,676 servers and 25,840 connectors, sortable by popularity/recency. Add-server page and docs returned 404 or no content; submission method, requirements, cost UNVERIFIED. Note awesome-remote-mcp-servers requires a Glama connector badge, so a Glama listing is a dependency for that list.
Sources: glama.ai/mcp/servers, glama.ai/mcp/connectors.

**4. PulseMCP.** Submissions and listing changes paused (page dated 2026-09-03, no reopen date). Page itself says it will integrate official-registry listings. Action: do the Official Registry first.
Source: pulsemcp.com/submit.

**5. mcp.so.** Form at /submit; types MCP Server, Remote Server, Client, AI Agent; "Repository URL" required (a remote-only server with no public repo may be a problem: UNVERIFIED). Free option exists; $39 one-time fee buys immediate publication, verified badge, featured placement, dofollow link. Spending requires Abhishek approval.
Source: mcp.so/submit.

**6. awesome-mcp-servers (punkpeye).** Only servers with public GitHub repos users can run themselves; hosted-only belongs in awesome-remote-mcp-servers. Entry = name linked to repo + short description, alphabetical in category, PR to README.md. Agent PRs may add `🤖🤖🤖` to title for fast-track.
**awesome-remote-mcp-servers.** Endpoint must answer MCP `initialize` (CI-checked), publicly usable, entry description <=120 chars, auth marker (no-auth / API key / OAuth), Glama connector badge, star the repo, name links to homepage not GitHub.
Sources: github.com/punkpeye/awesome-mcp-servers/blob/main/CONTRIBUTING.md; github.com/punkpeye/awesome-remote-mcp-servers/blob/main/CONTRIBUTING.md.

**7. Cursor.** Marketplace has a Publish link at cursor.com/marketplace/publish; instructions not retrievable (429 on cursor.directory; blank template on cursor.com). All UNVERIFIED.

**8. Anthropic Claude Connectors Directory.** Submit at claude.ai/directory/manage -> Submit new -> MCP connector. Requires: HTTPS remote URL; OAuth 2.0 for authenticated services (no auth OK for public data); every tool has `title` + `readOnlyHint` or `destructiveHint`; docs URL, privacy policy URL, support contact, icon; reviewer test account; 7 policy acknowledgments incl. financial transactions; Anthropic Software Directory Terms/Policy. Listing limits: name <=100, one-liner <=200, description <=2,000, 1-5 categories, permanent URL slug. Review: automated scan, then by default listed as "Community" connector; some get human review, times vary; escalate mcp-review@anthropic.com. Any paid Claude plan can submit; no fee mentioned. Verified status is a separate path (claude.com/docs/connectors/verification, not fetched). Flag: the "financial transactions" acknowledgment and Benefits City's affiliate/bonus content should go to Morgan before submitting.
Source: claude.com/docs/connectors/building/submission.

**9. OpenAI ChatGPT.** Docs now call the unit "plugin" (ZIP package; MCP server must be in the first submission). Submit via OpenAI Platform dashboard; org must be verified. For MCP: host challenge token as plain text at `https://<domain>/.well-known/openai-apps-challenge`; provide valid website, support, privacy, terms URLs; reviewer test account (no MFA); five positive and three negative test cases; demo video. Hosted MCP changes scanned daily. Prohibited: commerce in digital goods/subscriptions/services (check Benefits City is informational only, Morgan). Cost and review time not stated.
Sources: developers.openai.com/apps-sdk/deploy/submission; developers.openai.com/apps-sdk/app-submission-guidelines.

## Ranking / conversion guidance documented by platforms
- OpenAI: metadata is product copy; descriptions start "Use this when..." and state when NOT to use; examples in parameters; set `readOnlyHint: true`, `destructiveHint: false`, `openWorldHint`; test with direct, indirect, negative prompts; precision on negatives first. Strong utility and satisfaction "may be eligible" for directory placement (no algorithm given). Example prompts are required at submission. (developers.openai.com/apps-sdk/guides/optimize-metadata, accessed 2026-10-01)
- Anthropic: detail-card description is yours and Anthropic cannot edit it; annotations and docs are review criteria. No ranking factors documented.
- Glama sorts by usage/popularity (stars, downloads); mcp.so sells featured placement. Neither documents organic ranking.

## UNVERIFIED list
- Registry login token lifetime (5 min claim unconfirmed in docs).
- Glama submission method, requirements, cost.
- Cursor submission process, requirements, cost.
- mcp.so: whether remote server without public repo is accepted; free-tier review time.
- Review times for Smithery, mcp.so, OpenAI, Anthropic human review.
- Official registry: whether `com.aiagentscity/benefits` name needs anything beyond DNS/HTTP proof (inferred from namespace rule).
- Anthropic Verified-tier criteria; OpenAI cost.
