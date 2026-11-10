import { requireAccount } from "@/lib/server/auth";
import { handle } from "@/lib/server/route";
import { sponsor } from "@/lib/server/sponsor";

export const POST = () => handle(async () => ({ tx: await sponsor(await requireAccount()) }));
