"use client";
// "Ask your agent", the private negotiations it ran, and the private notes it sells by.
import { useCallback, useEffect, useState } from "react";
import { ShareOnX } from "@/components/share";
import { Button, Problem, Receipt } from "@/components/ui";
import { api } from "@/lib/wallet";

type Offer = { action: string; item: string; quantity: number; price_near: number; delivery_days: number; note: string };
type Negotiation = {
  id: number;
  buyer: string;
  seller: string;
  status: "opened" | "waiting" | "no_deal" | "failed";
  request: string;
  turns: { side: "buyer" | "seller"; offer: Offer }[];
  terms: Offer | null;
  proof: { model: string; gpu: boolean; bound: boolean; signed: number; replies: number; verified: boolean };
  receipts: { opened?: string; accepted?: string };
  problem?: string;
};

const short = (id: string) => id.split(".")[0];

/** The box where the guardian tells the agent what to buy, plus every negotiation so far. */
export function AskAgent({ company, cap, version, onDone }: { company: string; cap: number; version: unknown; onDone(): void }) {
  const [want, setWant] = useState("");
  const [max, setMax] = useState(cap);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState<Negotiation[]>([]);

  const load = useCallback(
    () =>
      api<{ negotiations: Negotiation[] }>(`/api/companies/${company}/negotiations`)
        .then((r) => setList(r.negotiations))
        .catch((e) => setError(e.message)),
    [company],
  );
  // Reloads whenever the dashboard does, so an approved deal gets accepted and shows up.
  useEffect(() => void load(), [load, version]);

  async function ask() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/companies/${company}/negotiate`, { want, max });
      setWant("");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-10">
      <h2 className="font-display text-2xl font-bold">Ask your agent</h2>
      <p className="mt-1 max-w-prose text-muted">Say what you need. Your agent finds a business, bargains with its agent in private, and locks the money until delivery.</p>
      <form
        className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <input
          value={want}
          onChange={(e) => setWant(e.target.value)}
          placeholder="500 compostable cups, delivered this week"
          aria-label="What you need"
          className="rounded-lg border border-rule bg-card px-4 py-3 outline-none focus:border-ink"
        />
        <label className="flex items-center gap-2 rounded-lg border border-rule bg-card px-3">
          <span className="text-sm text-muted">Up to</span>
          <input type="number" min={0.1} step={0.1} value={max} onChange={(e) => setMax(Number(e.target.value))} className="w-16 bg-transparent py-3 outline-none" aria-label="Most you'll pay, in NEAR" />
          NEAR
        </label>
        <Button disabled={busy || want.trim().length < 3 || !(max > 0)}>{busy ? "Negotiating… about 30s" : "Ask your agent"}</Button>
      </form>
      {max > cap && <p className="mt-2 text-sm text-muted">Above your {cap} NEAR deal limit, so you&apos;ll be asked to OK it.</p>}
      <Problem text={error} />
      {list.length > 0 && (
        <ul className="mt-6 space-y-3">
          {list.map((n, i) => (
            <Summary key={n.id} n={n} company={company} open={i === 0} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** One negotiation: outcome, the privacy proof, the back-and-forth, receipts. */
function Summary({ n, company, open }: { n: Negotiation; company: string; open: boolean }) {
  const buying = n.buyer === company;
  const other = short(buying ? n.seller : n.buyer);
  const t = n.terms;
  // The agents can agree and the deal still not open (too small, no money): say both, not just "no deal".
  const agreedOnly = n.turns.at(-1)?.offer.action === "accept" && (n.status === "no_deal" || n.status === "failed");
  const headline =
    t && n.status === "opened"
      ? `${buying ? "Bought" : "Sold"} ${t.quantity} × ${t.item} ${buying ? "from" : "to"} ${other} for ${t.price_near} NEAR`
      : t && n.status === "waiting"
        ? `${t.quantity} × ${t.item} from ${other} for ${t.price_near} NEAR is over your limit. OK it above.`
        : agreedOnly
          ? `Agreed with ${other}, but no money was locked`
          : `No deal with ${other}`;
  return (
    <li className={`rounded-sm border px-4 py-3 ${n.status === "waiting" ? "border-ink bg-wash" : "border-rule bg-card"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">{headline}</p>
          <p className="text-sm text-muted">
            {buying ? `You asked: "${n.request}"` : `${other}'s agent asked to buy`}
            {t && ` · delivery in ${t.delivery_days} days`}
          </p>
          {n.problem && <p className="mt-1 text-sm text-muted">{n.problem}</p>}
        </div>
        <Badge proof={n.proof} />
      </div>
      <details className="mt-2 text-sm" open={open}>
        <summary className="cursor-pointer text-muted underline-offset-4 hover:underline">Read the negotiation ({n.turns.length} moves)</summary>
        <Chat turns={n.turns} mine={buying ? "buyer" : "seller"} other={other} />
      </details>
      {(n.receipts.opened || n.receipts.accepted) && (
        <p className="mt-2 flex gap-4">
          {n.receipts.opened && <Receipt hash={n.receipts.opened} label="Money locked" />}
          {n.receipts.accepted && <Receipt hash={n.receipts.accepted} label="Seller agreed" />}
          {n.status === "opened" && n.proof.verified && (
            <ShareOnX text={`My AI agent just closed a deal with ${other}'s agent in ${n.turns.length} moves. Negotiated privately in sealed hardware, money held on @NEARProtocol until delivery.`} path={`/b/${short(company)}`} />
          )}
        </p>
      )}
    </li>
  );
}

