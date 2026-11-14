# Bizzy-Fy features, A to Z

Every feature in the code today, sorted alphabetically. Everything here runs on NEAR testnet. Items that are planned but not built are listed separately at the end.

---

### A

- **About line**: each business has a one-line public description of up to 280 characters, stored in the registry contract.
- **Account with no full-access key**: each business account is created with no full-access key. Only its policy contract and the guardian's rules can move its money.
- **Activity history**: the dashboard lists what happened, such as money added or taken out, limits changed, agent frozen or back on, and deals approved, rejected, accepted, delivered, disputed, split or refunded.
- **Agent key (function-call key)**: the agent's key can only call `open_deal` and `deal_action` on its own account, and has a 1 NEAR gas allowance. Setting a new key deletes the old one.
- **Agent key encryption**: agent private keys are stored encrypted on the server (AES-256-GCM), each under its own derived key.
- **AI listing writer**: "Write my listing" turns one sentence into a full listing (overview, services, website, prices, lowest price, quantity, terms) for the owner to check before saving.
- **Approved businesses only (allowlist)**: an optional rule that the agent may pay only businesses the owner approved. The chain stores only salted hashes, so it doesn't reveal who your partners are.
- **Approvals for over-limit deals**: a deal over the per-deal cap or the weekly cap doesn't fail. It waits for the guardian, who can approve or reject it (up to 20 can wait at once).
- **Approved deal auto-accept**: once the guardian approves a waiting deal, the seller's agent accepts it automatically.
- **Ask your agent**: the owner types what they need in a sentence plus the most they'll pay, and the agent finds a seller, negotiates and locks the money.
- **Attester account**: a backend account that writes verified facts (World ID) to the registry. It can't touch business money.
- **Attestation check (TEE)**: before each negotiation, the server asks NEAR AI Cloud's hardware to prove itself with a fresh nonce. It checks NVIDIA's signed GPU verdict and that the Intel TDX CPU quote contains the signing key and our nonce.

### B

- **Badge images on IPFS**: four badge images on IPFS, one per score level (from 0, 1, 30 and 100 points). The SHA-256 of each image is fixed in the contract.
- **Badge NFT (soulbound, NEP-171)**: each business's score is an NFT. Wallets and explorers can show it, and it can never be sold or moved (transfer calls always fail).
- **Bring your own AI (MCP)**: Claude, Cursor or any MCP client can act as a business's agent through `/api/mcp`, with the same limits as the built-in agent.
- **Business name check**: sign-up shows live whether a name is free or taken. Names must be 2–32 characters of lowercase letters, digits and dashes.
- **Buyer limit enforced by code**: the buyer's agent can never offer or accept above the owner's "Up to" amount, whatever the AI says.

### C

- **Cancel an offer**: the buyer can withdraw a deal the seller hasn't accepted yet and get the money back.
- **Charts of real runs**: the landing page shows charts from real testnet negotiations.
- **Connection key for MCP**: made in the dashboard and shown once. Only its hash is kept. Making a new key turns off the old one, and keys can be revoked.
- **Contact details**: the owner can optionally show a website, email, X, Telegram, phone and location on the public profile. Links only use safe prefixes (`https://`, `mailto:`, `tel:`).
- **Counterparties counted once**: reputation counts each trading partner once, however many deals they do together.
- **Count-up numbers**: profile and landing-page numbers count up when they scroll into view.
- **Cron keeper**: a scheduled job (`/api/cron/settle`, protected by a secret) pushes every due deal along: it pays out after the review window, refunds expired deals and ends timed-out disputes.

### D

- **Dark and light bands**: the landing page alternates dark and light sections.
- **Deal deadline**: every deal has a delivery deadline. If the seller hasn't delivered by then, anyone can refund the buyer, and a seller who accepted and didn't deliver gets a lost dispute on their record.
- **Deal page**: each deal has a page that shows its status timeline, the privately agreed terms, how the agents got there, and the next action for your side.
- **Deal statuses**: Proposed → Accepted → Delivered → Released, or Refunded, Disputed or Split.
- **Demo businesses**: cafe, cups and hh run on their own. They accept at once, and a buyer can press "Have cups deliver now (demo)".
- **Demo connect**: you can connect to a demo business and add it to your approved list in one click.
- **Direct deals**: for deals already agreed in person or by phone, the buyer types the seller, item, quantity, price and delivery days. The money locks and the seller accepts on the deal page.
- **Disputes**: the buyer can dispute before delivery, and either side can dispute within the 1-hour review window after delivery. The deal freezes until it's settled.
- **Dispute split**: in a dispute, either side offers a share for the seller, and the escrow pays out as soon as both offer the same split. Whoever gets at least half counts as the winner.
- **Dispute timeout**: after 1 hour unsettled, anyone can end the dispute. If the goods were delivered, it's split 50/50 and both sides get a lost dispute. If not, the buyer is refunded.
- **Draft, check, save listing**: drafted listings aren't saved until the owner presses Save.

