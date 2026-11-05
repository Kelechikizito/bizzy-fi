# NEAR HACKATHON Ecosystem: Partner Tools Explained

A plain-English guide to every partner in `HACKATHON.md`. Each entry says what the tool is, what you can build with it, and how it might fit bizzy-fi, which is agentic B2B commerce: private, one-click, and all-Rust on NEAR.

Summaries were checked against each partner's docs on 2026-11-05. Always re-check the docs before integrating (endpoints, contract addresses and SDK versions change).

---

## Quick map

| Need in bizzy-fi | Best partner fit |
|---|---|
| Users and agents paying across chains / settling deals | **NEAR Intents** |
| Login without seed phrases | **HOT** (MPC wallets) |
| Private AI for agent negotiation | **NEAR AI Cloud** |
| Agent wallets with keys locked in secure hardware, verifiable off-chain work | **OutLayer** |
| Company treasury, multisig approvals, private balances | **Trezu** (built on **SputnikDAO**) |
| Agents hiring/being hired for jobs, with escrow | **Agent Market** |
| Swapping or earning yield on idle treasury funds | **Rhea** |

---

## NEAR Intents: cross-chain execution
Docs: https://docs.near-intents.org/

NEAR Intents lets a user say *what* they want ("swap my USDC on Arbitrum into NEAR"). Market makers then compete to fulfill the request, and a verifier contract on NEAR settles it safely. The easiest entry point is the **1Click API**: list tokens, get a quote, execute, and track status. There's also a React swap widget and SDKs in TypeScript, Go and Rust. It supports confidential swaps.

**Watch out:** there is **no testnet**. Use mainnet with tiny amounts and `dry: true` quotes (HACKATHON.md Q-007). Without a 1Click JWT there's a 0.2% fee.

**For bizzy-fi:** this is the natural settlement layer. A buyer pays in any token on any chain, and the seller receives what they want. It's the top hint in the DeFi, Business, Agents and Real-World Money tracks.

## Aurora: Ethereum on NEAR
Docs: https://doc.aurora.dev/

Aurora is a full Ethereum Virtual Machine (EVM) running as a smart contract on NEAR. You write Solidity, deploy with Foundry or Hardhat, use MetaMask, and pay gas in ETH (about $0.02 a transaction). Solidity contracts can call native NEAR contracts through cross-contract calls (XCC), but results arrive later through a callback. Aurora Cloud can also spin up your own dedicated EVM chain.

**For bizzy-fi:** not used. We chose all-Rust native NEAR.

## HOT: chain abstraction and keyless wallets
Docs: https://docs.hotdao.ai/

HOT Protocol is a set of NEAR contracts and services that make crypto feel like one system across chains. Its two pillars are **chain abstraction**, where OmniBridge moves tokens between chains and works alongside NEAR Intents, and **identity**, where MPC (multi-party computation) splits a key across several parties. That gives users non-custodial wallets with **no seed phrase**. HOT also makes the wallet connector `@hot-labs/near-connect` used in NEAR dApps.

**For bizzy-fi:** a strong option for the "login without a wallet / no seed phrases" requirement, and for the wallet-connect button.

## Rhea: DeFi on NEAR
Docs: https://guide.rhea.finance/ · SDK docs: https://github.com/rhea-finance/rhea-sdk-docs

Rhea is NEAR's main DEX and lending protocol: swaps, cross-chain lending, liquid staking and bridging in one place. It has AMM and concentrated-liquidity (CLMM) pools, a cross-chain swap API, lending you can build vaults on, plus SDKs and a trading CLI.

**For bizzy-fi:** optional. It could earn yield on idle business or escrow funds, or handle token swaps when Intents isn't needed.

## meme.cooking: memecoin launchpad
Docs: https://docs.meme.cooking/

A permissionless memecoin launchpad on NEAR built to be fair and rug-proof. Instead of a bonding curve, it runs an auction where every depositor pays the same price. If the auction raises at least 4k NEAR, the token launches on a DEX at that price with locked liquidity.

**For bizzy-fi:** not relevant unless we add a community token.

## HEX: cross-chain DEX and OTC market
Docs: https://hot-labs.gitbook.io/hex/

HEX is a decentralized exchange built on HOT Bridge and NEAR Intents, with a swap app and an **OTC (over-the-counter) market**. Its current OTC market trades GONKA (GNK) tokens for USDT across 20+ networks through smart contracts. A public REST API lists and posts bid/ask orders.

**For bizzy-fi:** loosely related. Its OTC order book is a reference design for B2B deal-matching, but we'd likely use Intents directly.

## NEAR AI: private AI
Docs: https://docs.near.ai/ · Dashboard and API keys: https://cloud.near.ai

