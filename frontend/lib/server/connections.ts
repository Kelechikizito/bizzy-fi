import "server-only";
// Trading partners: one invite link per business, and the secret salt behind each approved-list entry.
import { createHash, randomBytes } from "node:crypto";
import { base58 } from "@scure/base";
import { open, seal } from "./crypto.ts";
import { db } from "./db.ts";
import { HttpError } from "./http.ts";
import { reader } from "./near.ts";

/** The fingerprint the policy contract stores for an approved business: sha256(salt + account). */
export const entryHash = (salt: string, account: string) =>
  base58.encode(createHash("sha256").update(Buffer.concat([base58.decode(salt), Buffer.from(account)])).digest());

/** This business's invite code, made on first use. */
export async function inviteCode(company: string): Promise<string> {
  const conn = await db();
  await conn.execute({ sql: "INSERT OR IGNORE INTO invites (code, company) VALUES (?, ?)", args: [base58.encode(randomBytes(8)), company] });
  const { rows } = await conn.execute({ sql: "SELECT code FROM invites WHERE company = ?", args: [company] });
  return String(rows[0].code);
}

/** The business behind an invite code. */
export async function inviter(code: string): Promise<string> {
  const { rows } = await (await db()).execute({ sql: "SELECT company FROM invites WHERE code = ?", args: [code] });
  if (!rows[0]) throw new HttpError(404, "This invite link doesn't work");
  return String(rows[0].company);
}

/** Connects two businesses. Each gets its own secret salt for the other, so the chain can't link the two entries. */
export async function connect(a: string, b: string) {
  if (a === b) throw new HttpError(400, "That's your own invite link");
  const conn = await db();
  for (const [company, other] of [[a, b], [b, a]]) {
    await conn.execute({
      sql: "INSERT OR IGNORE INTO connections (company, other, sealed) VALUES (?, ?, ?)",
      args: [company, other, seal(`salt:${company}:${other}`, base58.encode(randomBytes(32)))],
    });
  }
}

/** Everyone this business is connected to, the entry to add on chain, and whether its guardian already added it. */
export async function connections(company: string) {
  const { rows } = await (await db()).execute({ sql: "SELECT other, sealed FROM connections WHERE company = ?", args: [company] });
  return Promise.all(
    rows.map(async (r) => {
      const other = String(r.other);
      const salt = open(`salt:${company}:${other}`, String(r.sealed));
      const hash = entryHash(salt, other);
      return { other, hash, salt, approved: !!(await reader.view<boolean>(company, "is_allowed", { hash })) };
    }),
  );
}
