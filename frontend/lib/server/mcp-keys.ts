import "server-only";
// Connection keys that let a business's own AI (Claude, Cursor) act as its agent through MCP.
import { createHash, randomBytes } from "node:crypto";
import { base58 } from "@scure/base";
import { db } from "./db.ts";

const hash = (key: string) => createHash("sha256").update(key).digest("hex");

/** Makes a new key for `company`, replacing any old one. Only its hash is kept, so it's shown once. */
export async function createKey(company: string): Promise<string> {
  const key = `bizzy_${base58.encode(randomBytes(24))}`;
  const conn = await db();
  await conn.execute({ sql: "DELETE FROM mcp_keys WHERE company = ?", args: [company] });
  await conn.execute({ sql: "INSERT INTO mcp_keys (hash, company) VALUES (?, ?)", args: [hash(key), company] });
  return key;
}

export async function revokeKey(company: string) {
  await (await db()).execute({ sql: "DELETE FROM mcp_keys WHERE company = ?", args: [company] });
}

export async function hasKey(company: string): Promise<boolean> {
  const { rows } = await (await db()).execute({ sql: "SELECT 1 FROM mcp_keys WHERE company = ?", args: [company] });
  return rows.length > 0;
}

/** The business a key belongs to, or null. */
export async function companyForKey(key: string): Promise<string | null> {
  const { rows } = await (await db()).execute({ sql: "SELECT company FROM mcp_keys WHERE hash = ?", args: [hash(key)] });
  return rows[0] ? String(rows[0].company) : null;
}
