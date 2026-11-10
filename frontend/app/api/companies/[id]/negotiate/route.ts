import { requireGuardian } from "@/lib/server/auth";
import { HttpError } from "@/lib/server/http";
import { negotiate } from "@/lib/server/negotiate";
import { handle } from "@/lib/server/route";

/** Several private AI turns plus two on-chain calls. */
export const maxDuration = 120;

export const POST = (request: Request, ctx: RouteContext<"/api/companies/[id]/negotiate">) =>
  handle(async () => {
    const { id } = await ctx.params;
    await requireGuardian(id);
    const { want, max, seller } = await request.json();
    if (typeof want !== "string" || want.trim().length < 3) throw new HttpError(400, "Tell your agent what you need");
    if (!(Number(max) > 0)) throw new HttpError(400, "Set the most you'll pay");
    return negotiate(id, want.trim().slice(0, 500), Number(max), typeof seller === "string" ? seller : undefined);
  });
