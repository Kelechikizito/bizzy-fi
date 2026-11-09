import { logIn } from "@/lib/server/auth";
import { handle } from "@/lib/server/route";

export const POST = (request: Request) =>
  handle(async () => {
    const { nonce, signed } = await request.json();
    return { account: await logIn(nonce, signed) };
  });
