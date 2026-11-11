# Checkpoint 19: Landing page, profiles, sharing (you host it on Vercel)

Claude wrote the pages. You put the site on Vercel (steps below).

## What's new

- **Landing page** (`app/page.tsx`):
  - a real testnet negotiation as the main picture;
  - "How a deal goes" (4 steps) and "You stay in charge" (limits, freeze, approved businesses, your own contract);
  - an FAQ covering what judges ask: test money, privacy, the badge, non-delivery, rogue agents, wallets, cost, open code.
- **Public profile** at `/b/<name>`, for example `/b/cups`:
  - score, deals paid, on-time rate, businesses dealt with, NEAR paid through escrow, disputes lost, verified-human badge;
  - all of it read from the registry, where only the escrow contract can write it;
  - "Set up your business" signs people up with that business as their referrer.
- **Share images for X**:
  - `app/opengraph-image.tsx` is the home page card;
  - `app/b/[name]/opengraph-image.tsx` is a card per business with its live stats.
- **Post on X** links:
  - on the dashboard (your profile);
  - on each closed, verified negotiation ("My AI agent just closed a deal with cups's agent in 7 moves…"). It never includes the price or the terms.
- **Referrals:** your invite link (checkpoint 16) and your profile's sign-up button both record you as the referrer.
- `vercel.json`: a daily run of `/api/cron/settle` as a backup. Deals also settle whenever their page is opened.

## Put it on Vercel

1. **New project** → import `Kelechikizito/bizzy-fy` → set **Root Directory** to `frontend`.
2. **Database:** the local `bizzy.db` file won't survive on Vercel. Make a free Turso database:

   ```sh
   turso db create bizzy-fy
   turso db show bizzy-fy --url        # → DATABASE_URL (libsql://…)
   turso db tokens create bizzy-fy     # → DATABASE_TOKEN
   ```

3. **Environment variables** (Settings → Environment Variables). Copy each value from your `frontend/.env.local`; never paste them in chat:

   `MASTER_KEY`, `CRON_SECRET`, `ATTESTER_KEY`, `KEEPER_KEY`, `SPONSOR_KEY`, `NEAR_AI_API_KEY`, `WORLD_APP_ID`, `WORLD_RP_ID`, `WORLD_SIGNING_KEY`, `WORLD_ENVIRONMENT`, plus the two new ones: `DATABASE_URL`, `DATABASE_TOKEN`.

   Optional: `NEXT_PUBLIC_SITE_URL` if you add your own domain. Without it, share cards use Vercel's production address automatically.
4. **Deploy.**
5. **Allow the new address:**
   - in the World ID developer portal, update the app's URL if it asks for one.
6. **Load the demo businesses into the hosted database** (from your machine, once):

   ```sh
   cd frontend
   DATABASE_URL='libsql://…' DATABASE_TOKEN='…' node --conditions=react-server --env-file=.env.local --env-file=../scripts/.env.demo scripts/import-demo-agents.ts
   ```

   The values typed before `node` win over `.env.local`, so this writes to Turso.
7. **On the hosted site,** sign in as hh. It will ask you to turn your agent on once, because hh's agent key lived only in your local database. Your invite link and connections start fresh there too.

## Your checks (browser, local first)

1. Open `/`. Check the hero negotiation, the FAQ, and that it looks right on a phone-width window.
2. Open `/b/cups` and `/b/hh`.
3. Dashboard → **Your public profile** and **Post on X** (the X window opens; you don't have to post).
4. After deploying: paste your profile link into the X post box and check that the card preview appears.
