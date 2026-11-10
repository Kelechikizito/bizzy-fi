import { requireGuardian } from "@/lib/server/auth";
import { getBrief, setBrief } from "@/lib/server/negotiate";
import { handle } from "@/lib/server/route";

/** Reads, or with `text` saves, the private notes the agent sells by. */
export const POST = (request: Request, ctx: RouteContext<"/api/companies/[id]/brief">) =>
  handle(async () => {
    const { id } = await ctx.params;
    await requireGuardian(id);
    const { text } = await request.json();
    if (typeof text === "string") await setBrief(id, text);
    return { text: await getBrief(id) };
  });
