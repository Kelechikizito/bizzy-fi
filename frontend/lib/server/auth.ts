import "server-only";
import { randomBytes } from "node:crypto";
import { verifyNep413Signature, type SignedMessage } from "near-kit";
import { cookies } from "next/headers";
import { REGISTRY_ID } from "../near/contracts.ts";
import { readSession, signSession } from "./crypto.ts";
import { db } from "./db.ts";
import { HttpError } from "./http.ts";
import { reader } from "./near.ts";

const COOKIE = "bizzy_session";
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const CHALLENGE_MS = 5 * 60 * 1000;
const MESSAGE = "Sign in to Bizzy-Fy";
const RECIPIENT = "bizzy-fy";

/** Issues a one-time challenge for the wallet to sign. */
export async function createChallenge() {
  const nonce = randomBytes(32).toString("base64");
  const now = Date.now();
  const database = await db();
  await database.execute({ sql: "DELETE FROM challenges WHERE expires_at <= ?", args: [now] });
  await database.execute({ sql: "INSERT INTO challenges (nonce, expires_at) VALUES (?, ?)", args: [nonce, now + CHALLENGE_MS] });
  return { nonce, message: MESSAGE, recipient: RECIPIENT };
}

/** Checks a signed challenge (usable once) and starts a session. */
export async function logIn(nonce: string, signed: SignedMessage): Promise<string> {
  const { rows } = await (await db()).execute({
    sql: "DELETE FROM challenges WHERE nonce = ? AND expires_at > ? RETURNING nonce",
    args: [nonce, Date.now()],
  });
  if (!rows[0]) throw new HttpError(401, "Sign-in expired. Please try again.");
  const valid = await verifyNep413Signature(
    signed,
    { message: MESSAGE, recipient: RECIPIENT, nonce: Buffer.from(nonce, "base64") },
    { near: reader, nonceValidation: "none" },
  );
  if (!valid) throw new HttpError(401, "That signature didn't check out");
  const expires = Date.now() + SESSION_MS;
  (await cookies()).set(COOKIE, signSession(signed.accountId, expires), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
  return signed.accountId;
}

/** The logged-in account; a 401 if there isn't one. */
export async function requireAccount(): Promise<string> {
  const token = (await cookies()).get(COOKIE)?.value;
  const account = token ? readSession(token, Date.now()) : null;
  if (!account) throw new HttpError(401, "Please sign in");
  return account;
}

/** Passes only if the logged-in account is this company's guardian on chain. */
export async function requireGuardian(company: string): Promise<string> {
  const account = await requireAccount();
  const record = await reader.view<{ guardian: string }>(REGISTRY_ID, "get_company", { account_id: company });
  if (!record) throw new HttpError(404, "No such company");
  if (record.guardian !== account) throw new HttpError(403, "Only this company's guardian can do that");
  return account;
}
