# Frontend handoff

For whoever owns the look of the website. The pages work end to end on testnet; you can restyle or rebuild any page freely, as long as it keeps calling the same helpers below. You shouldn't need to touch login, signing or the server.

## Run it

@jinius

```sh
cd frontend
npm install
npm run dev        # http://localhost:3000
```

You need `frontend/.env.local` from a teammate (never commit it). Before pushing: `npm run lint`, `npm test`, `npm run build`.

Stack: Next.js 16, React 19, Tailwind v4 (no PostCSS config; tokens live in `app/globals.css`). **Next 16 differs from older Next:** read the guide in `node_modules/next/dist/docs/` before using a Next feature you haven't used in this repo.

## What's safe to change

| Folder                                     | Yours?               | What it is                                                                 |
| ------------------------------------------ | -------------------- | -------------------------------------------------------------------------- |
| `app/*/page.tsx`                           | **Yes**              | The pages. Layout, copy, components                                        |
| `components/`                              | **Yes**              | `ui.tsx` (Frame, Button, Receipt, Problem), `world-id.tsx`, `treasury.tsx`, `agent.tsx`, `connections.tsx`, `share.tsx` (Post on X), `connect-ai.tsx` (MCP key + setup) |
| `app/globals.css`, `app/layout.tsx`        | **Yes**              | Colours, fonts                                                             |
| `lib/near/read.ts`, `lib/near/treasury.ts` | Read only, ask first | Reads from the chain                                                       |
| `lib/wallet.tsx`                           | Don't change         | Login and signing (Privy + NEAR wallets)                                   |
| `lib/server/`, `app/api/`                  | Don't change         | Backend: sessions, keys, World ID                                          |

## The helpers pages use

```ts
const {
  account,
  busy,
  error,
  signInWithPrivy,
  signInWithWallet,
  signOut,
  send,
} = useSession();
```

- `account`: `undefined` while checking, `null` when signed out, else the account name. Pages redirect on `null`.
- `send(receiver, calls, transfer?)`: signs and sends one transaction; resolves to `{ hash, value }`. Takes a few seconds. Show progress on the button and the `hash` as a `<Receipt>` link afterwards.
- `api(path, body)`: POSTs to our backend and throws the server's error message. MCP: `/api/mcp` (bearer key; tools `find_businesses`, `buy`, `my_deals`, `mark_delivered`), `/api/companies/[id]/mcp-key` (`{ action: "create" | "revoke" }`). Connections: `/api/companies/[id]/connections` (`{ invite }` or `{ demo }`; returns your code and each connection's fingerprint), `/api/invites/[code]`. Agent routes: `/api/companies/[id]/negotiate` (`{ want, max }`, takes 15 to 30 s), `/negotiations` (the list), `/brief` (the private seller notes). `/api/deals/[id]` returns one deal for its buyer or seller (settling it first if due; `{ demoDeliver: true }` makes a demo seller deliver).

Reads (no login needed):

| Helper                             | Returns                                                                                                                                            |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `findCompany(account)`             | The business this person runs, or `null`                                                                                                           |
| `loadDashboard(id)`                | `company` (about, human, referrals, reputation), `score`, `available`, `spent`, `limits`, `status`, `agentKey`, `unfreezeAt`, `approvals`, `deals` |
| `loadTreasury(id)`                 | `null`, or `balance`, `members`, `open` (requests waiting for votes), `nextId`                                                                     |
| `nameFree(name)`, `getCompany(id)` | Name check, one business                                                                                                                           |
| `toNear(yocto)`, `toYocto(near)`   | Amount formatting. Amounts on chain are strings in yocto (10^-24 NEAR)                                                                             |

## Pages: what each shows and does

| Page         | Shows                                                                                                         | Actions (what `send` calls)                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`          | Placeholder; real landing page is checkpoint 19                                                               | Get started                                                                                                                                             |
| `/login`     | One Privy button + "I already have a NEAR account"                                                            | `signInWithPrivy`, `signInWithWallet`                                                                                                                   |
| `/start`     | 7 steps with a step list                                                                                      | Open business: `create_company` on the registry. Prove human: `<WorldIdButton>`. Turn on agent: `/api/companies/[id]/agent-key` then `set_agent_key`    |
| `/` | Landing: real negotiation hero, how a deal goes, safety rules, FAQ | none |
| `/b/[name]` | Public profile: score and track record from the registry, share card (`opengraph-image.tsx`) | none (reads only) |
| `/invite/[code]` | Who invited you; sign up first if needed, then **Connect** (adds them to your approved list) | `allow_counterparty` |
| `/deals/[id]` | Timeline, next step with deadline, private terms, negotiation, badge; buttons only for moves the escrow allows your side | `deal_action`: `cancel`, `mark_delivered`, `confirm`, `dispute`, `propose_split` |
| `/dashboard` | Name, about, score, human badge, Freeze switch, balance, spent vs limit, treasury, approvals, deals, settings, **Ask your agent** + negotiation summaries with the Verified private badge (`components/agent.tsx`) | `freeze` (+ cancel waiting deals), `unfreeze` + `set_agent_key`, `approve` / `reject`, `set_limits`, add money (transfer), `withdraw`, treasury actions |

Every contract method and its arguments are already written in the page code; copy them when moving buttons around.

## Rules the design must keep

- **No crypto words on screen.** Use the table below. No seed phrases, gas or "transaction".
- **One click per action.** Users never approve popups after login.
- **Freeze is always visible** on the dashboard and is the only red control.
- **Every action ends with a Receipt link** (explorer) and fresh numbers.
- Errors go in `<Problem>`: say what happened and what to do.
- Don't call `Date.now()` during render (prerender breaks); use state set in an effect, like the dashboard's `now`.
- Works at phone width; visible keyboard focus; respects reduced motion.

| Chain word              | Say instead                         |
| ----------------------- | ----------------------------------- |
| Wallet, account ID      | Your account, your business address |
| Transaction, gas        | (hidden)                            |
| Tx hash                 | Receipt                             |
| Escrow                  | Money held until delivery           |
| Function-call key       | Your agent's limited key            |
| DAO, multisig, proposal | Team treasury, request, approve     |

## Design tokens now

Colours in `app/globals.css`: `paper #e9efec` (background), `card #f6f9f7`, `ink #17302a` (text, main buttons), `muted #52675f`, `rule #c5d1cc` (lines), `wait #f2c94c` (needs your OK), `stop #d7263d` (Freeze only). Fonts: Bricolage Grotesque for headings (`font-display`), Instrument Sans for body. Change freely; keep `stop` reserved for Freeze.

## Coming next (needs UI)

| Checkpoint | Pages                                                                          |
| ---------- | ------------------------------------------------------------------------------ |
| 14         | Done, working; restyle `components/agent.tsx` freely (keep the badge only when `proof.verified`) |
| 15         | Built (`app/deals/[id]/page.tsx`); restyle freely, keep the buttons' status rules |
| 16         | Built (`components/connections.tsx`, `app/invite/[code]/page.tsx`); no contract changes needed |
| 17         | Netting: running balance per partner, settle                                   |
| 19         | Built: landing, `/b/[name]` profiles, share images, Post on X; hosting is yours (see checkpoint-19-guide) |

## Test accounts

Demo businesses `cafe.bizzy-fy.testnet` and `cups.bizzy-fy.testnet` already have data. To see a fresh sign-up, log in with a new Google or email account: it gets 1 free test NEAR.
