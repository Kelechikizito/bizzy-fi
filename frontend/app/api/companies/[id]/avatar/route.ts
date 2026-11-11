import { requireGuardian } from "@/lib/server/auth";
import { getAvatar, setAvatar } from "@/lib/server/avatar";
import { handle } from "@/lib/server/route";

/** Reads, or with `{ image }` saves (null removes), this business's profile picture. */
export const POST = (
  request: Request,
  ctx: RouteContext<"/api/companies/[id]/avatar">,
) =>
  handle(async () => {
    const { id } = await ctx.params;
    await requireGuardian(id);
    const body = await request.json().catch(() => ({}));
    if ("image" in body) await setAvatar(id, body.image);
    return { image: await getAvatar(id) };
  });
