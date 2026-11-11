import { requireAccount } from "@/lib/server/auth";
import { relaySign } from "@/lib/server/near-auth";
import { handle } from "@/lib/server/route";

/** Relays a signed-in user's approved NEAR Auth request on chain and returns the signature result. */
export const POST = (request: Request) =>
  handle(async () => {
    await requireAccount();
    return { result: await relaySign(await request.json().catch(() => ({}))) };
  });
