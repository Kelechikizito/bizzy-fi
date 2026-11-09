// Seeds testnet with two demo companies and one real deal. Run from scripts/: npm run seed
// Keys go to the gitignored .env.demo; a re-run reuses them and just runs another deal.
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, existsSync } from "node:fs";
import { base58 } from "@scure/base";
import { generateKey, Near, parseKey } from "near-kit";
import { companyId, ESCROW_ID, NETWORK, REGISTRY_ID, txUrl } from "../frontend/lib/near/contracts.ts";

type Signer = { near: Near; id: string };

const ENV_FILE = new URL(".env.demo", import.meta.url);
const WEEK_NS = 7n * 24n * 3600n * 10n ** 9n;
const DAY_MS = 24n * 3600n * 1000n;
const yocto = (near: bigint) => (near * 10n ** 24n).toString();
const signer = (id: string, privateKey: string): Signer => ({
  near: new Near({ network: NETWORK, privateKey: privateKey as `ed25519:${string}`, defaultSignerId: id }),
  id,
});

if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
const reader = new Near({ network: NETWORK });

/** Returns a saved value, or makes and saves it so a failed run can resume. */
function saved(name: string, make: () => string): string {
  if (!process.env[name]) {
    process.env[name] = make();
    appendFileSync(ENV_FILE, `${name}=${process.env[name]}\n`, { mode: 0o600 });
  }
  return process.env[name]!;
}

/** Sends one call, prints its link, and returns what it returned. */
async function call(from: Signer, to: string, method: string, args: object, label: string, deposit?: string) {
  const result = await from.near
    .transaction(from.id)
    .functionCall(to, method, args, { gas: "200 Tgas", ...(deposit && { attachedDeposit: deposit as "1 NEAR" }) })
    .send({ waitUntil: "FINAL" });
  console.log(`| ${label} | ${txUrl(result.transaction.hash)} |`);
  const value = (result.status as { SuccessValue?: string }).SuccessValue;
  return value ? JSON.parse(Buffer.from(value, "base64").toString()) : undefined;
}

/** Creates the guardian, the company and the agent key, skipping what already exists. */
async function setUp(name: string, about: string, deposit: bigint): Promise<Signer> {
  const upper = name.toUpperCase();
  const guardianId = saved(`${upper}_GUARDIAN_ID`, () => `bizzy-${name}-${randomBytes(3).toString("hex")}.testnet`);
  const guardianKey = saved(`${upper}_GUARDIAN_KEY`, () => generateKey().secretKey);
  const agentKey = saved(`${upper}_AGENT_KEY`, () => generateKey().secretKey);
  const company = companyId(name);

  if (!(await reader.accountExists(guardianId))) {
    const publicKey = parseKey(guardianKey).publicKey.toString();
    execFileSync("near", ["account", "create-account", "sponsor-by-faucet-service", guardianId,
      "use-manually-provided-public-key", publicKey, "network-config", NETWORK, "create"], { stdio: "ignore" });
    console.log(`| Faucet funded guardian of ${name} | ${guardianId} |`);
  }
  const guardian = signer(guardianId, guardianKey);

  if (!(await reader.view(REGISTRY_ID, "get_company", { account_id: company }))) {
    const limits = { per_deal_cap: yocto(2n), period_cap: yocto(5n), period_length_ns: WEEK_NS.toString(), allowlist_only: false };
    const created = await call(guardian, REGISTRY_ID, "create_company", { name, about, referrer: null, limits }, `Create ${name}`, `${deposit} NEAR`);
    if (created !== true) throw new Error(`Creating ${name} failed`);
  }
  if (!(await reader.view(company, "get_agent_key"))) {
    const public_key = parseKey(agentKey).publicKey.toString();
    await call(guardian, company, "set_agent_key", { public_key }, `Give ${name} its agent key`, "1 yocto");
  }

  const keys = await reader.getAccessKeys(company);
  if (/fullaccess/i.test(JSON.stringify(keys))) throw new Error(`${company} has a full-access key`);
  return signer(company, agentKey);
}

console.log("| Step | Link |\n|---|---|");
const cafe = await setUp("cafe", "Neighbourhood cafe buying supplies through its AI agent.", 3n);
const cups = await setUp("cups", "Makes compostable cups for cafes.", 1n);

// Only this fingerprint goes on chain; the salt stops anyone guessing the terms from it.
const terms = JSON.stringify({ item: "500 compostable cups", salt: randomBytes(32).toString("hex") });
const terms_hash = base58.encode(createHash("sha256").update(terms).digest());
const deliver_by = ((BigInt(Date.now()) + DAY_MS) * 10n ** 6n).toString();
const deal = { seller: cups.id, terms_hash, deliver_by, milestones: [yocto(1n)] };

const opened = await call(cafe, cafe.id, "open_deal", { deal, salt: null }, "cafe's agent locks 1 NEAR");
const id = opened?.Opened?.deal_id;
if (id === undefined) throw new Error(`Deal did not open: ${JSON.stringify(opened)}`);

const action = (from: Signer, method: string, label: string, extra = {}) =>
  call(from, from.id, "deal_action", { method, args: { id, ...extra } }, label);
await action(cups, "accept_deal", "cups' agent accepts the same terms", { terms_hash });
await action(cups, "mark_delivered", "cups' agent marks delivery");
await action(cafe, "confirm", "cafe's agent confirms; cups is paid");

const finished = await reader.view<{ status: string }>(ESCROW_ID, "get_deal", { id });
if (finished?.status !== "Released") throw new Error(`Deal ended as ${finished?.status}`);
for (const company of [cafe.id, cups.id]) {
  const score = await reader.view(REGISTRY_ID, "get_score", { account_id: company });
  console.log(`\n${company}: score ${score}, no full-access key`);
}
console.log(`\nDeal ${id} released.`);
