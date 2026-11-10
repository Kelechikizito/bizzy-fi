import { logOut } from "@/lib/server/auth";
import { handle } from "@/lib/server/route";

export const POST = () => handle(async () => (await logOut(), { ok: true }));
