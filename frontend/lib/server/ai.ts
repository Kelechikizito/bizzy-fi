import "server-only";
// Private AI on NEAR AI Cloud: chats run inside secure hardware (TEEs), and every reply is signed there.
import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { recoverMessageAddress } from "viem";
import { HttpError, need } from "./http.ts";

const API = "https://cloud-api.near.ai/v1";
const NRAS = "https://nras.attestation.nvidia.com";
const nvidiaKeys = createRemoteJWKSet(new URL(`${NRAS}/.well-known/jwks.json`));

/** A private model (runs in a TEE, not a third party's servers). */
export const MODEL = process.env.NEAR_AI_MODEL ?? "Qwen/Qwen3.6-35B-A3B-FP8";

export type Message = { role: "system" | "user" | "assistant"; content: string };
/** A reply plus the hashes of the exact bytes sent and received, which the TEE signs. */
export type Reply = { id: string; content: string; request: string; response: string };
/** What the "Verified private" badge stands on. */
export type Proof = { model: string; nonce: string; address: string | null; gpu: boolean; bound: boolean; signed: number; replies: number; verified: boolean };

const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const get = async (path: string) => {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${need("NEAR_AI_API_KEY")}` } });
  if (!res.ok) throw new HttpError(502, `NEAR AI Cloud said ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
};

/** One chat turn, answered in JSON. */
export async function chat(messages: Message[]): Promise<Reply> {
  const body = JSON.stringify({ model: MODEL, messages, temperature: 0.4, response_format: { type: "json_object" }, chat_template_kwargs: { enable_thinking: false } });
  const res = await fetch(`${API}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${need("NEAR_AI_API_KEY")}` },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new HttpError(502, `NEAR AI Cloud said ${res.status}: ${text.slice(0, 200)}`);
  const json = JSON.parse(text);
  return { id: json.id, content: json.choices[0].message.content, request: sha(body), response: sha(text) };
}

/** Asks the model's TEE to prove itself with a fresh nonce; checks the GPU with NVIDIA and the key binding in the CPU quote. */
export async function attest(): Promise<Pick<Proof, "nonce" | "address" | "gpu" | "bound">> {
  const nonce = randomBytes(32).toString("hex");
  const report = await get(`/attestation/report?model=${encodeURIComponent(MODEL)}&signing_algo=ecdsa&nonce=${nonce}`);
  const node = (report.model_attestations ?? [report])[0];
  const address: string = node.signing_address;
  const [gpu, bound] = await Promise.all([gpuPasses(node.nvidia_payload, nonce), Promise.resolve(quoteBinds(node.intel_quote, address, nonce))]);
  return { nonce, address, gpu, bound };
}

/** NVIDIA's attestation service signs the GPU's result; we check its signature, the verdict and our nonce. */
async function gpuPasses(payload: string | object, nonce: string): Promise<boolean> {
  try {
    const res = await fetch(`${NRAS}/v3/attest/gpu`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof payload === "string" ? payload : JSON.stringify(payload),
    });
    const [[, jwt]] = await res.json();
    const { payload: claims } = await jwtVerify(jwt, nvidiaKeys, { issuer: NRAS });
    return claims["x-nvidia-overall-att-result"] === true && claims.eat_nonce === nonce;
  } catch {
    return false;
  }
}

/** The CPU quote's report data must hold the signing key (padded to 32 bytes) and then our nonce. */
export function quoteBinds(quote: string, address: string, nonce: string): boolean {
  // TDX quote v4: 48-byte header, then the TD report whose last 64 bytes (from byte 520) are the report data.
  const data = quote.replace(/^0x/, "").slice((48 + 520) * 2, (48 + 584) * 2).toLowerCase();
  return data === address.replace(/^0x/, "").toLowerCase().padEnd(64, "0") + nonce.toLowerCase();
}

/** True if the TEE with `address` signed exactly this request and response. */
export async function signedBy(reply: Reply, address: string): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const sig = await get(`/signature/${reply.id}?model=${encodeURIComponent(MODEL)}&signing_algo=ecdsa`);
      if (!String(sig.text).endsWith(`${reply.request}:${reply.response}`)) return false;
      const signer = await recoverMessageAddress({ message: sig.text, signature: sig.signature });
      return signer.toLowerCase() === address.toLowerCase();
    } catch {
      // The signature lives on the node that answered; another node may answer first, so retry.
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return false;
}

/** Checks every reply against the attested key and sums up the proof. */
export async function prove(attested: Awaited<ReturnType<typeof attest>>, replies: Reply[]): Promise<Proof> {
  const signed = attested.address ? (await Promise.all(replies.map((r) => signedBy(r, attested.address!)))).filter(Boolean).length : 0;
  const verified = attested.gpu && attested.bound && replies.length > 0 && signed === replies.length;
  return { model: MODEL, ...attested, signed, replies: replies.length, verified };
}
