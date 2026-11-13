import "server-only";
// What a business sells: a public part buyers' agents shop by, and a private part only its own agent haggles with.
import { chat } from "./ai.ts";
import { open, seal } from "./crypto.ts";
import { db } from "./db.ts";

export type Listing = {
  /** Public. */
  overview: string;
  services: string;
  website: string;
  /** Private. */
  prices: string;
  lowest_unit_price: number;
  quantity: string;
  terms: string;
};

const TEXT = ["overview", "services", "website", "prices", "quantity", "terms"] as const;

/** Trims and caps every field; drops a website that isn't an http(s) link. */
export function clean(raw: Record<string, unknown>): Listing {
  const l = Object.fromEntries(TEXT.map((k) => [k, String(raw[k] ?? "").trim().slice(0, 600)])) as Omit<Listing, "lowest_unit_price">;
  if (!/^https?:\/\/\S+$/.test(l.website)) l.website = "";
  return { ...l, lowest_unit_price: Math.max(0, Number(raw.lowest_unit_price) || 0) };
}

/** A business has listed once it says what it sells. */
export const listed = (l: Listing) => !!(l.services || l.prices);

export async function getListing(company: string): Promise<Listing> {
  const { rows } = await (await db()).execute({ sql: "SELECT sealed FROM briefs WHERE company = ?", args: [company] });
  if (!rows[0]) return clean({});
  const text = open(`brief:${company}`, String(rows[0].sealed));
  try {
    return clean(JSON.parse(text));
  } catch {
    return clean({ prices: text }); // Saved before listings had fields.
  }
}

export async function setListing(company: string, listing: Listing) {
  await (await db()).execute({ sql: "INSERT OR REPLACE INTO briefs (company, sealed) VALUES (?, ?)", args: [company, seal(`brief:${company}`, JSON.stringify(listing))] });
}

/** The public part, for buyers' agents and the profile page. */
export const publicListing = ({ overview, services, website }: Listing) => ({ overview, services, website });

/** The seller agent's private instructions, as text. */
export const brief = (l: Listing) =>
  [
    l.overview && `About us: ${l.overview}`,
    `What we sell: ${l.services || "see prices"}`,
    l.prices && `Prices: ${l.prices}`,
    l.lowest_unit_price && `Lowest price: ${l.lowest_unit_price} NEAR per unit`,
    l.quantity && `How many we can supply: ${l.quantity}`,
    l.terms && `Terms: ${l.terms}`,
  ]
    .filter(Boolean)
    .join("\n");

/** Turns one sentence into a full listing for the owner to check. */
export async function draftListing(sentence: string): Promise<Listing> {
  const reply = await chat([
    {
      role: "system",
      content: `Turn a business owner's description into a sales listing. Reply only with JSON: {"overview":string,"services":string,"prices":string,"lowest_unit_price":number,"quantity":string,"terms":string}.
overview: one public sentence about the business. services: public list of what it sells. prices: private price points in NEAR, with any bulk discounts. lowest_unit_price: the lowest NEAR per unit they'd accept (about 75% of list price if not said). quantity: how many they can supply. terms: delivery time and other conditions. Use only what they said or sensible guesses; keep each field short.`,
    },
    { role: "user", content: sentence.slice(0, 1000) },
  ]);
  try {
    return clean(JSON.parse(reply.content.slice(reply.content.indexOf("{"), reply.content.lastIndexOf("}") + 1)));
  } catch {
    return clean({ services: sentence });
  }
}
