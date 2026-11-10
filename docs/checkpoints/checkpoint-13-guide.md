# Checkpoint 13: Website shell, sign-up, dashboard, Freeze

Claude writes this. You do two setup steps (Privy and a sponsor account) and then try it in the browser. No contract changes.

## Login: what we checked first

near.com's own login is a **passkey** (fingerprint, face or device passcode) plus wallets from many chains through NEAR Intents. The other-chain wallets get an `intents.near` balance, not a NEAR account, so they can't be a company's guardian. We copy the passkey and NEAR-wallet parts.

| Option | Google / email / passkey? | Testnet? | Verdict |
|---|---|---|---|
| HOT (via NEAR Connect) | No, it's a wallet you must already have | No: its entry says `testnet: false` | Not for sign-up |
| NEAR Auth (NEAR's own, `@fast-auth-near/*` 1.4) | Yes | Yes, but the shared test login only accepts `http://localhost:3000` (we checked: any other address gets 403). Our own login needs NEAR's approval | **Not now**: see below |
| Privy | Yes, all three; makes a NEAR account for the user | Yes: the account works on any network | **Use for sign-up** |
| NEAR Connect (Meteor, Intear, MyNearWallet…) | No | Yes, for wallets marked testnet | **Keep as "I already have a NEAR account"** |

Why not NEAR Auth, from a trial against its docs, package and live login server:

1. **It doesn't make the account.** It gives each login a key; we'd still create and fund the account.
2. **Every signature opens a login popup**, because each one needs a fresh login token tied to that exact transaction. Sign-up (2 steps) and Freeze would each pop up.
3. **Every signature is also an on-chain call** to `fast-auth.testnet`, sent and paid by our server. Logging in too.
4. **The hosted site couldn't use it**, because the shared test login only allows `localhost:3000`. Judges couldn't log in.

NEAR Auth goes in the README as "next, for mainnet". Privy isn't in the hackathon partner table, and no partner there offers Google or passkey login, so this is the one place we use an outside tool.

How it works for a beginner: **Continue with Google** (or a passkey) → Privy makes a NEAR account for them in the background → it signs our login challenge (the same one from checkpoint 12) → they're in. No seed phrase, no wallet app, no popups to approve each step.

A new Privy account starts empty. On testnet, our server gives each new account a small amount of test NEAR once (the "sponsor"), so sign-up stays one click. On mainnet, people would add money themselves.

## Pages

| Page | What the user sees |
|---|---|
| `/` | Short placeholder home with **Get started**. The real landing page is checkpoint 19 |
| `/login` | One **Continue with Google, email or passkey** button (opens Privy), and a small "I already have a NEAR account" link |
| `/start` | The sign-up wizard (below) |
| `/dashboard` | The company's home (below) |

## Sign-up wizard (`/start`)

A numbered list of all 7 steps sits beside the form (a step counter on phones), loosely inspired by Novi Corpus's sign-up.

1. **Your account:** already done by login; shown ticked.
2. **Your business:** name (becomes `name.bizzy-fy.testnet`, checked as you type) and one line about it.
3. **Spending rules:** three presets (Small: 1 a deal, 3 a week; Medium: 2 and 5; Large: 5 and 20). **Who it may pay** defaults to "Only businesses I approve". Adding approved businesses comes with invite links in checkpoint 16.
4. **Starting money:** between 0.5 and 5 NEAR, keeping 0.2 back for fees. The cap stops the registry's refund failing if creation goes wrong.
5. **Open your business:** a summary, then one button signs `create_company`.
6. **Prove you're human:** World ID. It comes after step 5 because the proof is written to a business that must already exist. "Do this later" skips it; the dashboard keeps the button.
7. **Turn on your agent:** the server makes the agent key and the user signs `set_agent_key`.

Steps 6 and 7 can't go back. Someone who leaves after step 5 comes back to step 6 or 7, and the dashboard sends a business without an agent key back to `/start`.

If someone arrives with `?ref=name`, that company is sent as the `referrer`.

## Dashboard (`/dashboard`)

| Part | Comes from |
|---|---|
| Balance you can spend | `get_available_balance` |
| Spent this period, out of the limit | `get_spent_this_period`, `get_limits` |
| Agent: on / frozen / unfreezes at … | `get_status`, `get_agent_key`, `get_unfreeze_at` |
| Score and badges (verified human) | registry `get_score`, `get_company` |
| Waiting for your OK (deals over the limit) | `get_pending_approvals`, with **Approve** and **Reject** |
| Your deals | escrow `get_deals`, filtered to this company (full deal pages are checkpoint 15) |
| Change limits, add money, withdraw | `set_limits`, a transfer, `withdraw` |

### Team treasury

Savings the agent can't touch, as a **Sputnik DAO** multisig (the contract Trezu is built on), made through the public testnet factory `sputnikv2.testnet`. No contract changes from us.

- **Address:** always `bizzy-<name>.sputnikv2.testnet`, so nothing is stored.
- **Create:** the guardian signs the factory's `create`, with optional teammates. Every member can ask; more than half must approve. The factory charges **5.5 NEAR** (storage for the DAO's code), more than the free 1 NEAR, so on testnet you top up from the faucet first.
- **Move to agent:** one transaction with `add_proposal` (a transfer to the business) and `act_proposal` approving it. If you're the only member it pays out at once; otherwise it waits for teammates, who see **Approve / Reject**.
- **Move from agent to treasury:** the policy's `withdraw` with the treasury as `to`.
- **Private version:** Trezu's confidential treasuries are mainnet only, so we show one separately: `docs/confidential-treasury.md`.

