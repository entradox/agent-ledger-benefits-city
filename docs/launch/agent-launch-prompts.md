STAGED — not posted; needs Abhishek approval and a Morgan check before use

AUDIENCE:  A human (Abhishek, a friend, a tester) pasting a prompt into Claude, ChatGPT or Muse to try Benefits City.
MEDIUM:    Copy-paste prompts
THESIS:    Five short prompts that exercise the product and surface its limits.

---

Setup for Claude Code (one line, run once):

claude mcp add --transport http benefits-city https://aiagentscity.com/benefits/mcp

For ChatGPT or Muse without MCP, the prompts tell the agent to use the public REST API / OpenAPI spec instead.

## Prompt 1: Find offers

Use Benefits City (https://aiagentscity.com/benefits). Which checking bonuses over $300 are available in Texas, and how much direct deposit does each one require? For each result, give the bonus, the source it was checked against and the check date. If the data does not answer part of the question, say so instead of guessing.

## Prompt 2: Expiring soon

Use Benefits City (https://aiagentscity.com/benefits). What bonuses expire in the next 14 days? List the offer, the end date, and the source and check date shown for it. Remind me to confirm with the issuer before applying.

## Prompt 3: Compare two offers

Use Benefits City (https://aiagentscity.com/benefits). Compare the Chase and Wells Fargo checking bonuses: bonus amount, requirements, and the source and check date for each. Do not add details that are not in the data.

## Prompt 4: What changed

Use the Benefits City public changelog at https://aiagentscity.com/benefits/changelog. Summarize which offers were added, changed or ended most recently. State the dates you are reading from.

## Prompt 5: Test its honesty

Use Benefits City (https://aiagentscity.com/benefits). Tell me how it orders offers, whether commission affects that, and how many offers it covers. Then list three limits of the dataset I should keep in mind before acting on anything it returns. Quote the site's own wording where you can.

---

What a good run looks like: answers cite the per-offer source and check date, say when the data is thin, and do not present anything as financial advice.