NEAR AI Cloud runs AI models inside **Trusted Execution Environments (TEEs)**, which are sealed, encrypted hardware areas. Nobody, including the cloud provider and NEAR itself, can see or train on your data. One OpenAI-compatible API gives access to many models (GLM, Qwen, OpenAI, Anthropic, Gemini), and you can cryptographically verify that requests ran inside the secure hardware. You can get $10 in credits by joining NEAR Builders.

**For bizzy-fi:** core. It powers the negotiating agents while meeting "private by default", since deal terms never leak to an AI provider.

## SVRN: sovereign technology research
Link: https://svrn.net/research/near-protocol

SVRN publishes investment research. Its NEAR report is a bottom-up analysis modeling Intents fee revenue, token supply, and the on-chain volume at which NEAR would become net deflationary. It offers no API or SDK.

**For bizzy-fi:** background reading, and useful for the pitch ("our volume feeds Intents fees").

## Trezu: multisig treasury for teams
Docs: https://github.com/NEAR-DevHub/trezu-docs · App: https://trezu.app

Trezu is a non-custodial team treasury. Each treasury is a multisig wallet on NEAR: members have roles, and actions run automatically once a proposal gets enough votes. It handles payment and swap requests, member and permission management, and **confidential treasuries** where balances and activity are visible only to the team.

**For bizzy-fi:** a strong fit. Each business can get a Trezu treasury, so payments over a limit need human sign-off. That gives us spending policies without building them ourselves, and the confidential mode matches "private by default".

## SputnikDAO: DAO infrastructure
Docs: https://github.com/near-daos/sputnik-dao-contract

The original DAO contracts on NEAR (V2). A factory contract creates each DAO as a sub-account. Every action (paying funds, adding members, upgrading code) is a **proposal** that roles vote on, with configurable thresholds. Developers call methods like `add_proposal` and `act_proposal`. Trezu is built on this kind of multisig.

**For bizzy-fi:** the low-level option behind Trezu. Agents could submit payment proposals that humans approve.

## OutLayer: secure transactions for AI agents
Docs: https://app.outlayer.ai/docs/getting-started

OutLayer runs off-chain code (HTTP requests, AI calls, heavy computation, randomness) inside an Intel TDX TEE, with **cryptographic proof** of what ran on which inputs. NEAR contracts can call it and get the result in a callback, or apps can call it over HTTPS. It also offers **agent custody**, where an AI agent's wallet keys live inside the TEE. You write a WebAssembly app (Rust recommended) and deploy it. It works on testnet.

**For bizzy-fi:** a strong fit. It gives agents wallets they can't leak, and verifiable receipts of what an agent did during a negotiation.

## GoMining: Bitcoin mining superapp
Docs: https://docs.gomining.com/

GoMining turns real Bitcoin mining power into digital "miners" that earn BTC without hardware. It also has a Visa card, a multi-asset wallet, the GOMINING governance token, and an MCP server connecting AI assistants to accounts. The docs show no NEAR integration or developer API.

**For bizzy-fi:** not relevant.

## Agent Market: marketplace for AI agents
Docs: https://docs.market.near.ai/ · App: https://market.near.ai/

A marketplace where people and other agents **hire AI agents by the job**, like hiring a contractor. Buyers post a job in plain English or pick a listed agent. Payment is held until the buyer accepts the deliverable, and refunded if disputed. Agents can hire other agents through the same MCP and REST interface. Claude, Cursor, Codex and ChatGPT can connect to it.

**For bizzy-fi:** a strong fit. Our negotiating agents could be listed to earn, or hire specialist agents. Its built-in escrow is a ready-made pattern.

## NEAR Builders: builder community
Link: https://nearbuilders.org/build

A community hub for NEAR builders: projects, events, collaborators, and starter resources (contract guides, SDKs, testnet faucet). It also covers NEAR AI Cloud and **Agent Connect**, which gives AI agents their own NEAR Intents accounts. Joining gets you $10 of NEAR AI credits.

**For bizzy-fi:** join for the credits, and check Agent Connect for agent Intents accounts.

## Gulf Labs: investor
Link: https://gulf-labs.com/

The blockchain investment and development arm of GULF Group, a conglomerate in energy, telecoms and banking. It funds and builds blockchain infrastructure. There are no tools or docs.

**For bizzy-fi:** possible post-hackathon funding. B2B commerce fits a conglomerate investor.

## BRRRAIN: memecoin that pays holders in AI
Docs: https://brrrain.fun/docs/

Holding at least 1 BRRRAIN gives you a daily AI quota called "Power", funded by NEAR staked in the NEAR AI farm. The API is OpenAI-compatible: point an OpenAI SDK at `https://api.brrrain.fun/v1` with a `brrr_` key.

**For bizzy-fi:** a cheap AI quota is possible, but NEAR AI Cloud is the better choice for private, verifiable inference.
