import "server-only";
import { unstable_rethrow } from "next/navigation";
import { HttpError } from "./http.ts";

/** Runs a route body and turns its result or error into JSON. */
export async function handle(run: () => Promise<unknown>): Promise<Response> {
  try {
    return Response.json(await run());
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
    console.error(error);
    return Response.json({ error: "Something went wrong" }, { status: 500 });
  }
}
