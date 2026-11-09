import { requireGuardian } from "@/lib/server/auth";
import { handle } from "@/lib/server/route";
import { createAgentKey } from "@/lib/server/near";

export const POST = (_: Request, ctx: RouteContext<"/api/companies/[id]/agent-key">) =>
  handle(async () => {
    const { id } = await ctx.params;
    await requireGuardian(id);
    return { public_key: await createAgentKey(id) };
  });
