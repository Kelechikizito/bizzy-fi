import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { base58 } from "@scure/base";
import { open, seal } from "./crypto.ts";
import { db } from "./db.ts";

/** Stores deal terms encrypted and returns the fingerprint that goes on chain. */
export async function saveTerms(terms: object, buyer: string, seller: string): Promise<string> {
  // The random salt stops anyone guessing the terms from the public fingerprint.
  const plain = JSON.stringify({ terms, salt: randomBytes(32).toString("hex") });
  const hash = base58.encode(createHash("sha256").update(plain).digest());
  await (await db()).execute({
    sql: "INSERT INTO terms (hash, buyer, seller, sealed) VALUES (?, ?, ?, ?)",
    args: [hash, buyer, seller, seal(`terms:${hash}`, plain)],
  });
  return hash;
}

/** The terms behind `hash`, only if `viewer` is the buyer or seller. */
export async function readTerms(hash: string, viewer: string): Promise<object | null> {
  const { rows } = await (await db()).execute({
    sql: "SELECT sealed FROM terms WHERE hash = ? AND (buyer = ? OR seller = ?)",
    args: [hash, viewer, viewer],
  });
  return rows[0] ? JSON.parse(open(`terms:${hash}`, String(rows[0].sealed))).terms : null;
}
