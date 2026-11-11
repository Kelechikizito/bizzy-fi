import { requireGuardian } from "@/lib/server/auth";
import { getContacts, setContacts } from "@/lib/server/contacts";
import { handle } from "@/lib/server/route";

/** Reads, or with `{ contacts }` saves, what this business shows on its public profile. */
export const POST = (request: Request, ctx: RouteContext<"/api/companies/[id]/contacts">) =>
  handle(async () => {
    const { id } = await ctx.params;
    await requireGuardian(id);
    const { contacts } = await request.json().catch(() => ({}));
    if (contacts && typeof contacts === "object") await setContacts(id, contacts);
    return { contacts: await getContacts(id) };
  });
