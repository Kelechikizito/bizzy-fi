Note from the research: businesses complain about payment trust (deposits, late payment), not negotiation privacy. Lead the pitch with escrow and guaranteed payment; privacy is how we make it safe for businesses to use.

> **The pitch:** let AI agents close deals for your business. Your money is locked until the seller delivers, or it comes back, and your deal terms stay private.

Bizzy-Fi (written "Bizzy-Fy" in the code and docs) is our NEAR hackathon project: a way for businesses to let AI agents make deals with each other, safely.

The problem: businesses don't trust each other. Every deal needs contracts, lawyers, deposits and weeks of back-and-forth, and people lose money when the other side doesn't deliver or doesn't pay.

The idea: each company gets an AI agent that finds partners, negotiates and closes deals for it. NEAR is the trust layer underneath:

┌──────────────────┬────────────────────────────────────────┐
│ Worry │ How Bizzy-Fi handles it │
├──────────────────┼────────────────────────────────────────┤
│ "Will the AI │ A policy the human boss (the guardian) │
│ spend all my │ sets: spending limits, an │
│ money?" │ approved-partners list, approval for │
│ │ big deals, and a freeze button │
├──────────────────┼────────────────────────────────────────┤
│ "Will they pay? │ Escrow: the buyer's money is locked │
│ Will they │ until the seller delivers, can be paid │
│ deliver?" │ in stages, and is refunded if the │
│ │ seller doesn't deliver │
├──────────────────┼────────────────────────────────────────┤
│ "Can I trust │ Reputation built only from real │
│ this company?" │ completed deals, plus "verified human" │
│ │ and business checks │
├──────────────────┼────────────────────────────────────────┤
│ "I don't want │ Private by default: deal terms stay │
│ competitors │ encrypted, and only a fingerprint goes │
│ seeing my deals" │ on chain │
└──────────────────┴────────────────────────────────────────┘

An example: a café's agent needs 500 coffee cups. It finds a supplier with a good reputation, and the two agents agree a price privately. The money locks in escrow, and the supplier delivers. The café's agent confirms, and the supplier is paid. Both companies' reputations go up. The café owner only stepped in if the deal was over their limit.

For a beginner it should feel like Amazon: sign in with Google, one-click actions, and no seed phrases or blockchain jargon.

## MARKET RESEARCH
