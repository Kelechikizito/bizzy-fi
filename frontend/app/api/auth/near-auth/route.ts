import { startSession } from "@/lib/server/auth";
import { accountFromIdToken } from "@/lib/server/near-auth";
import { handle } from "@/lib/server/route";

/** Signs in with a NEAR Auth (Google) ID token. */
export const POST = (request: Request) =>
  handle(async () => {
    const { idToken } = await request.json().catch(() => ({}));
    return { account: await startSession(await accountFromIdToken(idToken)) };
  });
