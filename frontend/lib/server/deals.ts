import "server-only";
// One deal as its buyer or seller sees it: chain status, private terms, and how it was agreed.
import { ESCROW_ID, REGISTRY_ID } from "../near/contracts.ts";
import { requireAccount } from "./auth.ts";
import { HttpError } from "./http.ts";
import { DEMO_SELLERS } from "./demo.ts";
import { dueAction } from "./keeper.ts";
import { agentSigner, call, keeperSigner, reader, send } from "./near.ts";
import { accept, byTermsHash, type Offer } from "./negotiate.ts";
import { readTerms } from "./terms.ts";

export type Deal = {
  buyer: string;
  seller: string;
  amount: string;
  terms_hash: string;
  deliver_by: string;
  status: string;
  milestones: string[];
  paid: number;
  updated_at: string;
  split_offer: [string, string] | null;
  disputed_after_delivery: boolean;
};


const getDeal = async (id: string) => {
  const deal = await reader.view<Deal | null>(ESCROW_ID, "get_deal", { id });
  if (!deal) throw new HttpError(404, "No such deal");
  return deal;
};
const guardianOf = async (company: string) => (await reader.view<{ guardian: string } | null>(REGISTRY_ID, "get_company", { account_id: company }))?.guardian;

/** Loads deal `id` for its buyer's or seller's guardian. Settles it first if it's due; `demoDeliver` has a demo seller deliver. */
export async function openDeal(id: string, demoDeliver = false) {
  const account = await requireAccount();
  let deal = await getDeal(id);
  const [buyerGuardian, sellerGuardian] = await Promise.all([guardianOf(deal.buyer), guardianOf(deal.seller)]);
  const side = buyerGuardian === account ? "buyer" : sellerGuardian === account ? "seller" : null;
  if (!side) throw new HttpError(403, "Only the buyer or the seller can see this deal");

  let settled: { method: string; tx: string } | undefined;
  const due = dueAction(deal, BigInt(Date.now()) * 1_000_000n);
  if (due) {
    settled = { method: due, tx: await send(keeperSigner(), ESCROW_ID, due, { id }) };
    deal = await getDeal(id);
  }
  // Demo businesses have no person to press Accept, so their agent accepts once the money is locked.
  if (deal.status === "Proposed" && DEMO_SELLERS.includes(deal.seller)) {
    settled = { method: "accept_deal", tx: await accept(await agentSigner(deal.seller), id, deal.terms_hash) };
    deal = await getDeal(id);
  }
  if (demoDeliver) {
    if (side !== "buyer" || !DEMO_SELLERS.includes(deal.seller) || deal.status !== "Accepted") throw new HttpError(409, "This seller can't deliver right now");
    settled = { method: "mark_delivered", tx: (await call(await agentSigner(deal.seller), deal.seller, "deal_action", { method: "mark_delivered", args: { id } }, "100 Tgas")).hash };
    deal = await getDeal(id);
  }

  const company = side === "buyer" ? deal.buyer : deal.seller;
  const negotiation = await byTermsHash(deal.terms_hash);
  return {
    id,
    deal,
    side,
    company,
    demoSeller: DEMO_SELLERS.includes(deal.seller),
    terms: (await readTerms(deal.terms_hash, company)) as (Offer & { deliver_by: string }) | null,
    negotiation: negotiation && { request: negotiation.request, turns: negotiation.turns, proof: negotiation.proof },
    settled,
  };
}
