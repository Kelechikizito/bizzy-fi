import "server-only";
// Direct deals: two businesses already agreed (in person, by phone); Bizzy-Fy just locks the money and keeps the terms private.
import { companyId, REGISTRY_ID } from "../near/contracts.ts";
import { connections } from "./connections.ts";
import { DEMO_SELLERS } from "./demo.ts";
import { HttpError } from "./http.ts";
import { agentSigner, call, reader } from "./near.ts";
import { accept, DAY_NS, FEE_RESERVE, MIN_DEAL, OPEN_GAS } from "./negotiate.ts";
import { saveTerms } from "./terms.ts";

export type DirectTerms = { seller: string; item: string; quantity: number; price_near: number; delivery_days: number };

/** The buyer's agent locks the money for terms both sides already agreed. The seller then accepts on the deal page. */
export async function directDeal(buyer: string, t: DirectTerms) {
  const seller = t.seller.includes(".") ? t.seller : companyId(t.seller.toLowerCase().trim());
  if (seller === buyer) throw new HttpError(400, "That's your own business");
  if (!(await reader.view(REGISTRY_ID, "get_company", { account_id: seller }))) throw new HttpError(404, `No business called ${t.seller} on Bizzy-Fy`);
  if (!(t.item.trim() && t.quantity >= 1 && t.delivery_days >= 1 && t.delivery_days <= 60)) throw new HttpError(400, "Fill in the item, quantity and days to deliver");
  if (!(t.price_near >= MIN_DEAL)) throw new HttpError(400, `Deals start at ${MIN_DEAL} NEAR`);

  // Same checks as the agent's own deals: money on hand, and the approved-business list.
  const [available, limits] = await Promise.all([reader.view<string>(buyer, "get_available_balance"), reader.view<{ allowlist_only: boolean }>(buyer, "get_limits")]);
  const has = Number(BigInt(available ?? "0") / 10n ** 20n) / 1e4 - FEE_RESERVE;
  if (has < t.price_near) throw new HttpError(400, `Your agent has ${Math.max(0, Math.floor(has * 1e4) / 1e4)} NEAR. Add money first.`);
  const salt = limits?.allowlist_only ? (await connections(buyer)).find((c) => c.other === seller && c.approved)?.salt : null;
  if (salt === undefined) throw new HttpError(400, "Approve this business first under Businesses you trade with");

  const deliver_by = (BigInt(Date.now()) * 1_000_000n + BigInt(Math.round(t.delivery_days)) * DAY_NS).toString();
  const terms = { action: "accept", item: t.item.trim().slice(0, 120), quantity: Math.round(t.quantity), price_near: t.price_near, delivery_days: Math.round(t.delivery_days), note: "Agreed directly", deliver_by };
  const terms_hash = await saveTerms(terms, buyer, seller);
  const amount = ((BigInt(Math.round(t.price_near * 1e4)) * 10n ** 24n) / 10_000n).toString();
  const opened = await call<{ Opened?: { deal_id: string }; NeedsApproval?: { id: string } } | "Failed">(
    await agentSigner(buyer),
    buyer,
    "open_deal",
    { deal: { seller, terms_hash, deliver_by, milestones: [amount] }, salt },
    OPEN_GAS,
  );
  if (typeof opened.value !== "object") throw new HttpError(409, "The money couldn't be locked. Check your agent's balance.");
  const deal = opened.value.Opened?.deal_id;
  // Demo businesses have no person to press Accept, so their agent accepts at once.
  const accepted = deal && DEMO_SELLERS.includes(seller) ? await accept(await agentSigner(seller), deal, terms_hash) : undefined;
  return { status: deal ? "opened" : "waiting", deal, seller, receipts: { opened: opened.hash, accepted } };
}
