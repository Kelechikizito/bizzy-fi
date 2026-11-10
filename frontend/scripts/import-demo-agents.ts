// Gives the website the demo companies' agent keys and private briefs, so cafe and cups can negotiate.
// Run from frontend/: node --conditions=react-server --env-file=.env.local --env-file=../scripts/.env.demo scripts/import-demo-agents.ts
import { parseKey } from "near-kit";
import { companyId } from "../lib/near/contracts.ts";
import { seal } from "../lib/server/crypto.ts";
import { db } from "../lib/server/db.ts";
import { reader } from "../lib/server/near.ts";
import { setBrief } from "../lib/server/negotiate.ts";

const BRIEFS: Record<string, string> = {
  cafe: "We sell coffee beans to other cafes: 0.01 NEAR per 100 g, never below 0.008 per 100 g. Delivery in 2 days.",
  cups: "Compostable 12 oz cups with lids. List price 0.004 NEAR a cup; lowest 0.003 a cup for orders of 300 or more, 0.0035 below that. Minimum order 100. Delivery in 3 to 7 days; faster costs 10% more.",
};

for (const name of Object.keys(BRIEFS)) {
  const company = companyId(name);
  const secret = process.env[`${name.toUpperCase()}_AGENT_KEY`];
  if (!secret) throw new Error(`Missing ${name.toUpperCase()}_AGENT_KEY`);
  const publicKey = parseKey(secret).publicKey.toString();
  const onChain = await reader.view<string | null>(company, "get_agent_key");
  if (onChain !== publicKey) console.warn(`${company}: the key on chain is different (frozen or replaced?). Its agent won't be able to sign.`);
  await (await db()).execute({
    sql: "INSERT OR REPLACE INTO agent_keys (company, public_key, sealed) VALUES (?, ?, ?)",
    args: [company, publicKey, seal(`agent:${company}`, secret)],
  });
  await setBrief(company, BRIEFS[name]);
  console.log(`${company}: agent key and brief saved`);
}
