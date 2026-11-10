import { requireAccount } from "@/lib/server/auth";
import { handle } from "@/lib/server/route";

export const GET = () => handle(async () => ({ account: await requireAccount() }));
