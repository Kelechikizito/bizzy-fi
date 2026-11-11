import { requireGuardian } from "@/lib/server/auth";
import { connect, connections, inviteCode, inviter } from "@/lib/server/connections";
import { DEMO_SELLERS } from "@/lib/server/demo";
import { HttpError } from "@/lib/server/http";
import { handle } from "@/lib/server/route";

/** This business's invite code and connections. `{ invite }` accepts an invite; `{ demo }` connects to a demo business. */
export const POST = (request: Request, ctx: RouteContext<"/api/companies/[id]/connections">) =>
  handle(async () => {
    const { id } = await ctx.params;
    await requireGuardian(id);
    const { invite, demo } = await request.json().catch(() => ({}));
    if (typeof invite === "string") await connect(id, await inviter(invite));
    if (typeof demo === "string") {
      if (!DEMO_SELLERS.includes(demo)) throw new HttpError(400, "Not a demo business");
      await connect(id, demo);
    }
    const list = await connections(id);
    return {
      code: await inviteCode(id),
      connections: list.map(({ other, hash, approved }) => ({ other, hash, approved })),
      demos: DEMO_SELLERS.filter((d) => d !== id && !list.some((c) => c.other === d)),
    };
  });
