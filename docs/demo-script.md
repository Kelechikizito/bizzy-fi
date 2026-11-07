# Bizzy-Fy: Demo Video Plan

## Requirements (HACKATHON.md)

- Public post on X that says it was **built at NEAR HACKATHON** and tags **@NEARProtocol** and **#NEARHackathon**. @NearLegion and @NearBuilders are optional extra tags.
- Video attached. If judges can't open a live demo, screenshots aren't enough (Q-012).
- The human posts it; Claude can only draft the text.
- The post link goes in the submission (`demoUrl`) and the README.

## Length

**2 minutes 20 seconds or less.** That's X's limit for free accounts, and judges watch many videos. If you need longer, upload the full version to YouTube and link it in the post and README.

## Structure

Lead with the problem, show one complete moment, make NEAR's role concrete.

| Time | What to show | What to say |
|---|---|---|
| 0:00–0:15 | A lost deposit or "invoice overdue" message (one fact on screen) | "Businesses don't trust each other. Buyers lose deposits; sellers wait months to get paid." |
| 0:15–0:30 | Bizzy-Fy home page | "Bizzy-Fy gives each company an AI agent that negotiates deals privately, with NEAR escrow holding the money." |
| 0:30–1:30 | **One full deal**, live: guardian types "Venue in Singapore for 50 people" → agents negotiate (show "verified private" badge) → both sign → escrow locks → seller delivers → payment releases → reputation goes up | Narrate briefly; let the screen do the work |
| 1:30–1:50 | **Freeze button:** agent tries to go over its limit → guardian approves or freezes → open escrow cancelled, funds back | "The AI never holds the keys. A human can always pull the brake." |
| 1:50–2:10 | Quick list of the NEAR pieces: escrow contract, function-call keys, NEAR AI Cloud, Intents | One sentence each, concrete. Never just "powered by NEAR". |
| 2:10–2:20 | Repo and demo links | "Try it at … What would you trust an agent to buy for your business?" |

The freeze moment is the most memorable shot, so don't cut it.

## Draft narration (venue-booking scenario)

Update the wording once the app is built so it matches what's on screen.

> **[0:00]** Businesses don't trust each other. Buyers lose deposits to suppliers they can't verify, and sellers wait months to get paid.
>
> **[0:15]** Bizzy-Fy fixes that. Every company gets an AI agent that finds partners and negotiates for it, while NEAR holds the money in escrow.
>
> **[0:30]** I run an events company. I just type: "I need a venue in Singapore for 50 people." My agent finds a venue company with a strong track record and starts negotiating with their agent.
>
> **[0:50]** The negotiation runs inside NEAR AI Cloud's secure hardware, so nobody, not even the AI provider, sees our terms. Only a fingerprint of the deal goes on-chain.
>
> **[1:00]** Both agents sign. My payment locks in escrow, so the venue knows the money is real and I know it won't be released until they deliver.
>
> **[1:15]** The venue confirms the booking, the escrow pays out, and both companies' reputations go up, based on real results that can't be faked.
>
> **[1:30]** What if my agent goes rogue? It tries a deal above its limit, and the policy contract stops it and asks me. One click on Freeze removes the agent's key, cancels its open deals, and returns the money to my treasury.
>
> **[1:50]** Under the hood: Rust escrow and policy contracts on NEAR, function-call keys so the AI can never move funds directly, NEAR AI Cloud for private negotiation, and NEAR Intents to pay out in any token on any chain.
>
> **[2:10]** Bizzy-Fy: private by default, guarded by a human, settled on NEAR. Link below. What would you trust an agent to buy for your business?

## Recording on Mac

- **Free:** `Cmd + Shift + 5` → "Record Selected Portion" (choose your mic under Options), or QuickTime → File → New Screen Recording.
- **Nicer:** Screen Studio (automatic zoom on clicks, smooth cursor) or Loom (quick, adds your face).
- **Editing:** iMovie (free, already installed), CapCut (free, easy captions), Descript (edit the video by editing the transcript).

## Tips

- **Record in sections** (onboarding, deal, freeze) and join them; cut out slow testnet waits.
- **Prepare demo data first:** two companies already registered and funded, so the video skips setup.
- **Add captions.** Most people watch X videos muted.
- Browser zoom about 125%, bookmarks and notifications hidden, clean browser profile.
- Record at 1080p. The first 3 seconds need to grab attention, since that's what shows in the feed.
- Briefly show **real transaction links** (testnet explorer) as evidence judges can check.

## Order of work

1. Build the must-have demo path (`docs/architecture.md` §12).
2. Finalize the narration above.
3. Record a rough take, watch it once, fix what's confusing.
4. Record the final version, add captions, export.
5. Post on X (Claude drafts the text; you post).
6. Add the post link to the submission and README.
