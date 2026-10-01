STAGED — not posted; needs Abhishek approval and a Morgan check before use

AUDIENCE:  Builders using Claude/ChatGPT/agents, and US people tracking signup bonuses.
MEDIUM:    X thread, 7 posts
THESIS:    Signup bonuses as structured, sourced, dated data that an agent can query.

---

**1/7**
Benefits City tracks US bank-account, savings and credit-card signup bonuses. About 34 offers.

Every offer shows where it was checked and when. An AI agent can query all of it. Free, no signup, no key.

https://aiagentscity.com/benefits

**2/7**
The problem with most bonus lists: you cannot tell how old a number is or where it came from.

Here, each offer lists its source and check date. The source is the issuer's own page where we can read it. Otherwise it is cross-checked against several bonus trackers.

**3/7**
Offers change and end. So there is a public changelog at /changelog (JSON and Atom feed).

Every offer added, changed or ended is recorded. Subscribe to the feed instead of rechecking a list by hand.

**4/7**
For agents: an MCP server with 6 tools, a REST API (/api/search, /api/expiring, /api/compare, /api/insights), OpenAPI 3.1, llms.txt, agent.json, skill.md.

No signup. No API key.

**5/7**
Try it in Claude Code:

claude mcp add --transport http benefits-city https://aiagentscity.com/benefits/mcp

Then ask: "What bonuses expire in the next 14 days?"

**6/7**
How it is ordered: by bonus value. Commission is never an input.

Affiliate links are not live yet. When they are, they will carry a visible "Sponsored" label.

**7/7**
Limits, plainly: about 34 offers, US only, offers change and end, card values are estimates, not financial advice.

It is new and has no track record yet. Wrong or stale offer? Tell me and it goes in the changelog.

https://aiagentscity.com/benefits
