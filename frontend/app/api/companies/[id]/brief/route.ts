import { requireGuardian } from "@/lib/server/auth";
import { clean, draftListing, getListing, setListing } from "@/lib/server/listing";
import { handle } from "@/lib/server/route";

/** Reads the listing the agent sells by; with `listing` saves it, with `draft` writes one from a sentence (not saved). */
export const POST = (request: Request, ctx: RouteContext<"/api/companies/[id]/brief">) =>
  handle(async () => {
    const { id } = await ctx.params;
    await requireGuardian(id);
    const { listing, draft } = await request.json();
    if (typeof draft === "string" && draft.trim()) return { listing: await draftListing(draft) };
    if (listing && typeof listing === "object") await setListing(id, clean(listing));
    return { listing: await getListing(id) };
  });
