import "server-only";
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { need } from "./http.ts";

/** Derives a separate key for each purpose, so one record's key opens nothing else. */
function keyFor(context: string): Buffer {
  const master = Buffer.from(need("MASTER_KEY"), "base64");
  if (master.length !== 32) throw new Error("MASTER_KEY must be 32 bytes of base64");
  return Buffer.from(hkdfSync("sha256", master, Buffer.alloc(0), context, 32));
}

/** Encrypts `plain` with AES-256-GCM under a key tied to `context`. */
export function seal(context: string, plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(context), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString("base64")).join(".");
}

/** Decrypts `seal` output; throws if the data or context was changed. */
export function open(context: string, sealed: string): string {
  const [iv, tag, data] = sealed.split(".").map((part) => Buffer.from(part, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", keyFor(context), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

const mac = (payload: string) => createHmac("sha256", keyFor("session")).update(payload).digest();

/** Makes a tamper-proof login token for `account`. */
export function signSession(account: string, expiresAt: number): string {
  const payload = Buffer.from(JSON.stringify({ account, expiresAt })).toString("base64url");
  return `${payload}.${mac(payload).toString("base64url")}`;
}

/** Returns the account in a valid, unexpired token, or null. */
export function readSession(token: string, now: number): string | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const given = Buffer.from(signature, "base64url");
  const expected = mac(payload);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const { account, expiresAt } = JSON.parse(Buffer.from(payload, "base64url").toString());
  return expiresAt > now ? account : null;
}
