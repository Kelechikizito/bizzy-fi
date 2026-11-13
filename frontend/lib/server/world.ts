import "server-only";
import { signRequest } from "@worldcoin/idkit-core/signing";
import { base58 } from "@scure/base";
import { REGISTRY_ID } from "../near/contracts.ts";
import { HttpError, need } from "./http.ts";
import { backendSigner, send } from "./near.ts";

/** World lets a person prove once per action, so three numbered actions give each person up to 3 businesses. */
const ACTIONS = ["verify-guardian-1", "verify-guardian-2", "verify-guardian-3"];
/** production (the World App) or sandbox (World's testing app); required, so a missing setting fails loudly. */
const environment = () => need("WORLD_ENVIRONMENT");

type WorldProof = { protocol_version?: string; action?: string; environment?: string; responses?: { nullifier?: string }[] };

/** Signs a proof request for business slot `slot` (1–3) so the browser can open World ID. */
export function requestProof(slot: unknown) {
  const action = ACTIONS[Number(slot) - 1];
  if (!action) throw new HttpError(400, "Bad World ID slot");
  const { sig, nonce, createdAt, expiresAt } = signRequest({ signingKeyHex: need("WORLD_SIGNING_KEY"), action });
  return {
    app_id: need("WORLD_APP_ID"),
    action,
    environment: environment(),
    rp_context: { rp_id: need("WORLD_RP_ID"), nonce, created_at: createdAt, expires_at: expiresAt, signature: sig },
  };
}

/** World's 256-bit nullifier (decimal in v4, hex in v3) as the 32-byte base58 hash the registry stores. */
export function nullifierToHash(value: string): string {
  if (!/^(0x[0-9a-fA-F]{1,64}|\d{1,78})$/.test(value) || BigInt(value) >= 2n ** 256n) throw new HttpError(400, "Bad World ID proof");
  return base58.encode(Buffer.from(BigInt(value).toString(16).padStart(64, "0"), "hex"));
}

/** Asks World to check the proof and returns its nullifier hash. */
export async function verifyProof(proof: WorldProof): Promise<string> {
  // Only 3.0 proofs: a person's 3.0 and 4.0 nullifiers differ, so accepting both would let one human verify twice.
  if (proof.protocol_version !== "3.0" || proof.environment !== environment() || !ACTIONS.includes(proof.action ?? "") || proof.responses?.length !== 1) {
    throw new HttpError(400, "Bad World ID proof");
  }
  const response = await fetch(`https://developer.world.org/api/v4/verify/${need("WORLD_RP_ID")}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(proof),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.success !== true || result.environment !== environment()) {
    throw new HttpError(400, "World ID didn't accept that proof");
  }
  return nullifierToHash(String(proof.responses[0].nullifier));
}

/** Records on chain that a real human runs `company`. */
export const attestHuman = (company: string, hash: string) =>
  send(backendSigner(), REGISTRY_ID, "attest", { company, kind: "Human", hash });
