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

/** Sends one contract call and returns its transaction hash. A refused call becomes a 409. */
export async function send(from: Signer, to: string, method: string, args: object): Promise<string> {
  try {
    const result = await from.near.transaction(from.id).functionCall(to, method, args, { gas: "200 Tgas" }).send({ waitUntil: "FINAL" });
    return result.transaction.hash;
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
