# Benefits City — Agent-Native Parity Implementation Plan (D-1527)

> **For agentic workers:** executed natively (superpowers:executing-plans), TDD per task, commit by path.

**Goal:** Match the agent-native surface of aiagentscity.com and the Agent-Native Standard: discovery manifests, OpenAPI, HTTP skill, changelog + feed, and REST parity with the MCP tools; then wire the freshness cron and publish to the MCP registry.
**Spec:** principal-approved in chat 2026-10-01 ("Approve as written"); builds on `docs/superpowers/specs/2026-09-30-trust-and-plumbing-design.md` (D-1518, deployed).
**Measured gap (probed 2026-10-01, city root vs /benefits):** agent.json, mcp/server-card.json, openapi.json, skill.md, /docs, /changelog present on the city, 404 on Benefits City. Skipped on purpose: oauth-protected-resource (city serves `{}`; we have no auth, `/auth.md` covers it).

## Global Constraints
- Commit by path; messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01Cj6mF8e6XcyosYEvup19ET`.
- Raw `affiliate_url` is never published (everything goes through `toPublic`). Ordering never uses commission.
- REST errors use `{"error":{"type","message","code?","param?"}}` (same envelope as MCP).
- Generated manifests (server-card tools, openapi params) derive from the live MCP/route definitions so they cannot drift; a test asserts equality.
- No claims without a live source (rules/live-claim-verification.md). Production deploy, cron change, and registry publish are separate gated steps (cron + publish approved 2026-10-01; deploy re-confirmed before running).

## Review Focus
1. REST params: bad `limit`/`days`/`ids` (non-numeric, out of range, 1 or 5 ids, unknown id) → typed 400/404, never a 500 or silent default.
2. server-card/openapi stay in sync with `createMcpServer()` tools (drift test).
3. Changelog entries can't inject HTML (escaped) or invalid XML (feed escaping).
4. `/docs` alias and `/skill.md` honour BASE_PATH.
5. `agent.json` must not claim auth, pricing tiers or capabilities we don't have.

## Tasks
1. **REST parity + typed errors** — `src/rest.ts` (pure handlers: `restSearch`, `restExpiring`, `restCompare`, `restError`), routes `/api/search`, `/api/expiring`, `/api/compare` in `web-server.ts`; `/api/bonuses/:id` 404 becomes typed. Tests in `src/tests/rest.test.ts` + http test.
2. **Manifests** — `meta.ts`: `agentJson(publicUrl)`, `serverCard(publicUrl, tools)`; route `/.well-known/agent.json`, `/.well-known/mcp/server-card.json` (tools from an in-memory MCP client listTools). Test: server-card tool names/schemas equal the live tool list; agent.json has no auth/pricing overclaims.
3. **OpenAPI 3.1** — `src/openapi.ts` `openapiJson(publicUrl)`; route `/openapi.json`; test: every REST route in a route table exists in the document and vice versa.
4. **skill.md + /docs** — serve `skill/benefits-city/SKILL.md` at `/skill.md` (text/markdown); `/docs` renders the same page as `/agents`.
5. **Changelog** — `changelog/changelog.json` (entries `{date,type,offer_id,summary}`), `src/changelog.ts` (load, HTML page, JSON, Atom feed with escaping); routes `/changelog`, `/changelog.json`, `/feed.xml`; backfill 2026-09-30 data run; `/changelog` in sitemap; discovery links in llms.txt, agents page, README.
6. **Gates** — frame card checklist, Morgan (new copy), Turing (branch), receipts, gate-log.
7. **Freshness cron (approved)** — `~/AI-Workbench/scripts/benefits-freshness.sh` + symlink (verify not a symlink first), no_agent cron daily 06:15 ET, failure lane = fleet lane, fire once and read the delivered result.
8. **Deploy (re-confirm) + live verification**, then **MCP registry publish (approved)** and verify via registry API.
