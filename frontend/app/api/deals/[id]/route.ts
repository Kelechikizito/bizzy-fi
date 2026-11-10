import { openDeal } from "@/lib/server/deals";
import { handle } from "@/lib/server/route";

export const maxDuration = 60;

/** One deal for its buyer or seller; `{ demoDeliver: true }` has a demo seller deliver. */
export const POST = (request: Request, ctx: RouteContext<"/api/deals/[id]">) =>
  handle(async () => {
    const { id } = await ctx.params;
    const { demoDeliver } = await request.json().catch(() => ({}));
    return openDeal(id, demoDeliver === true);
  });
