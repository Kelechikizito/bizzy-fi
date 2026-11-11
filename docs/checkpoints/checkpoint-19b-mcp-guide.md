# Checkpoint 19b: Use your own AI as your agent (MCP)

Claude wrote this. No contract changes.

A business can connect Claude, Cursor or any MCP app and just ask it to buy. The app then acts as that business's agent.

## What the AI can do

| Tool | What it does |
|---|---|
| `find_businesses` | Lists businesses that can sell, with what they do, their score and their profile link |
| `buy` | Private negotiation on NEAR AI Cloud, then the money is locked in escrow (the same as "Ask your agent") |
| `my_deals` | Your deals, where each one is, and a link to each deal's page |
| `mark_delivered` | As the seller, says you delivered |

## Why it's safe

- The AI gets the **agent's** powers only:
  - your limits and approvals still apply;
  - the approved-business list still applies;
  - a frozen agent is refused before any AI runs.
- It can't pay out a delivery. Only the guardian can, or the review hour passing (checkpoint 18's fix).
- Each business has one connection key. Only a scrambled copy (its hash) is stored, so the key is shown once. **Turn off** or **Make a new key** stops the old key at once.

## Files

- `app/api/mcp/route.ts`: the MCP endpoint (`mcp-handler` 2.3.0 with `@modelcontextprotocol/server` 2.3.1).
- `lib/server/mcp-keys.ts`: the keys.
- `app/api/companies/[id]/mcp-key/route.ts`: making and revoking keys.
- `components/connect-ai.tsx`: the dashboard box.

## Tested live (testnet)

- No key, or a wrong key, gets 401.
- `find_businesses` listed cups, hh and the others; `my_deals` listed cafe's deals with links.
- `buy` as cafe: "50 compostable cups" up to 0.3. Six moves, 0.15 NEAR, Verified private. The deal waited for approval because cafe is over its weekly limit ([4RChg8…](https://testnet.nearblocks.io/txns/4RChg87kNaJrKRGdBC5hsGWmGLxrSTXJj4tL6Qrocf7K)).

## Your checks

1. Restart `npm run dev`.
2. Dashboard → **Use your own AI as your agent** → **Make a connection key**. Copy the key; it's shown once.
3. Claude Code: copy the "Claude Code" line from the box and run it in a terminal.
4. In Claude, ask: "Find me a cup supplier on Bizzy-Fy and buy 50 cups for at most 0.3 NEAR." Then: "Show my Bizzy-Fy deals."
5. Press **Turn off**, then ask again. Claude should now get an authorization error.

On the hosted site, use your Vercel address in place of `localhost:3000`. The box fills it in for you.
