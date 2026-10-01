STAGED — not posted; needs Abhishek approval and a Morgan check before use

AUDIENCE:  Hacker News readers who build with or around AI agents, plus US consumers who chase signup bonuses.
MEDIUM:    Show HN post + first comment
THESIS:    A signup-bonus tracker with sources, check dates, a changelog and an agent-queryable API.

---

## Title

Show HN: Benefits City, US bank signup bonuses with sources and an MCP server

(76 characters. No hype words.)

URL field: https://aiagentscity.com/benefits

## Body (~165 words)

I built Benefits City, a tracker for US bank-account, savings and credit-card signup bonuses. It lists about 34 offers right now.

What it does differently from a bonus blog: every offer shows the source it was checked against and the date it was checked. Where the issuer's own page is readable, that is the source. Otherwise the offer is cross-checked against several bonus trackers. Every offer added, changed or ended goes into a public changelog (JSON and an Atom feed).

It is also built to be queried by AI agents. There is an MCP server with 6 tools, a REST API, an OpenAPI 3.1 spec, llms.txt and an agent.json. No signup, no API key. It is free.

Ordering is by bonus value. Commission is never an input. Affiliate links are not live yet; when they are, they will carry a visible "Sponsored" label.

Limits: the dataset is small, it is US only, offers change and end without notice, card values are estimates, and none of this is financial advice.

Feedback on the data model, and reports of wrong or stale offers, are welcome.

## First comment (post immediately after submitting)

Technical details, since this is the part HN usually asks about.

Surfaces, all unauthenticated:
- MCP server (6 tools), streamable HTTP. Claude Code: `claude mcp add --transport http benefits-city https://aiagentscity.com/benefits/mcp`
- REST: /api/search, /api/expiring, /api/compare, /api/insights
- OpenAPI 3.1, /llms.txt, /.well-known/agent.json, an MCP server card, and a skill.md
- Changelog at /changelog, also as JSON and an Atom feed

Verification model: each offer carries its source and a check date. The source is the issuer's own page when we can read it. When we cannot, we use several bonus trackers and say so on the offer. A check date tells you how fresh the data is; it does not tell you the offer is still live today.

Ordering: by bonus value. Commission is not an input to ordering. There are no live affiliate links. When there are, they will be labelled "Sponsored".

Honest limits:
- About 34 offers. That is a small dataset, not a market survey.
- US only.
- Offers change and end, sometimes without notice. Check the issuer before applying.
- Card bonus values are estimates.
- Not financial advice.
- No usage numbers to share. It is new.

Useful feedback: offers that are wrong or missing, fields an agent would want that are not there, and whether the changelog format is what you would want to consume.
