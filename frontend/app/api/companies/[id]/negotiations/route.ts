import { requireGuardian } from "@/lib/server/auth";
import { acceptWaiting, list } from "@/lib/server/negotiate";
import { handle } from "@/lib/server/route";

export const maxDuration = 60;

/** This company's negotiations. First, the seller's agent accepts any deal the guardian has since approved. */
export const POST = (_: Request, ctx: RouteContext<"/api/companies/[id]/negotiations">) =>
  handle(async () => {
    const { id } = await ctx.params;
    await requireGuardian(id);
    await acceptWaiting(id);
    return { negotiations: await list(id) };
  });
