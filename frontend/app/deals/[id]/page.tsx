"use client";
// One deal from start to finish: where it is, what was agreed in private, and the next move for your side.
import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Badge, Chat } from "@/components/agent";
import { Button, Frame, Problem, Receipt } from "@/components/ui";
import { DISPUTE_WINDOW_MS, REVIEW_WINDOW_MS } from "@/lib/near/contracts";
import { toNear, toYocto } from "@/lib/near/read";
import { api, useSession } from "@/lib/wallet";
import type { openDeal } from "@/lib/server/deals";

type View = Awaited<ReturnType<typeof openDeal>>;

const STEPS = ["Agreed in private", "Money locked", "Seller accepted", "Delivered", "Seller paid"];
/** How far along the main path each status got. */
const REACHED: Record<string, number> = { Proposed: 1, Accepted: 2, Delivered: 3, Released: 4, Refunded: 1 };
const ENDING: Record<string, string> = { Refunded: "Money back to the buyer", Disputed: "In dispute", Split: "Settled by a split" };
const SETTLED: Record<string, string> = {
  refund_expired: "The delivery deadline passed, so the buyer got the money back.",
  release_due: "The review time ran out, so the seller was paid.",
  refund_on_timeout: "The dispute time ran out, so it was settled by the rules.",
  mark_delivered: "The seller marked it delivered.",
  accept_deal: "The seller accepted.",
};

const short = (id: string) => id.split(".")[0];
const ms = (ns: string) => Number(BigInt(ns) / 1_000_000n);
const when = (t: number) => new Date(t).toLocaleString("en", { weekday: "short", hour: "numeric", minute: "2-digit", day: "numeric", month: "short" });
const sum = (amounts: string[]) => amounts.reduce((a, b) => a + BigInt(b), 0n).toString();

/** The deal number comes from the URL, so it renders inside Suspense. */
export default function Page() {
  return (
    <Suspense>
      <DealPage />
    </Suspense>
  );
}

