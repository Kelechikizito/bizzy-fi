"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AgentBrief, AskAgent } from "@/components/agent";
import { ConnectAi } from "@/components/connect-ai";
import { Connections } from "@/components/connections";
import { DirectDeal } from "@/components/direct-deal";
import { CountUp } from "@/components/motion";
import { ProfileContacts } from "@/components/profile-contacts";
import { ShareOnX } from "@/components/share";
import { Treasury } from "@/components/treasury";
import { Button, Frame, Problem, Receipt } from "@/components/ui";
import { WorldIdButton } from "@/components/world-id";
import { REGISTRY_ID } from "@/lib/near/contracts";
import { findCompany, loadDashboard, toNear, toYocto } from "@/lib/near/read";
import { api, type Call, useSession } from "@/lib/wallet";

type Data = Awaited<ReturnType<typeof loadDashboard>>;

const STATUS: Record<string, string> = {
  Proposed: "Waiting for the seller",
  Accepted: "Seller is working on it",
  Delivered: "Delivered, you're reviewing",
  Released: "Paid",
  Refunded: "Refunded",
  Disputed: "In dispute",
  Split: "Settled by a split",
};
const LIMITS = [
  { label: "Small", perDeal: 1, perWeek: 3 },
  { label: "Medium", perDeal: 2, perWeek: 5 },
  { label: "Large", perDeal: 5, perWeek: 20 },
];
const ONE = "1 yocto";
const MAX_CANCELS = 3;

