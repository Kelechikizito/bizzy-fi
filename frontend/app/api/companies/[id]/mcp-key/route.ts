import { requireGuardian } from "@/lib/server/auth";
import { createKey, hasKey, revokeKey } from "@/lib/server/mcp-keys";
import { handle } from "@/lib/server/route";

/** Whether this business has a connection key. `{ action: "create" }` makes one (shown once); `"revoke"` turns it off. */
export const POST = (request: Request, ctx: RouteContext<"/api/companies/[id]/mcp-key">) =>
  handle(async () => {
    const { id } = await ctx.params;
    await requireGuardian(id);
    const { action } = await request.json().catch(() => ({}));
    if (action === "create") return { active: true, key: await createKey(id) };
    if (action === "revoke") await revokeKey(id);
    return { active: await hasKey(id) };
  });
