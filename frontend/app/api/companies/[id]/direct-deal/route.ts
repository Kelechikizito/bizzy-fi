import { requireGuardian } from "@/lib/server/auth";
import { directDeal } from "@/lib/server/direct";
import { handle } from "@/lib/server/route";

export const maxDuration = 60;

/** Locks the money for a deal both businesses already agreed: `{ seller, item, quantity, price_near, delivery_days }`. */
export const POST = (request: Request, ctx: RouteContext<"/api/companies/[id]/direct-deal">) =>
  handle(async () => {
    const { id } = await ctx.params;
    await requireGuardian(id);
    const b = await request.json();
    return directDeal(id, { seller: String(b.seller ?? ""), item: String(b.item ?? ""), quantity: Number(b.quantity), price_near: Number(b.price_near), delivery_days: Number(b.delivery_days) });
  });
