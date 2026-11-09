import "server-only";
import { signRequest } from "@worldcoin/idkit-core/signing";
import { base58 } from "@scure/base";
import { REGISTRY_ID } from "../near/contracts.ts";
import { HttpError, need } from "./http.ts";
import { backendSigner, send } from "./near.ts";

const ACTION = "verify-guardian";
const environment = () => process.env.WORLD_ENVIRONMENT ?? "staging";

type WorldProof = { action?: string; environment?: string; responses?: { nullifier?: string }[] };

/** Signs a proof request so the browser can open World ID. */
export function requestProof() {
  const { sig, nonce, createdAt, expiresAt } = signRequest({ signingKeyHex: need("WORLD_SIGNING_KEY"), action: ACTION });
  return {
    app_id: need("WORLD_APP_ID"),
    action: ACTION,
    environment: environment(),
    rp_context: { rp_id: need("WORLD_RP_ID"), nonce, created_at: createdAt, expires_at: expiresAt, signature: sig },
  };
}

/** World's 256-bit hex nullifier as the 32-byte base58 hash the registry stores. */
export function nullifierToHash(hex: string): string {
  if (!/^0x[0-9a-fA-F]{1,64}$/.test(hex)) throw new HttpError(400, "Bad World ID proof");
  return base58.encode(Buffer.from(hex.slice(2).padStart(64, "0"), "hex"));
}

/** Asks World to check the proof and returns its nullifier hash. */
export async function verifyProof(proof: WorldProof): Promise<string> {
  if (proof.environment !== environment() || proof.action !== ACTION || proof.responses?.length !== 1) {
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
