# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

bizzy-fi is a NEAR HACKATHON entry: agentic B2B commerce, where AI agents negotiate deals between businesses and NEAR handles escrow, spending policies, and settlement. Product thesis lives in `agenticB2B.md`. Hackathon rules, deadlines and the submission API are in `HACKATHON.md` — re-read the live copy (https://nearhackathon.com/HACKATHON.md) before submitting.

## Product requirements

- **Private by default**: every feature keeps user data and deal terms private unless the user explicitly chooses to share.
- **One-click UX for beginners**: aim for Amazon-style one-click actions. Hide crypto jargon, seed phrases, and chain details from users.
- **Login**: model sign-up and login on how near.com does it, and support social and Google login (Privy-style). Don't require an existing wallet.
- **Referrals**: every user automatically gets a referral link to invite new users.
- **Shareable on X**: design features and results so people will want to post them on X.
- **Judging criteria**: past NEAR hackathons scored technical implementation, design, impact, originality, and sustainability. Build to these, and cover them in the frontend or FAQ.

## Layout

- `frontend/` — Next.js 16 + React 19 + Tailwind v4 (via `@tailwindcss/turbopack`, no PostCSS config), npm. Commands run from `frontend/`: `npm run dev`, `npm run build`, `npm run lint`. No test framework yet.
- `contracts/` — Cargo workspace with three NEAR contracts: `registry/` (`bizzyfy.testnet`), `policy/` (deployed by the registry onto each company account), `escrow/` (`escrow.bizzyfy.testnet`). Build each with `cargo near build non-reproducible-wasm` from its folder. All on-chain logic is native Rust on NEAR: no Solidity or Aurora. Use the `near-smart-contracts` skill and `near-contract-audit` before deploying.
- **The user writes the contract code.** Claude guides through `docs/build-plan.md` checkpoints, writes the guides, reviews, and writes everything else (tests, scripts, backend, frontend). Don't write contract code unless asked.
- **Custody model:** company accounts have no full-access key; the policy contract holds the funds. Guardian powers are policy methods checked against the caller; the agent gets a function-call key the contract adds to its own account; freeze deletes that key.
- Next 16 has breaking changes versus training data: read the relevant guide in `frontend/node_modules/next/dist/docs/` before writing Next code (see `frontend/AGENTS.md`).

## NEAR

- Develop on **testnet** only. Never deploy to mainnet, sign mainnet transactions, or spend tokens without the human's explicit confirmation.
- Never create or invent the mainnet payout account; the team creates it.
- **Use partner tools instead of building from scratch.** Before building a feature (escrow, swaps, payments, treasury/multisig, private AI, agent hiring, login, etc.), check whether a partner in `HACKATHON.md`'s Ecosystem table already provides it, and integrate that instead. Build custom only when no partner fits, and say so.
- Verify partner endpoints, contract addresses and SDK versions in the partner docs listed in `HACKATHON.md` instead of assuming them.

## Repo

- The project root is the only git repo (remote: `Kelechikizito/bizzy-fy`). Never run `git init` or `create-*-app` in a way that leaves a nested `.git`, because git then tracks the folder as an empty gitlink. Never push, force-push, or make the repo public without confirmation.
- Keys and secrets go in env vars (`.env*` is gitignored), never in the repo.
- The README must be judge-readable: what it is, the problem, and "do X → see Y" steps. Development ends 2026-11-14T23:59:00Z.