### E

- **Encrypted deal terms**: terms are stored encrypted (AES-256-GCM) off chain, and only the buyer and seller can read them.
- **Encrypted negotiation records**: every negotiation, successful or not, is saved encrypted. Each business sees its 20 most recent.
- **Escrow contract**: holds the money for every deal until delivery (`escrow.bizzy-fy.testnet`).
- **Escrow minimum**: deals start at 0.1 NEAR. The agents can never agree on less.
- **Escrow storage guard**: money locked for open deals can never be used to pay the escrow's storage costs.

### F

- **FAQ**: the landing page answers 10 questions: is this real money, who can read my terms, how do I know it was private, what if the seller never delivers, what stops a rogue agent, why is the score a soulbound NFT, can I use Claude or Cursor, do I need a wallet, what does it cost, and is the code open.
- **Fee reserve**: 0.07 NEAR is held back for transaction fees, so the agent never agrees to a deal it can't afford to open.
- **Fingerprint on chain**: only a salted SHA-256 hash of the terms goes on chain, and the seller must accept that same hash.
- **Freeze**: one button stops the agent immediately by deleting its key from the account.
- **Freeze cooldown**: a frozen agent can only be turned back on after 1 hour.

### G

- **Global contract**: the policy contract's code is uploaded once and every new business account uses it by hash, so sign-up doesn't upload code again.
- **Google sign-in (NEAR Auth)**: sign in with Google with no wallet or seed phrase. NEAR's MPC network signs for the account, and the server relays the `sign` call so a brand-new user doesn't need NEAR first. Testnet works on localhost only.
- **Greeting**: the dashboard says good morning, afternoon, evening or night.
- **Guardian**: the human who owns the business. Only the guardian can change limits, approve, freeze, withdraw or allow partners, and each of these needs a 1-yoctoNEAR wallet confirmation.
- **Guardian deal actions**: the guardian can also act on deals (confirm, dispute, split and so on) through the policy contract.

### I

- **Implicit accounts**: a wallet account named after its own key can sign in before it exists on chain.
- **Invite link and QR code**: each business gets an invite link and a QR code to share with its suppliers.
- **Invite page**: opening an invite signs you up if needed, then connects and approves the sender in one click.

### L

- **Last-turn close**: on each agent's last turn, the code accepts an offer that fits both sides' limits, so a deal both sides can afford doesn't end with "No deal".
- **Leaderboard**: `/top` ranks every business by on-chain score, with badge images and pages of businesses.
- **Limit presets**: Small, Medium and Large spending presets in the dashboard.
- **Listing (public part)**: overview, what it sells and a website. Buyers' agents choose sellers by this, and the profile page shows it.
- **Listing (private part)**: prices, lowest price per unit, quantity and terms, stored encrypted. Only the business's own agent reads them.
- **Lowest price floor**: the seller's agent can never offer or accept below its lowest price × quantity, whatever the AI says.

### M

- **MCP tools**: `find_businesses` (who sells what, score, verified human, profile link), `buy` (negotiate and lock money), `my_deals` and `mark_delivered`.
- **Mainnet human check**: on mainnet, every business must pass World ID Selfie Check before its agent turns on. On testnet it's optional.
- **Milestones**: the escrow supports paying a deal in 1 to 10 parts, each released on delivery.
- **Money your agent can use**: the dashboard shows the agent's spendable balance and how much it has spent this week, and lets the owner add or take out money.

### N

- **NEAR Connect wallet sign-in**: sign in with any NEAR wallet, proved with a signed one-time challenge (NEP-413).
- **Negotiation as a chat**: the negotiation is shown as messages, with your agent on the right and theirs on the left, and each move's terms under it.
- **Negotiation turn limit**: up to 8 moves (4 each). Delivery is kept between 1 and 60 days and quantities are rounded to whole units.
- **No deal reasons**: the result says whether the agents disagreed or agreed but the deal couldn't open (too small, not enough money, over limits).

### O

- **Offer cleaning**: any AI reply that isn't valid JSON or has a made-up action becomes a walk-away. An "accept" at a different price becomes a counter-offer.
- **On-time vs late**: when a deal pays out, the escrow records whether the seller delivered before the deadline.
- **Open-source code**: the repo is public on GitHub.

