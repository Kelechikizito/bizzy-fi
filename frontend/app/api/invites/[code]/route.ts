import { inviter } from "@/lib/server/connections";
import { reader } from "@/lib/server/near";
import { REGISTRY_ID } from "@/lib/near/contracts";
import { handle } from "@/lib/server/route";

/** Who sent this invite: their address and one-line description. */
export const POST = (_: Request, ctx: RouteContext<"/api/invites/[code]">) =>
  handle(async () => {
    const company = await inviter((await ctx.params).code);
    const record = await reader.view<{ about: string }>(REGISTRY_ID, "get_company", { account_id: company });
    return { company, about: record?.about ?? "" };
  });
