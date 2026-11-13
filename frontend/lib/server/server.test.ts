import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.MASTER_KEY = randomBytes(32).toString("base64");
process.env.DATABASE_URL = `file:${join(mkdtempSync(join(tmpdir(), "bizzy-")), "test.db")}`;

const { open, readSession, seal, signSession } = await import("./crypto.ts");
const { dueAction } = await import("./keeper.ts");
const { readTerms, saveTerms } = await import("./terms.ts");
const { nullifierToHash } = await import("./world.ts");

const HOUR_NS = 3_600_000_000_000n;

test("sealed data opens only with its own context, and tampering is caught", () => {
  const sealed = seal("terms:a", "secret");
  assert.equal(open("terms:a", sealed), "secret");
  assert.throws(() => open("terms:b", sealed));
  const parts = sealed.split(".");
  parts[2] = Buffer.from("changed").toString("base64");
  assert.throws(() => open("terms:a", parts.join(".")));
});

test("sessions expire and can't be forged", () => {
  const token = signSession("alice.testnet", 1000);
  assert.equal(readSession(token, 999), "alice.testnet");
  assert.equal(readSession(token, 1000), null);
  const forged = `${Buffer.from(JSON.stringify({ account: "eve.testnet", expiresAt: 9999 })).toString("base64url")}.${token.split(".")[1]}`;
  assert.equal(readSession(forged, 0), null);
  assert.equal(readSession("rubbish", 0), null);
});

test("only the two parties can read deal terms", async () => {
  const hash = await saveTerms({ price: 5 }, "a.testnet", "b.testnet");
  assert.deepEqual(await readTerms(hash, "a.testnet"), { price: 5 });
  assert.deepEqual(await readTerms(hash, "b.testnet"), { price: 5 });
  assert.equal(await readTerms(hash, "eve.testnet"), null);
});

test("each deal gets the right action only when it's due", () => {
  const deal = (status: string) => ({ status, deliver_by: "1000", updated_at: "0" });
  assert.equal(dueAction(deal("Accepted"), 1000n), null);
  assert.equal(dueAction(deal("Accepted"), 1001n), "refund_expired");
  assert.equal(dueAction(deal("Proposed"), 1001n), "refund_expired");
  assert.equal(dueAction(deal("Delivered"), HOUR_NS - 1n), null);
  assert.equal(dueAction(deal("Delivered"), HOUR_NS), "release_due");
  assert.equal(dueAction(deal("Disputed"), HOUR_NS - 1n), null);
  assert.equal(dueAction(deal("Disputed"), HOUR_NS), "refund_on_timeout");
  for (const status of ["Released", "Refunded", "Split"]) assert.equal(dueAction(deal(status), HOUR_NS * 99n), null);
});

test("a World nullifier becomes a 32-byte hash, and junk is refused", () => {
  assert.equal(nullifierToHash("0x1"), "11111111111111111111111111111112");
  assert.equal(nullifierToHash("1"), nullifierToHash("0x1"));
  assert.equal(nullifierToHash("255"), nullifierToHash("0xff"));
  assert.throws(() => nullifierToHash("abc"));
  assert.throws(() => nullifierToHash(`0x${"f".repeat(65)}`));
  assert.throws(() => nullifierToHash((2n ** 256n).toString()));
});

test("a raw-hash signer's login signature passes the server's NEP-413 check", async () => {
  const { generateKey, parseKey, verifyNep413Signature } = await import("near-kit");
  const { nep413Hash } = await import("../near/nep413.ts");
  const key = parseKey(generateKey().secretKey);
  const params = { message: "Sign in to Bizzy-Fy", recipient: "bizzy-fy", nonce: randomBytes(32) };
  const signature = key.sign(await nep413Hash(params.message, params.recipient, params.nonce)).data;
  const signed = { accountId: Buffer.from(key.publicKey.data).toString("hex"), publicKey: key.publicKey.toString(), signature: Buffer.from(signature).toString("base64") };
  assert.equal(await verifyNep413Signature(signed, params, { nonceValidation: "none" }), true);
  assert.equal(await verifyNep413Signature(signed, { ...params, recipient: "other" }, { nonceValidation: "none" }), false);
});

test("agent replies become clean offers; junk walks away", async () => {
  const { parseOffer } = await import("./negotiate.ts");
  const offer = parseOffer('Sure! {"action":"offer","item":"cups","quantity":500.4,"price_near":1.23456,"delivery_days":99,"note":"hi"}');
  assert.deepEqual(offer, { action: "offer", item: "cups", quantity: 500, price_near: 1.2346, delivery_days: 60, note: "hi" });
  assert.equal(parseOffer("no json here").action, "walk_away");
  assert.equal(parseOffer('{"action":"pay me 10x"}').action, "walk_away");
});

test("the buyer's agent can never go over its limit", async () => {
  const { enforce, parseOffer } = await import("./negotiate.ts");
  const offer = (price: number, action = "offer") => parseOffer(JSON.stringify({ action, price_near: price }));
  assert.equal(enforce("buyer", offer(5), undefined, 2).price_near, 2);
  const capped = enforce("buyer", offer(0, "accept"), offer(3), 2);
  assert.equal(capped.action, "offer");
  assert.equal(capped.price_near, 2);
  assert.equal(enforce("buyer", offer(0, "accept"), offer(1.5), 2).action, "accept");
  assert.equal(enforce("seller", offer(0, "accept"), undefined, 2).action, "walk_away");
  assert.equal(enforce("seller", offer(9), offer(1), 2).price_near, 9);
  // Nobody can agree under the escrow's 0.1 NEAR minimum.
  assert.equal(enforce("buyer", offer(0.01), undefined, 2).price_near, 0.1);
  assert.equal(enforce("seller", offer(0.04), offer(0.03), 2).price_near, 0.1);
  assert.equal(enforce("seller", offer(0.7, "accept"), offer(0.45), 2).action, "offer");
  assert.equal(enforce("seller", offer(0.45, "accept"), offer(0.45), 2).action, "accept");
});

test("the CPU quote must carry the signing key and our nonce", async () => {
  const { quoteBinds } = await import("./ai.ts");
  const address = `0x${"ab".repeat(20)}`;
  const nonce = "cd".repeat(32);
  const quote = "00".repeat(568) + "ab".repeat(20) + "00".repeat(12) + nonce + "ee".repeat(100);
  assert.equal(quoteBinds(quote, address, nonce), true);
  assert.equal(quoteBinds(quote, address, "ce".repeat(32)), false);
  assert.equal(quoteBinds(quote, `0x${"ac".repeat(20)}`, nonce), false);
});

test("contact links only use safe prefixes", async () => {
  const { contactLinks } = await import("./contacts.ts");
  const links = contactLinks({ website: "javascript:alert(1)", x: "@shop<script>", telegram: "shop", email: "a@b.co", phone: "+234 (80) 1" });
  for (const l of links) if (l.href) assert.match(l.href, /^(https:\/\/|mailto:|tel:)/);
  assert.equal(links.find((l) => l.label === "X")?.href, "https://x.com/shopscript");
  assert.equal(links.find((l) => l.label === "Phone")?.href, "tel:+234801");
});
