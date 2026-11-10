import "server-only";
import { DISPUTE_WINDOW_MS, ESCROW_ID, REVIEW_WINDOW_MS } from "../near/contracts.ts";
import { keeperSigner, reader, send } from "./near.ts";

type Deal = { status: string; deliver_by: string; updated_at: string };

const PAGE = 50;
const MAX_PER_RUN = 20;
const ns = (ms: number) => BigInt(ms) * 1_000_000n;

/** The escrow method this deal is due for right now, if any. */
export function dueAction(deal: Deal, now: bigint): string | null {
  const updated = BigInt(deal.updated_at);
  if (deal.status === "Proposed" || deal.status === "Accepted") return now > BigInt(deal.deliver_by) ? "refund_expired" : null;
  if (deal.status === "Delivered") return now >= updated + ns(REVIEW_WINDOW_MS) ? "release_due" : null;
  if (deal.status === "Disputed") return now >= updated + ns(DISPUTE_WINDOW_MS) ? "refund_on_timeout" : null;
  return null;
}

/** Nothing on NEAR fires by itself, so this pushes every due deal along. */
export async function settleDue() {
  const now = ns(Date.now());
  const results: { id: string; method: string; tx?: string; error?: string }[] = [];
  for (let from_index = 0; results.length < MAX_PER_RUN; from_index += PAGE) {
    const page = (await reader.view<[string, Deal][]>(ESCROW_ID, "get_deals", { from_index, limit: PAGE })) ?? [];
    for (const [id, deal] of page) {
      const method = dueAction(deal, now);
      if (!method || results.length >= MAX_PER_RUN) continue;
      try {
        results.push({ id, method, tx: await send(keeperSigner(), ESCROW_ID, method, { id }) });
      } catch (error) {
        results.push({ id, method, error: String(error) });
      }
    }
    if (page.length < PAGE) break;
  }
  return { settled: results };
}
