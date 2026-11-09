import { requireGuardian } from "@/lib/server/auth";
import { handle } from "@/lib/server/route";
import { attestHuman, verifyProof } from "@/lib/server/world";

export const POST = (request: Request, ctx: RouteContext<"/api/companies/[id]/world-id">) =>
  handle(async () => {
    const { id } = await ctx.params;
    await requireGuardian(id);
    return { tx: await attestHuman(id, await verifyProof(await request.json())) };
  });
