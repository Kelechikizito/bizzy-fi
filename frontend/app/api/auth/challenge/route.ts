import { createChallenge } from "@/lib/server/auth";
import { handle } from "@/lib/server/route";

export const POST = () => handle(createChallenge);
