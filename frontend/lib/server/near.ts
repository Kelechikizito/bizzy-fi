import "server-only";
import { FunctionCallError, generateKey, Near } from "near-kit";
import { ATTESTER_ID, NETWORK } from "../near/contracts.ts";
import { open, seal } from "./crypto.ts";
import { db } from "./db.ts";
import { HttpError, need } from "./http.ts";

export type Signer = { near: Near; id: string };

export const reader = new Near({ network: NETWORK });

const signer = (id: string, privateKey: string): Signer => ({
  near: new Near({ network: NETWORK, privateKey: privateKey as `ed25519:${string}`, defaultSignerId: id }),
  id,
});

/** The backend's own account: writes verified facts and settles due deals. It can't touch company money. */
export const backendSigner = () => signer(ATTESTER_ID, need("ATTESTER_KEY"));
/** Same account, but a key that can only call the escrow's settle methods. */
export const keeperSigner = () => signer(ATTESTER_ID, need("KEEPER_KEY"));

/** Sends one contract call and returns its transaction hash. A refused call becomes a 409. */
export const send = async (from: Signer, to: string, method: string, args: object) => (await call(from, to, method, args)).hash;

/** Like `send`, but also returns what the contract returned. NEAR holds back the fee for all of `gas` while the call runs, so a smaller budget leaves more balance to spend. */
export async function call<T = unknown>(from: Signer, to: string, method: string, args: object, gas = "200 Tgas"): Promise<{ hash: string; value: T }> {
  try {
    const result = await from.near.transaction(from.id).functionCall(to, method, args, { gas: gas as `${number} Tgas` }).send({ waitUntil: "FINAL" });
    const value = (result.status as { SuccessValue?: string }).SuccessValue;
    return { hash: result.transaction.hash, value: value ? JSON.parse(Buffer.from(value, "base64").toString()) : undefined };
  } catch (error) {
    if (error instanceof FunctionCallError) throw new HttpError(409, error.panic ?? "The contract refused this");
    throw error;
  }
}

/** Makes a new agent key for `company`, keeps it encrypted, and returns its public half. */
export async function createAgentKey(company: string): Promise<string> {
  const key = generateKey();
  const publicKey = key.publicKey.toString();
  await (await db()).execute({
    sql: "INSERT OR REPLACE INTO agent_keys (company, public_key, sealed) VALUES (?, ?, ?)",
    args: [company, publicKey, seal(`agent:${company}`, key.secretKey)],
  });
  return publicKey;
}

/** A signer for the company's agent. On chain it can only call `open_deal` and `deal_action`. */
export async function agentSigner(company: string): Promise<Signer> {
  const { rows } = await (await db()).execute({ sql: "SELECT sealed FROM agent_keys WHERE company = ?", args: [company] });
  if (!rows[0]) throw new HttpError(404, "This company has no agent yet");
  return signer(company, open(`agent:${company}`, String(rows[0].sealed)));
}
