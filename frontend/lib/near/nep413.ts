// The hash a wallet signs to prove it owns an account (NEP-413), for signers that only sign raw hashes.

/** NEP-413 payload hash: what a wallet signs to prove it owns an account. */
export async function nep413Hash(message: string, recipient: string, nonce: Uint8Array) {
  const text = (s: string) => {
    const bytes = new TextEncoder().encode(s);
    const out = new Uint8Array(4 + bytes.length);
    new DataView(out.buffer).setUint32(0, bytes.length, true);
    out.set(bytes, 4);
    return out;
  };
  const tag = new Uint8Array(4);
  new DataView(tag.buffer).setUint32(0, 2 ** 31 + 413, true);
  const parts = [tag, text(message), nonce, text(recipient), new Uint8Array([0])];
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  parts.reduce((at, p) => (all.set(p, at), at + p.length), 0);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", all));
}
