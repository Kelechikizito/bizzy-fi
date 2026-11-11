import "server-only";
// The contact details a business chooses to show on its public profile. Empty unless the owner fills them in.
import { db } from "./db.ts";

export const CONTACT_FIELDS = ["website", "email", "x", "telegram", "phone", "location"] as const;
export type Contacts = Partial<Record<(typeof CONTACT_FIELDS)[number], string>>;

export async function getContacts(company: string): Promise<Contacts> {
  const { rows } = await (await db()).execute({ sql: "SELECT data FROM contacts WHERE company = ?", args: [company] });
  return rows[0] ? JSON.parse(String(rows[0].data)) : {};
}

/** Saves only the known fields, trimmed; a blank field is removed. */
export async function setContacts(company: string, input: Record<string, unknown>) {
  const clean: Contacts = {};
  for (const k of CONTACT_FIELDS) {
    const v = typeof input[k] === "string" ? (input[k] as string).trim().slice(0, 100) : "";
    if (v) clean[k] = v;
  }
  await (await db()).execute({ sql: "INSERT OR REPLACE INTO contacts (company, data) VALUES (?, ?)", args: [company, JSON.stringify(clean)] });
}

/** Safe links for each filled field: only fixed prefixes, so a field can't become a script link. */
export function contactLinks(c: Contacts) {
  const handle = (v: string) => v.replace(/^@/, "").replace(/[^\w.]/g, "");
  const links: { label: string; text: string; href?: string }[] = [];
  if (c.website) {
    const url = /^https?:\/\//i.test(c.website) ? c.website : `https://${c.website}`;
    links.push({ label: "Website", text: c.website.replace(/^https?:\/\//i, ""), href: URL.canParse(url) ? url : undefined });
  }
  if (c.email) links.push({ label: "Email", text: c.email, href: `mailto:${encodeURIComponent(c.email).replace("%40", "@")}` });
  if (c.x) links.push({ label: "X", text: `@${handle(c.x)}`, href: `https://x.com/${handle(c.x)}` });
  if (c.telegram) links.push({ label: "Telegram", text: `@${handle(c.telegram)}`, href: `https://t.me/${handle(c.telegram)}` });
  if (c.phone) links.push({ label: "Phone", text: c.phone, href: `tel:${c.phone.replace(/[^\d+]/g, "")}` });
  if (c.location) links.push({ label: "Location", text: c.location });
  return links;
}
