import "server-only";
import { Near } from "near-kit";
import { NETWORK } from "../near/contracts.ts";
import { db } from "./db.ts";
import { need } from "./http.ts";
import { reader } from "./near.ts";

const SPONSOR_ID = "bizzy-fy-sponsor.testnet";
const MAX_PER_DAY = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Gives a new testnet account 1 test NEAR, once, so sign-up stays one click. Returns the tx hash, or null if skipped. */
export async function sponsor(account: string): Promise<string | null> {
  if (NETWORK !== "testnet") return null;
  const balance = (await reader.accountExists(account)) ? Number(await reader.getBalance(account)) : 0;
  if (balance >= 0.5) return null;
  const database = await db();
  const { rows } = await database.execute({ sql: "SELECT COUNT(*) AS n FROM sponsored WHERE at > ?", args: [Date.now() - DAY_MS] });
  if (Number(rows[0].n) >= MAX_PER_DAY) return null;
  const claimed = await database.execute({ sql: "INSERT OR IGNORE INTO sponsored (account, at) VALUES (?, ?)", args: [account, Date.now()] });
  if (claimed.rowsAffected === 0) return null;
  const near = new Near({ network: NETWORK, privateKey: need("SPONSOR_KEY") as `ed25519:${string}`, defaultSignerId: SPONSOR_ID });
  const result = await near.transaction(SPONSOR_ID).transfer(account, "1 NEAR").send({ waitUntil: "FINAL" });
  return result.transaction.hash;
}