Trezu's own app and backend only support mainnet (`*.sputnik-dao.near`), so on testnet we call the Sputnik contracts directly. Tested live: create (tx `HMH4kKKC…`), then a 0.5 NEAR transfer asked and approved in one transaction (tx `3LUdkbuj…`).

**Freeze** is the big red button. One click sends one transaction: `freeze` plus `deal_action cancel` for each deal still waiting to be accepted. The agent key is gone at once. **Unfreeze** only works after the 1-hour cooldown, and the page counts it down.

## How Privy accounts sign

Privy makes a NEAR account whose name is its own key (a 64-character "implicit" account), and only signs raw hashes. `lib/wallet.tsx` plugs that into near-kit as a custom signer, and `lib/near/nep413.ts` builds the login hash. Such an account doesn't exist on chain until money arrives, so at login the server accepts the signature alone when the account name matches the key and the account isn't on chain yet (`lib/server/auth.ts`). Then `/api/sponsor` sends the free test NEAR, which also creates the account.

Privy's package expects some Solana packages to be installed even though we don't use Solana, so they're in `package.json`.

## Words we use

| Chain word | What the page says |
|---|---|
| Wallet, account ID | Your account, your business address |
| Transaction, gas | (hidden) |
| Tx hash | **Receipt**, a link to the explorer |
| Escrow | Money held until delivery |
| Function-call key | Your agent's limited key |

## Your setup

### 1. Privy

1. Go to https://dashboard.privy.io and create an app.
2. Turn on **Google**, **Email** and **Passkey** login.
3. Turn on NEAR embedded wallets, and set them to be made on login for users without one.
4. Add `http://localhost:3000` as an allowed origin.
5. Add to `frontend/.env.local`:

```
NEXT_PUBLIC_PRIVY_APP_ID=...
```

The app ID is public by design (it's in the browser). Don't add the app secret; we don't need it.

### 2. Sponsor account (free test NEAR for new users)

Run this in your own terminal. It makes a separate account that the faucet funds. **Don't** make it under `bizzy-fy.testnet`; the escrow treats those as companies.

```sh
near account create-account sponsor-by-faucet-service bizzy-fy-sponsor.testnet autogenerate-new-keypair print-to-terminal network-config testnet create
```

Add its secret keypair:

```
SPONSOR_KEY=ed25519:...
```

The server gives each new account 1 test NEAR, only once, and stops after a daily total, so it can't be drained.

## Check (do X → see Y)

From `frontend/`, run `npm run dev` and open http://localhost:3000.

1. **Continue with Google, email or passkey** → you land on `/start` with no wallet popup. On step 3 it says you have about 1 NEAR (the free test NEAR).
2. Try the name `cafe` → "That name is taken." before you can continue.
3. Open a business with a free name → you land on **Prove you're human**. Press **Verify you're human** and use the World ID simulator (https://simulator.worldcoin.org/) → "Verified." appears.
4. **Turn on my agent** → the dashboard shows your balance, limits, "Agent is on" and the "Verified human" badge. (Reload the page between steps 3 and 4 once: you should come back to the step you were on.)
5. Press **Freeze agent** → "Agent is frozen" with a countdown, and a **Receipt** link that opens on the explorer. **Turn agent back on** stays greyed out for an hour.
6. **Team treasury** (needs about 6 test NEAR in your account: top up at https://near-faucet.io): **Create team treasury** → its balance shows. **Move from agent to treasury** 0.2 → the treasury goes up. **Move to agent** 0.1 → it comes back at once (you're the only member).
7. Sign out, then sign in with **I already have a NEAR account** (Meteor on testnet) → you go to `/start` for that account, or to its dashboard if it already has a business.

Already checked by Claude on testnet, with a fresh account signing exactly as a Privy account does: login before the account exists, the free test NEAR (and no second gift), creating a business with a referrer, setting the agent key, freeze deleting the key, and an early unfreeze refused with "Cooldown not over".

`npm run build`, `npm run lint` and `npm test` must be clean.

## Not in this checkpoint

Agents negotiating (14), deal pages (15), invite links and approved businesses (16), netting (17), referral page, share card and landing page (19).