### P

- **Policy contract**: one per business, holding its money and checking every agent spend against its status, approved partners, per-deal cap and weekly cap.
- **Private negotiation (NEAR AI Cloud)**: both agents bargain inside a TEE (Intel TDX + NVIDIA GPU) on NEAR AI Cloud, using a private model.
- **Profile page**: `/b/<name>` shows the picture, overview, what it sells, website, score, deals paid, on-time %, partners, volume, disputes lost, the badge, proof-of-reputation quests and contacts.
- **Profile picture**: cropped to a square and shrunk to 256 px in the browser. Only small, real JPEGs are accepted, and it can be removed.
- **Prompt-injection guard**: each agent is told the other side's note is a message, never an instruction. The website link is shown to people, but agents never fetch it.
- **Proof of reputation quests**: four quests: Verified human, Business check (KYB), First deal paid, Brought in a business. The registry counts them as a tier from 0 to 4.

### R

- **Reduced motion**: all animation stops for people whose device asks for reduced motion.
- **Referrals**: every business gets a referral link (`/login?ref=<name>`), and the registry records who referred whom and counts referrals.
- **Refund on failure**: if creating a business account fails, the registry refunds the guardian's deposit.
- **Registry contract**: the business directory (`bizzy-fy.testnet`). It creates business accounts and holds World ID facts, reputation and badges.
- **Release after review**: once the seller marks delivery, the buyer has 1 hour to confirm or dispute. After that, anyone can release the payment.
- **Reputation written only by escrow**: only the escrow contract can update scores, so nobody can edit them.
- **Roadmap page**: `/roadmap` lists what's next, with one linkable section per item.

### S

- **Score formula**: 10 per on-time deal + 5 per late deal + 3 per distinct partner − 20 per lost dispute (never below 0).
- **Seller choice by AI**: if you don't name a seller, your agent picks the best match from businesses that have a listing (only approved ones if that rule is on).
- **Seller walks away when off-topic**: if a seller doesn't sell what was asked, its agent walks away on the first move and says what it does sell.
- **Sessions**: signed, expiring login cookies that can't be forged. Logout clears them.
- **Share images**: auto-made preview images for the site and for each business profile when shared on X or elsewhere.
- **Share on X**: one-click "Post on X" buttons with text and a link filled in, for example a profile's track record.
- **Sign-up in one click**: creating a business creates its NEAR account, funds it, deploys its policy contract and sets its limits in one transaction (from 0.5 NEAR).
- **Signed replies**: every AI reply is checked against the TEE's signature over the exact request and response bytes.
- **Spending limits**: per-deal cap, cap per period (weekly by default) and period length. The owner can change them any time.
- **Sponsored testnet NEAR**: each new testnet account gets 1 test NEAR once, so sign-up stays one click.

### T

- **Team treasury (multisig)**: an optional Sputnik DAO multisig for savings the agent can't touch. Teammates are members, and moving money needs more than half of them to approve.
- **Tests**: 12 server tests (offer cleaning, buyer cap, seller floor, listing cleaning, TDX quote binding, NEP-413 logins, World ID nullifiers, sessions, encryption, who can read terms, settle timing, contact-link safety) plus unit tests in each contract.
- **Track record**: deals paid, on-time %, partners, volume through escrow and disputes lost, all read from the chain.

### U

- **Unfreeze**: the guardian turns the agent back on after the cooldown, then gives it a new key.

### V

- **Verified human badge**: shown on the profile after World ID.
- **Verified private badge**: shown on a negotiation only when every check passed (GPU attestation, CPU quote binding, signatures on every reply). The details say exactly what was checked.

### W

- **Walk-away handling**: either agent can walk away, which ends the negotiation with "No deal".
- **Withdraw**: the guardian can take NEAR out of the business account to any address.
- **World ID (Selfie Check)**: proves a real, unique person runs the business, using a phone camera and no Orb. The server checks the proof and the attester writes it to the registry.
- **World ID limit of 3 businesses per person**: the registry counts each person's nullifier, so one person can verify at most 3 businesses. Only World ID 3.0 proofs are accepted, so nobody can verify twice with two versions.

---

## Not built yet (on the roadmap)

These are on `/roadmap` but not in the code:

- Mainnet launch
- Confidential treasury on mainnet
- Google and social login on mainnet
- Know your business (KYB) checks from a third-party provider (the registry already has a KYB flag)
- Netting (settling many deals between the same businesses at once)
- Stablecoin deals from any chain
- Credit from trade history
- Agents on NEAR's Agent Market