function DealPage() {
  const { id } = useParams<{ id: string }>();
  const { account, send } = useSession();
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ hash: string; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState(0);
  const [now, setNow] = useState(0);

  const fetchView = useCallback((body = {}) => api<View>(`/api/deals/${id}`, body), [id]);
  const show = (v: View) => {
    setView(v);
    setNow(Date.now());
    if (v.settled) setReceipt({ hash: v.settled.tx, label: SETTLED[v.settled.method] });
  };
  const load = (body = {}) => fetchView(body).then(show);

  useEffect(() => {
    if (account === null) location.replace("/login");
    if (account) fetchView().then(show, (e) => setError(e.message));
  }, [account, fetchView]);

  /** Runs one escrow move through your company's contract, then reloads. */
  async function move(label: string, method: string, args: object = {}) {
    setBusy(label);
    setError(null);
    try {
      const { hash } = await send(view!.company, [{ method: "deal_action", args: { method, args: { id, ...args } }, deposit: "1 yocto", gas: "100 Tgas" }]);
      setReceipt({ hash, label });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function demoDeliver() {
    setBusy("Delivering…");
    setError(null);
    await load({ demoDeliver: true }).catch((e) => setError(e.message));
    setBusy(null);
  }

  if (!view) {
    return (
      <Frame wide>
        <p className="text-muted">{error ?? "Loading the deal…"}</p>
      </Frame>
    );
  }

  const { deal, side, terms, negotiation } = view;
  const buying = side === "buyer";
  const other = short(buying ? deal.seller : deal.buyer);
  const left = sum(deal.milestones.slice(deal.paid));
  const changed = ms(deal.updated_at);
  const reviewEnds = changed + REVIEW_WINDOW_MS;
  const inReview = deal.status === "Delivered" && now < reviewEnds;
  const reached = deal.status in REACHED ? REACHED[deal.status] : deal.disputed_after_delivery ? 3 : 2;
  const theirOffer = deal.split_offer && deal.split_offer[0] !== view.company ? deal.split_offer[1] : null;
  const myOffer = deal.split_offer && deal.split_offer[0] === view.company ? deal.split_offer[1] : null;

  const next: Record<string, string> = {
    Proposed: buying
      ? `The money is locked. Waiting for ${other} to accept: send them this page's link. You can still cancel and get the money back.`
      : `${other} locked ${toNear(deal.amount)} NEAR for these terms. Accept to start; you're paid once they confirm delivery.`,
    Accepted: `${buying ? other : "You"} must deliver by ${when(ms(deal.deliver_by))}. If not, the buyer gets the money back.`,
    Delivered: inReview
      ? `${buying ? "You have" : `${other} has`} until ${when(reviewEnds)} to check it. If nothing happens, the seller is paid then.`
      : "The review time is over. The seller gets paid next time this page opens.",
    Released: `${toNear(deal.amount)} NEAR went to ${buying ? other : "you"}. Both businesses' scores went up.`,
    Refunded: `${toNear(left === "0" ? deal.amount : left)} NEAR went back to ${buying ? "you" : other}.`,
    Disputed: `The money stays locked until you both agree a split, or until ${when(changed + DISPUTE_WINDOW_MS)}. Then ${
      deal.disputed_after_delivery ? "it splits 50/50 and both scores drop" : "the buyer gets the money back"
    }.`,
    Split: "The money was shared out as both sides agreed.",
  };

  return (
    <Frame wide>
      <Link href="/dashboard" className="text-sm text-muted underline-offset-4 hover:underline">
        Back to your dashboard
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold sm:text-4xl">
            {terms ? `${terms.quantity} × ${terms.item}` : `Deal ${id}`}
          </h1>
          <p className="mt-1 text-muted">
            {buying ? `Buying from ${other}` : `Selling to ${other}`} for <span className="font-medium text-ink">{toNear(deal.amount)} NEAR</span>
          </p>
        </div>
        {negotiation && <Badge proof={negotiation.proof} />}
      </div>

      <ol className="mt-8 grid gap-2 sm:grid-cols-5">
        {STEPS.map((step, i) => (
          <li key={step} className={`border-t-4 pt-2 text-sm ${i <= reached ? "border-ink font-medium" : "border-rule text-muted"}`}>
            {step}
          </li>
        ))}
      </ol>
      {ENDING[deal.status] && <p className="mt-3 inline-block rounded-sm bg-wash px-3 py-1 text-sm">{ENDING[deal.status]}</p>}

      <section className="mt-8 rounded-2xl border-2 border-ink bg-card p-6">
        <p className="max-w-prose">{next[deal.status]}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {buying && deal.status === "Proposed" && (
            <Button variant="plain" disabled={!!busy} onClick={() => void move("Deal cancelled", "cancel")}>
              Cancel and get money back
            </Button>
          )}
          {!buying && deal.status === "Proposed" && (
            <Button disabled={!!busy} onClick={() => void move("Deal accepted", "accept_deal", { terms_hash: deal.terms_hash })}>
              Accept these terms
            </Button>
          )}
          {!buying && deal.status === "Accepted" && (
            <Button disabled={!!busy} onClick={() => void move("Marked delivered", "mark_delivered")}>
              Mark delivered
            </Button>
          )}
          {buying && deal.status === "Accepted" && view.demoSeller && (
            <Button disabled={!!busy} onClick={() => void demoDeliver()}>
              Have {other} deliver now (demo)
            </Button>
          )}
          {buying && inReview && (
            <Button disabled={!!busy} onClick={() => void move("Seller paid", "confirm")}>
              It arrived: pay {other}
            </Button>
          )}
          {((buying && deal.status === "Accepted") || inReview) && (
            <Button variant="plain" disabled={!!busy} onClick={() => void move("Dispute opened", "dispute")}>
              Report a problem
            </Button>
          )}
        </div>

        {deal.status === "Disputed" && (
          <div className="mt-4 space-y-3">
            {theirOffer && (
              <p className="flex flex-wrap items-center gap-3">
                {other} offers {toNear(theirOffer)} NEAR to the seller and {toNear((BigInt(left) - BigInt(theirOffer)).toString())} NEAR back to the buyer.
                <Button disabled={!!busy} onClick={() => void move("Split agreed", "propose_split", { seller_share: theirOffer })}>
                  Agree
                </Button>
              </p>
            )}
            {myOffer && <p className="text-muted">You offered {toNear(myOffer)} NEAR to the seller. Waiting for {other}.</p>}
            <div className="flex flex-wrap items-center gap-2">
              <span>Offer the seller</span>
              <label className="flex items-center gap-2 rounded-lg border border-rule bg-paper px-3">
                <input
                  type="number"
                  min={0}
                  max={Number(toNear(left))}
                  step={0.01}
                  value={share}
                  onChange={(e) => setShare(Number(e.target.value))}
                  className="w-20 bg-transparent py-3 outline-none"
                  aria-label="Seller's share in NEAR"
                />
                of {toNear(left)} NEAR
              </label>
              <Button variant="plain" disabled={!!busy || !(share >= 0)} onClick={() => void move("Split offered", "propose_split", { seller_share: toYocto(share) })}>
                Offer split
              </Button>
            </div>
          </div>
        )}
        {busy && <p className="mt-3 text-sm text-muted">{busy}</p>}
        {receipt && (
          <p className="mt-3 text-sm">
            {receipt.label} <Receipt hash={receipt.hash} />
          </p>
        )}
        <Problem text={error} />
      </section>

      <section className="mt-10 grid gap-8 sm:grid-cols-2">
        <div>
          <h2 className="font-display text-xl font-bold">What was agreed</h2>
          {terms ? (
            <dl className="mt-3 space-y-1 text-sm">
              <div>Item: {terms.item}</div>
              <div>Quantity: {terms.quantity}</div>
              <div>Price: {terms.price_near} NEAR</div>
              <div>Deliver by: {when(ms(deal.deliver_by))}</div>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-muted">These terms were agreed outside Bizzy-Fy.</p>
          )}
          <p className="mt-3 text-sm text-muted">
            Only you and {other} can read these. The chain holds just their fingerprint: <span className="break-all">{deal.terms_hash}</span>
          </p>
        </div>
        {negotiation && (
          <div>
            <h2 className="font-display text-xl font-bold">How the agents got there</h2>
            <p className="mt-1 text-sm text-muted">Asked: &quot;{negotiation.request}&quot;</p>
            <div className="text-sm">
              <Chat turns={negotiation.turns} mine={buying ? "buyer" : "seller"} other={other} />
            </div>
          </div>
        )}
      </section>
    </Frame>
  );
}