export default function Dashboard() {
  const { account, send } = useSession();
  const [id, setId] = useState<string | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ hash: string; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0);

  const reload = useCallback(async (company: string) => setData(await loadDashboard(company)), []);

  useEffect(() => {
    if (account === null) location.replace("/login");
    if (!account) return;
    void findCompany(account).then((c) => (c ? (setId(c), reload(c)) : location.replace("/start")));
  }, [account, reload]);

  // A business that never got its agent key goes back to finish sign-up.
  useEffect(() => {
    if (data && data.status === "Active" && !data.agentKey) location.replace("/start");
  }, [data]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  /** Runs one signed action, then shows its receipt and fresh numbers. */
  async function act(label: string, calls: Call[], transfer?: string, receiver = id!) {
    setBusy(label);
    setError(null);
    try {
      const { hash } = await send(receiver, calls, transfer);
      setReceipt({ hash, label });
      await reload(id!);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (!id || !data) {
    return (
      <Frame wide>
        <p className="text-muted">Loading your business…</p>
      </Frame>
    );
  }

  const frozen = data.status === "Suspended";
  const waitMs = now ? Math.max(0, data.unfreezeAt - now) : 0;
  const spent = Number(toNear(data.spent).replace(/,/g, ""));
  const cap = Number(toNear(data.limits.period_cap).replace(/,/g, ""));
  const toCancel = data.deals.filter(([, d]) => d.buyer === id && d.status === "Proposed").slice(0, MAX_CANCELS);

  const freeze = () =>
    act("Agent frozen", [
      { method: "freeze", deposit: ONE },
      ...toCancel.map(([deal]) => ({ method: "deal_action", args: { method: "cancel", args: { id: deal } }, deposit: ONE, gas: "70 Tgas" })),
    ]);
  const unfreeze = async () => {
    const { public_key } = await api<{ public_key: string }>(`/api/companies/${id}/agent-key`);
    await act("Agent back on", [
      { method: "unfreeze", deposit: ONE },
      { method: "set_agent_key", args: { public_key }, deposit: ONE },
    ]);
  };

  return (
    <Frame wide>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-bold">{id.split(".")[0]}</h1>
          <p className="mt-1 text-muted">{data.company.about}</p>
          <p className="mt-2 flex flex-wrap gap-4 text-sm">
            <Link href={`/b/${id.split(".")[0]}`} className="text-muted underline underline-offset-4 hover:text-ink">
              Your public profile
            </Link>
            <ShareOnX text={`My business ${id.split(".")[0]} now has an AI agent that buys for it, with the money held on @NEARProtocol until delivery.`} path={`/b/${id.split(".")[0]}`} />
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="rounded-sm border border-rule px-3 py-1">Score {data.score}</span>
          {data.company.human ? (
            <span className="rounded-sm bg-ink px-2 py-1 text-xs font-medium uppercase text-white">Verified human</span>
          ) : (
            <WorldIdButton company={id} onDone={() => void reload(id)} />
          )}
        </div>
      </div>

      {/* The breaker: the one control that always stops the agent. */}
      <section
        className={`mt-8 flex flex-wrap items-center justify-between gap-6 rounded-sm border p-6 ${frozen ? "border-stop bg-stop/5" : "border-ink bg-card"}`}
      >
        <div>
          <p className="font-display text-2xl font-bold">{frozen ? "Agent is frozen" : "Agent is on"}</p>
          <p className="mt-1 text-muted">
            {frozen
              ? waitMs > 0
                ? `You can turn it back on in ${Math.floor(waitMs / 60000)}m ${Math.floor(waitMs / 1000) % 60}s.`
                : "It can't spend anything. Turn it back on when you're ready."
              : "It can make deals within your limits. Freezing removes its key at once."}
          </p>
        </div>
        {frozen ? (
          <Button onClick={() => void unfreeze()} disabled={!!busy || waitMs > 0}>
            {busy ?? "Turn agent back on"}
          </Button>
        ) : (
          <button
            onClick={() => void freeze()}
            disabled={!!busy}
            className="group flex items-center gap-4 rounded-sm bg-stop px-6 py-4 text-lg font-bold text-white shadow-sm transition-colors hover:bg-stop/90 disabled:opacity-50"
          >
            <span className="relative block h-9 w-5 rounded-sm bg-white/25" aria-hidden>
              <span className="absolute left-0.5 top-0.5 size-4 rounded-sm bg-white transition-transform group-active:translate-y-4" />
            </span>
            {busy ?? "Freeze agent"}
          </button>
        )}
      </section>
      {receipt && (
        <p className="mt-3 text-sm">
          {receipt.label}. <Receipt hash={receipt.hash} />
        </p>
      )}
      <Problem text={error} />

      <section className="mt-10 grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="text-muted">Money your agent can use</h2>
          <p className="mt-1 font-display text-4xl font-bold tabular-nums">
            <CountUp value={`${toNear(data.available)} NEAR`} />
          </p>
        </div>
        <div>
          <h2 className="text-muted">Spent this week</h2>
          <p className="mt-1 font-display text-4xl font-bold">
            <CountUp value={toNear(data.spent)} /> <span className="text-xl font-normal text-muted">of {toNear(data.limits.period_cap)} NEAR</span>
          </p>
          <div className="mt-3 h-2 rounded-sm bg-rule">
            <div className="h-2 rounded-sm bg-ink transition-[width] duration-700 ease-out" style={{ width: `${Math.min(100, (spent / (cap || 1)) * 100)}%` }} />
          </div>
          <p className="mt-2 text-sm text-muted">
            Up to {toNear(data.limits.per_deal_cap)} NEAR a deal. {data.limits.allowlist_only ? "Only businesses you approve." : "Any business."}
          </p>
        </div>
      </section>

      <AskAgent company={id} cap={Number(toNear(data.limits.per_deal_cap).replace(/,/g, ""))} version={data} onDone={() => void reload(id)} />

      <DirectDeal company={id} onDone={() => void reload(id)} />

      <ConnectAi company={id} />

      <Treasury company={id} account={account!} busy={!!busy} act={act} />

      {data.approvals.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-2xl font-bold">Waiting for your OK</h2>
          <ul className="mt-4 space-y-3">
            {data.approvals.map(([approval, a]) => (
              <li key={approval} className="flex flex-wrap items-center justify-between gap-4 rounded-sm border border-ink bg-wash px-4 py-3">
                <span>
                  {toNear(a.amount)} NEAR to <span className="font-medium">{a.deal.seller}</span>, over your limit
                </span>
                <span className="flex gap-2">
                  <Button variant="plain" disabled={!!busy} onClick={() => void act("Deal rejected", [{ method: "reject", args: { id: approval }, deposit: ONE }])}>
                    Reject
                  </Button>
                  <Button
                    disabled={!!busy}
                    onClick={() => void act("Deal approved", [{ method: "approve", args: { id: approval }, deposit: ONE, gas: "100 Tgas" }])}
                  >
                    Approve
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10">
        <h2 className="font-display text-2xl font-bold">Deals</h2>
        {data.deals.length === 0 ? (
          <p className="mt-3 text-muted">No deals yet. Your agent will list them here as it makes them.</p>
        ) : (
          <ul className="mt-4 divide-y divide-rule border-y border-rule">
            {data.deals.map(([deal, d]) => (
              <li key={deal}>
                <Link href={`/deals/${deal}`} className="flex flex-wrap justify-between gap-2 py-3 hover:bg-card">
                  <span>
                    {d.buyer === id ? `Buying from ${d.seller}` : `Selling to ${d.buyer}`}
                    <span className="ml-2 font-medium">{toNear(d.amount)} NEAR</span>
                  </span>
                  <span className="text-muted underline-offset-4">{d.status === "Proposed" && d.seller === id ? "Waiting for you to accept" : (STATUS[d.status] ?? d.status)} ›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Settings
        busy={!!busy}
        current={data.limits}
        onLimits={(i) =>
          void act("Limits changed", [
            {
              method: "set_limits",
              args: { limits: { ...data.limits, per_deal_cap: toYocto(LIMITS[i].perDeal), period_cap: toYocto(LIMITS[i].perWeek) } },
              deposit: ONE,
            },
          ])
        }
        onAllowlist={(only) => void act("Rule changed", [{ method: "set_limits", args: { limits: { ...data.limits, allowlist_only: only } }, deposit: ONE }])}
        onAdd={(n) => void act("Money added", [], `${toYocto(n)} yocto`)}
        onWithdraw={(n) => void act("Money taken out", [{ method: "withdraw", args: { amount: toYocto(n), to: account }, deposit: ONE, gas: "50 Tgas" }])}
      />
      <Connections company={id} busy={!!busy} act={act} version={data} />
      <AgentBrief company={id} />
      <ProfileContacts company={id} />
      <p className="mt-10 text-sm text-muted">
        Your business address is {id}. Your score comes from the {REGISTRY_ID} directory.
      </p>
    </Frame>
  );
}

function Settings(props: {
  busy: boolean;
  current: { per_deal_cap: string; allowlist_only: boolean };
  onLimits(i: number): void;
  onAllowlist(only: boolean): void;
  onAdd(n: number): void;
  onWithdraw(n: number): void;
}) {
  const [amount, setAmount] = useState(0.5);
  return (
    <section className="mt-10">
      <h2 className="font-display text-2xl font-bold">Settings</h2>
      <div className="mt-4 flex flex-wrap gap-2">
        {LIMITS.map((l, i) => (
          <Button
            key={l.label}
            variant="plain"
            disabled={props.busy || props.current.per_deal_cap === toYocto(l.perDeal)}
            onClick={() => props.onLimits(i)}
          >
            {l.label}: {l.perDeal} a deal, {l.perWeek} a week
          </Button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-muted">Who your agent may pay:</span>
        {[false, true].map((only) => (
          <Button key={String(only)} variant="plain" disabled={props.busy || props.current.allowlist_only === only} onClick={() => props.onAllowlist(only)}>
            {only ? "Only businesses I approve" : "Any business"}
          </Button>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 rounded-lg border border-rule bg-card px-3">
          <input
            type="number"
            min={0.1}
            step={0.1}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="w-20 bg-transparent py-3 outline-none"
            aria-label="Amount in NEAR"
          />
          NEAR
        </label>
        <Button variant="plain" disabled={props.busy || !(amount > 0)} onClick={() => props.onAdd(amount)}>
          Add money
        </Button>
        <Button variant="plain" disabled={props.busy || !(amount > 0)} onClick={() => props.onWithdraw(amount)}>
          Take money out
        </Button>
      </div>
    </section>
  );
}
