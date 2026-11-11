"use client";
// Businesses you trade with: your invite link and QR, and approving each connection on chain.
import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";
import { Button, Problem } from "@/components/ui";
import type { Call } from "@/lib/wallet";
import { api } from "@/lib/wallet";

type Data = { code: string; connections: { other: string; hash: string; approved: boolean }[]; demos: string[] };
type Act = (label: string, calls: Call[]) => Promise<void>;

const short = (id: string) => id.split(".")[0];
const ONE = "1 yocto";

/** Shows the invite link, and lets the guardian approve or remove each connected business. */
export function Connections({ company, busy, act, version }: { company: string; busy: boolean; act: Act; version: unknown }) {
  const [data, setData] = useState<Data | null>(null);
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback((body = {}) => api<Data>(`/api/companies/${company}/connections`, body), [company]);
  useEffect(() => void fetchData().then(setData, (e) => setError(e.message)), [fetchData, version]);

  const link = data ? `${location.origin}/invite/${data.code}` : "";
  useEffect(() => void (link && QRCode.toDataURL(link, { margin: 1, width: 240 }).then(setQr)), [link]);

  /** Connects to a demo business, then adds it to your approved list in one go. */
  async function connectDemo(demo: string) {
    setError(null);
    try {
      const next = await fetchData({ demo });
      const entry = next.connections.find((c) => c.other === demo)!;
      await act(`${short(demo)} approved`, [{ method: "allow_counterparty", args: { hash: entry.hash }, deposit: ONE }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!data) return <Problem text={error} />;
  return (
    <section className="mt-10">
      <h2 className="font-display text-2xl font-bold">Businesses you trade with</h2>
      <p className="mt-1 max-w-prose text-muted">
        Share your link. When a business connects, each of you approves the other, and your agents can pay each other even on &quot;Only businesses I approve&quot;. The chain stores
        only scrambled fingerprints, so nobody can see who you trade with.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-6">
        {/* eslint-disable-next-line @next/next/no-img-element -- a generated data URL, nothing to optimise */}
        {qr && <img src={qr} alt="QR code for your invite link" className="size-32 rounded-lg border border-rule" />}
        <div className="space-y-2">
          <p className="break-all font-medium">{link}</p>
          <Button variant="plain" onClick={() => void navigator.clipboard.writeText(link).then(() => setCopied(true))}>
            {copied ? "Copied" : "Copy invite link"}
          </Button>
        </div>
      </div>

      {data.connections.length > 0 && (
        <ul className="mt-6 divide-y divide-rule border-y border-rule">
          {data.connections.map((c) => (
            <li key={c.other} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span>
                <span className="font-medium">{short(c.other)}</span>
                <span className="ml-2 text-sm text-muted">{c.approved ? "Approved: your agent may pay them" : "Connected with you. Approve them so your agent may pay them."}</span>
              </span>
              {c.approved ? (
                <Button variant="plain" disabled={busy} onClick={() => void act(`${short(c.other)} removed`, [{ method: "remove_counterparty", args: { hash: c.hash }, deposit: ONE }])}>
                  Remove
                </Button>
              ) : (
                <Button disabled={busy} onClick={() => void act(`${short(c.other)} approved`, [{ method: "allow_counterparty", args: { hash: c.hash }, deposit: ONE }])}>
                  Approve
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {data.demos.length > 0 && (
        <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted">
          No one to invite yet? Try a demo business:
          {data.demos.map((d) => (
            <Button key={d} variant="plain" disabled={busy} onClick={() => void connectDemo(d)}>
              Connect with {short(d)}
            </Button>
          ))}
        </p>
      )}
      <Problem text={error} />
    </section>
  );
}
