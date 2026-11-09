import { timingSafeEqual } from "node:crypto";
import { HttpError, need } from "@/lib/server/http";
import { handle } from "@/lib/server/route";
import { settleDue } from "@/lib/server/keeper";

export const GET = (request: Request) =>
  handle(async () => {
    const given = Buffer.from(request.headers.get("authorization") ?? "");
    const expected = Buffer.from(`Bearer ${need("CRON_SECRET")}`);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new HttpError(401, "Not allowed");
    return settleDue();
  });
