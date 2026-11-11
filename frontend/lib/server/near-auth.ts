import "server-only";
// NEAR Auth (Google sign-in): checks a user's NEAR Auth login, and relays the on-chain `sign` call that turns an approved request into a signature.
import { createRemoteJWKSet, jwtVerify } from "jose";
import { FunctionCallError, Near } from "near-kit";
import { NEAR_AUTH } from "../near/contracts.ts";
import { HttpError, need } from "./http.ts";
import { reader } from "./near.ts";
import { SPONSOR_ID } from "./sponsor.ts";

const ISSUER = `https://${NEAR_AUTH.domain}/`;
const keys = createRemoteJWKSet(new URL(`${ISSUER}.well-known/jwks.json`));

/** Verifies a NEAR Auth ID token and returns the NEAR account it controls: the implicit account of the key NEAR's MPC network derives for that login. */
export async function accountFromIdToken(idToken: unknown): Promise<string> {
  if (typeof idToken !== "string")
    throw new HttpError(400, "Missing sign-in token");
  const { payload } = await jwtVerify(idToken, keys, {
    issuer: ISSUER,
    audience: NEAR_AUTH.clientId,
  }).catch(() => {
    throw new HttpError(
      401,
      "That Google sign-in didn't check out. Please try again.",
    );
  });
  if (!payload.sub)
    throw new HttpError(
      401,
      "That Google sign-in didn't check out. Please try again.",
    );
  const key = await reader.view<string>(
    NEAR_AUTH.mpcContractId,
    "derived_public_key",
    {
      path: `jwt#${ISSUER}#${payload.sub}`,
      predecessor: NEAR_AUTH.fastAuthContractId,
      domain_id: 1,
    },
  );
  return implicitFromKey(key ?? "");
}

/** "ed25519:<base58>" to the 64-hex implicit account that key owns. */
function implicitFromKey(key: string): string {
  const [type, data] = key.split(":");
  if (type !== "ed25519" || !data)
    throw new HttpError(502, "NEAR Auth returned an unexpected key");
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = 0n;
  for (const c of data) n = n * 58n + BigInt(alphabet.indexOf(c));
  return n.toString(16).padStart(64, "0");
}

type SignRequest = {
  guardId?: unknown;
  verifyPayload?: unknown;
  signPayload?: unknown;
  algorithm?: unknown;
};

/** Submits NEAR Auth's `sign` call from our sponsor account (the user's own account can't pay before it's signed) and returns the raw base64 result. */
export async function relaySign(request: SignRequest): Promise<string> {
  const { guardId, verifyPayload, signPayload, algorithm = "eddsa" } = request;
  const bytes =
    Array.isArray(signPayload) &&
    signPayload.length <= 8192 &&
    signPayload.every((b) => Number.isInteger(b) && b >= 0 && b < 256);
  if (
    guardId !== `jwt#${ISSUER}` ||
    typeof verifyPayload !== "string" ||
    verifyPayload.length > 8192 ||
    !bytes ||
    algorithm !== "eddsa"
  ) {
    throw new HttpError(400, "Bad signature request");
  }
  const near = new Near({
    network: "testnet",
    privateKey: need("SPONSOR_KEY") as `ed25519:${string}`,
    defaultSignerId: SPONSOR_ID,
  });
  try {
    const result = await near
      .transaction(SPONSOR_ID)
      .functionCall(
        NEAR_AUTH.fastAuthContractId,
        "sign",
        {
          guard_id: guardId,
          verify_payload: verifyPayload,
          sign_payload: signPayload,
          algorithm,
        },
        { gas: "300 Tgas" },
      )
      .send({ waitUntil: "FINAL" });
    const value = (result.status as { SuccessValue?: string }).SuccessValue;
    if (!value)
      throw new HttpError(
        409,
        "NEAR Auth didn't approve that signature. Please try again.",
      );
    return value;
  } catch (error) {
    if (error instanceof FunctionCallError)
      throw new HttpError(
        409,
        error.panic ?? "NEAR Auth refused that signature",
      );
    throw error;
  }
}
