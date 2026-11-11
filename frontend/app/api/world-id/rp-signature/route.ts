import { requireAccount } from "@/lib/server/auth";
import { handle } from "@/lib/server/route";
import { requestProof } from "@/lib/server/world";

export const POST = (request: Request) =>
  handle(async () => {
    await requireAccount();
    return requestProof((await request.json()).slot);
  });