/** The negotiation as a chat: your agent on the right, theirs on the left, each move's terms under its message. */
export function Chat({ turns, mine, other }: { turns: Negotiation["turns"]; mine: "buyer" | "seller"; other: string }) {
  return (
    // Long talks scroll inside the box; tabIndex lets keyboard users scroll it too.
    <ol tabIndex={0} className="mt-3 max-h-[28rem] space-y-3 overflow-y-auto overscroll-contain rounded-sm bg-surface p-3 outline-none focus-visible:ring-2 focus-visible:ring-ink" aria-label="The negotiation">
      {turns.map(({ side, offer }, i) => {
        const me = side === mine;
        const terms =
          offer.action === "accept"
            ? `Accepted ${turns[i - 1]?.offer.price_near ?? ""} NEAR`
            : offer.action === "walk_away"
              ? "Walked away"
              : `${offer.quantity} × ${offer.item} · ${offer.price_near} NEAR · ${offer.delivery_days} ${offer.delivery_days === 1 ? "day" : "days"}`;
        return (
          <li key={i} className={`flex flex-col ${me ? "items-end" : "items-start"}`}>
            <span className="mb-1 px-1 text-xs text-muted">{me ? "Your agent" : `${other}'s agent`}</span>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2 ${me ? "rounded-br-sm bg-ink text-white" : "rounded-bl-sm border border-rule bg-card"} ${offer.action === "accept" ? "ring-2 ring-chart" : ""}`}
            >
              {offer.note && <p className="leading-snug">{offer.note}</p>}
              <p className={`text-xs font-medium ${offer.note ? "mt-1" : ""} ${me ? "text-ash" : "text-muted"}`}>{terms}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Shown only when every check passed; the details say exactly what was checked. */
export function Badge({ proof }: { proof: Negotiation["proof"] }) {
  return (
    <details className="text-sm">
      <summary className={`cursor-pointer list-none rounded-sm px-3 py-1 ${proof.verified ? "bg-ink text-xs font-medium uppercase text-white" : "border border-rule text-xs font-medium uppercase text-muted"}`}>
        {proof.verified ? "Verified private" : "Not verified"}
      </summary>
      <ul className="mt-2 max-w-xs space-y-1 text-muted">
        <li>{proof.gpu ? "✓" : "✗"} NVIDIA confirmed the AI ran on sealed hardware, checked just now</li>
        <li>{proof.bound ? "✓" : "✗"} That hardware holds the key that signs the AI&apos;s replies</li>
        <li>
          {proof.signed === proof.replies && proof.replies > 0 ? "✓" : "✗"} {proof.signed} of {proof.replies} replies signed inside it
        </li>
        <li>
          Model: {proof.model}. Check the Intel side yourself at{" "}
          <a href="https://proof.t16z.com" target="_blank" rel="noreferrer" className="underline underline-offset-4">
            proof.t16z.com
          </a>
          .
        </li>
      </ul>
    </details>
  );
}

/** The private notes the agent sells by: what, prices, lowest prices. Only this business's agent reads them. */
export function AgentBrief({ company }: { company: string }) {
  const [text, setText] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => void api<{ text: string }>(`/api/companies/${company}/brief`).then((r) => setText(r.text)), [company]);
  if (text === null) return null;
  return (
    <div className="mt-6">
      <label className="block">
        <span className="font-medium">What your agent sells (private)</span>
        <span className="block text-sm text-muted">Products, prices and your lowest prices. Other businesses never see this.</span>
        <textarea
          value={text}
          onChange={(e) => (setText(e.target.value), setSaved(false))}
          rows={3}
          placeholder="Compostable cups, 0.004 NEAR each; lowest 0.003 for 300 or more."
          className="mt-2 w-full rounded-lg border border-rule bg-card px-4 py-3 outline-none focus:border-ink"
        />
      </label>
      <Button variant="plain" className="mt-2" onClick={() => void api(`/api/companies/${company}/brief`, { text }).then(() => setSaved(true))}>
        {saved ? "Saved" : "Save"}
      </Button>
    </div>
  );
}
