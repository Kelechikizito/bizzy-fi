"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { AgentBrief, AskAgent } from "@/components/agent";
import { ConnectAi } from "@/components/connect-ai";
import { Connections } from "@/components/connections";
import { DirectDeal } from "@/components/direct-deal";
import { CountUp } from "@/components/motion";
import { ProfileContacts } from "@/components/profile-contacts";
import { Avatar, ProfilePhoto, useAvatar } from "@/components/profile-photo";
import { ShareOnX } from "@/components/share";
import { Treasury } from "@/components/treasury";
import { Logo } from "@/components/logo";
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

/** The sidebar tabs, in order. */
const TABS = [
  ["home", "Home"],
  ["buy", "Buy"],
  ["deals", "Deals"],
  ["approvals", "Waiting for you"],
  ["money", "Money and rules"],
  ["partners", "Partners"],
  ["treasury", "Team treasury"],
  ["ai", "Connect your AI"],
  ["profile", "Profile"],
] as const;
type Tab = (typeof TABS)[number][0];

const ABOUT: Record<Tab, string> = {
  home: "",
  buy: "Ask your agent to find a seller and haggle, or pay a business you already know.",
  deals:
    "Everything your agent bought or sold. Open one to see its steps and receipts.",
  approvals:
    "Deals over your limit wait here until you approve or reject them.",
  money: "Add or take out money, and set how much your agent may spend.",
  partners: "Businesses you approve, and invite links to bring new ones in.",
  treasury:
    "A shared pot your team approves together, separate from your agent's money.",
  ai: "Let Claude, Cursor or another AI use your agent, with the same limits.",
  profile: "What other businesses see, and how your agent describes you.",
};

/** Good morning, afternoon, evening or night, from the local hour. */
const greet = (hour: number) =>
  hour < 5 || hour >= 22
    ? "Good night"
    : hour < 12
      ? "Good morning"
      : hour < 17
        ? "Good afternoon"
        : "Good evening";

const LINE = {
  fill: "none",
  strokeWidth: 2.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** Shortcut cards on Home, each with a small drawing in the logo's style. */
const EXPLORE: { tab: Tab; title: string; line: string; art: ReactNode }[] = [
  {
    tab: "buy",
    title: "Ask your agent to buy",
    line: "Say what you need in a sentence. It haggles in private.",
    art: (
      <svg viewBox="0 0 240 112" className="size-full">
        <path d="M24 30 L120 50 L216 62" stroke="#fff" {...LINE} />
        <path d="M24 92 L120 74 L216 62" stroke="#4a6cf7" {...LINE} />
        <circle cx="216" cy="62" r="5" fill="#fff" />
      </svg>
    ),
  },
  {
    tab: "ai",
    title: "Bring your own AI",
    line: "Connect Claude or Cursor over MCP and just ask it to buy.",
    art: (
      <svg viewBox="0 0 240 112" className="size-full">
        <rect
          x="40"
          y="34"
          width="56"
          height="44"
          rx="2"
          stroke="#fff"
          {...LINE}
        />
        <rect
          x="144"
          y="34"
          width="56"
          height="44"
          rx="2"
          stroke="#4a6cf7"
          {...LINE}
        />
        <path
          d="M96 56 H144"
          stroke="#a0a0a0"
          strokeDasharray="4 6"
          {...LINE}
        />
      </svg>
    ),
  },
  {
    tab: "partners",
    title: "Invite a partner",
    line: "Share a link so your suppliers can sell to your agent.",
    art: (
      <svg viewBox="0 0 240 112" className="size-full">
        <circle cx="96" cy="56" r="24" stroke="#fff" {...LINE} />
        <circle cx="144" cy="56" r="24" stroke="#4a6cf7" {...LINE} />
      </svg>
    ),
  },
];

export default function Dashboard() {
  const { account, send, signOut } = useSession();
  const router = useRouter();
  // Opens the tab named in the link (#deals); the page shows "Loading" until data arrives, so server and browser still match.
  const [tab, setTab] = useState<Tab>(() => {
    const fromHash =
      typeof location === "undefined" ? "" : location.hash.slice(1);
    return TABS.some(([key]) => key === fromHash) ? (fromHash as Tab) : "home";
  });
  const [id, setId] = useState<string | null>(null);
  const [avatar, setAvatar] = useAvatar(id);
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{
    hash: string;
    label: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0);

  const reload = useCallback(
    async (company: string) => setData(await loadDashboard(company)),
    [],
  );

  useEffect(() => {
    if (account === null) location.replace("/login");
    if (!account) return;
    void findCompany(account).then((c) =>
      c ? (setId(c), reload(c)) : location.replace("/start"),
    );
  }, [account, reload]);

  // A business that never got its agent key goes back to finish sign-up.
  useEffect(() => {
    if (data && data.status === "Active" && !data.agentKey)
      location.replace("/start");
  }, [data]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  /** Switches tab and keeps it in the address bar. */
  const go = (next: Tab) => {
    setTab(next);
    history.replaceState(
      null,
      "",
      next === "home" ? location.pathname : `#${next}`,
    );
    scrollTo({ top: 0 });
  };

  /** Runs one signed action, then shows its receipt and fresh numbers. */
  async function act(
    label: string,
    calls: Call[],
    transfer?: string,
    receiver = id!,
  ) {
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
  const toCancel = data.deals
    .filter(([, d]) => d.buyer === id && d.status === "Proposed")
    .slice(0, MAX_CANCELS);

  const freeze = () =>
    act("Agent frozen", [
      { method: "freeze", deposit: ONE },
      ...toCancel.map(([deal]) => ({
        method: "deal_action",
        args: { method: "cancel", args: { id: deal } },
        deposit: ONE,
        gas: "70 Tgas",
      })),
    ]);
  const unfreeze = async () => {
    const { public_key } = await api<{ public_key: string }>(
      `/api/companies/${id}/agent-key`,
    );
    await act("Agent back on", [
      { method: "unfreeze", deposit: ONE },
      { method: "set_agent_key", args: { public_key }, deposit: ONE },
    ]);
  };

  const name = id.split(".")[0];
  const buying = data.deals.filter(
    ([, d]) =>
      d.buyer === id && !["Released", "Refunded", "Split"].includes(d.status),
  ).length;
  const count: Partial<Record<Tab, number>> = {
    deals: data.deals.length,
    approvals: data.approvals.length,
  };

  const dealList = (deals: Data["deals"]) =>
    deals.length === 0 ? (
      <p className="mt-3 text-muted">
        No deals yet. Your agent will list them here as it makes them.
      </p>
    ) : (
      <ul className="mt-4 divide-y divide-rule border-y border-rule">
        {deals.map(([deal, d]) => (
          <li key={deal}>
            <Link
              href={`/deals/${deal}`}
              className="flex flex-wrap justify-between gap-2 px-2 py-3 hover:bg-paper"
            >
              <span>
                {d.buyer === id
                  ? `Buying from ${d.seller}`
                  : `Selling to ${d.buyer}`}
                <span className="ml-2 font-medium">
                  {toNear(d.amount)} NEAR
                </span>
              </span>
              <span className="text-muted">
                {d.status === "Proposed" && d.seller === id
                  ? "Waiting for you to accept"
                  : (STATUS[d.status] ?? d.status)}{" "}
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    );

  return (
    <div className="min-h-screen bg-band lg:flex">
      <aside className="flex flex-col gap-4 p-4 text-white lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:shrink-0 lg:overflow-y-auto">
        <Link
          href="/"
          className="flex items-center gap-2 px-1 text-xl font-bold"
        >
          <Logo className="rounded-sm ring-1 ring-graphite" />
          bizzy-fy
        </Link>

        <div className="rounded-sm border border-graphite p-4">
          <p className="text-sm text-fog">Money your agent can use</p>
          <p className="mt-1 font-display text-3xl font-bold tabular-nums">
            <CountUp value={`${toNear(data.available)} NEAR`} />
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm font-medium">
            <button
              onClick={() => go("buy")}
              className="rounded-sm bg-white py-2 text-ink hover:bg-ash"
            >
              Buy
            </button>
            <button
              onClick={() => go("money")}
              className="rounded-sm bg-graphite py-2 hover:bg-slate"
            >
              Add money
            </button>
          </div>
        </div>

        <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 lg:mx-0 lg:flex-col lg:px-0">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => go(key)}
              aria-current={tab === key ? "page" : undefined}
              className={`flex shrink-0 items-center justify-between gap-3 rounded-sm px-3 py-2.5 text-left text-sm font-medium transition-colors ${tab === key ? "bg-graphite text-white" : "text-ash hover:bg-graphite/50 hover:text-white"}`}
            >
              {label}
              {!!count[key] && (
                <span
                  className={`text-xs ${key === "approvals" ? "rounded-sm bg-wash px-1.5 text-ink" : "text-fog"}`}
                >
                  {count[key]}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* The breaker: the one control that always stops the agent, on every tab. */}
        <div
          className={`mt-auto rounded-sm border p-4 ${frozen ? "border-stop" : "border-graphite"}`}
        >
          <p className="flex items-center gap-2 text-sm font-medium">
            <span
              className={`size-2 rounded-full ${frozen ? "bg-stop" : "bg-chart"}`}
              aria-hidden
            />
            {frozen ? "Agent is frozen" : "Agent is on"}
          </p>
          <p className="mt-1 text-xs text-fog">
            {frozen
              ? waitMs > 0
                ? `Back on possible in ${Math.floor(waitMs / 60000)}m ${Math.floor(waitMs / 1000) % 60}s.`
                : "It can't spend anything."
              : "Freezing removes its key at once."}
          </p>
          {frozen ? (
            <button
              onClick={() => void unfreeze()}
              disabled={!!busy || waitMs > 0}
              className="mt-3 w-full rounded-sm bg-white py-2 text-sm font-medium text-ink hover:bg-ash disabled:opacity-50"
            >
              {busy ?? "Turn agent back on"}
            </button>
          ) : (
            <button
              onClick={() => void freeze()}
              disabled={!!busy}
              className="mt-3 w-full rounded-sm bg-stop py-2 text-sm font-bold text-white hover:bg-stop/90 disabled:opacity-50"
            >
              {busy ?? "Freeze agent"}
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 rounded-sm border border-graphite px-3 py-2.5 text-sm">
          <button
            onClick={() => go("profile")}
            className="flex min-w-0 items-center gap-2.5 hover:text-ash"
            title="Your profile"
          >
            <Avatar company={id} image={avatar} className="size-8 text-sm" />
            <span className="truncate">{name}</span>
          </button>
          <button
            onClick={() => void signOut().then(() => router.push("/"))}
            className="shrink-0 text-fog hover:text-white"
          >
            Sign out
          </button>
        </div>
        <p className="px-1 text-xs text-fog">
          NEAR testnet: every NEAR here is test money.
        </p>
      </aside>

      <main className="min-w-0 flex-1 lg:py-3 lg:pr-3">
        <div className="min-h-full bg-card px-5 py-10 sm:px-10 lg:min-h-[calc(100vh-24px)] lg:rounded-sm lg:px-16 lg:py-14">
          <div className="mx-auto max-w-4xl [&>section:first-of-type]:mt-6">
            {tab === "home" ? (
              <h1 className="font-display text-4xl font-bold">
                {now ? `${greet(new Date(now).getHours())}, ${name}` : " "}
              </h1>
            ) : (
              <>
                <h1 className="font-display text-4xl font-bold">
                  {TABS.find(([key]) => key === tab)![1]}
                </h1>
                <p className="mt-2 text-muted">{ABOUT[tab]}</p>
              </>
            )}
            {receipt && (
              <p className="mt-4 text-sm">
                {receipt.label}. <Receipt hash={receipt.hash} />
              </p>
            )}
            <Problem text={error} />

            {tab === "home" && (
              <>
                <p className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted">
                  <span>Score {data.score}</span>
                  {data.company.human ? (
                    <span className="rounded-sm bg-ink px-2 py-0.5 text-xs font-medium uppercase text-white">
                      Verified human
                    </span>
                  ) : (
                    <WorldIdButton
                      company={id}
                      onDone={() => void reload(id)}
                    />
                  )}
                </p>

                <section className="mt-8 flex flex-wrap items-center justify-between gap-6 rounded-sm bg-band p-6 text-white sm:p-8">
                  <div>
                    <p className="font-display text-2xl font-bold">
                      {frozen
                        ? "Your agent is frozen"
                        : "Tell your agent what to buy"}
                    </p>
                    <p className="mt-2 max-w-md text-sm text-fog">
                      {frozen
                        ? "It can't make deals until you turn it back on from the sidebar."
                        : `It finds a seller, haggles in private and locks the money until delivery. ${buying ? `${buying} deal${buying > 1 ? "s" : ""} in progress.` : ""}`}
                    </p>
                  </div>
                  {!frozen && (
                    <button
                      onClick={() => go("buy")}
                      className="rounded-sm bg-white px-5 py-3 font-medium text-ink hover:bg-ash"
                    >
                      Ask your agent
                    </button>
                  )}
                </section>

                {data.approvals.length > 0 && (
                  <button
                    onClick={() => go("approvals")}
                    className="mt-4 flex w-full items-center justify-between rounded-sm border border-ink bg-wash px-5 py-4 text-left"
                  >
                    <span>
                      <b>{data.approvals.length}</b> deal
                      {data.approvals.length > 1 ? "s are" : " is"} over your
                      limit and waiting for your OK.
                    </span>
                    <span className="font-medium">Review ›</span>
                  </button>
                )}

                <section className="mt-8 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-sm border border-rule p-5">
                    <h2 className="text-sm text-muted">Spent this week</h2>
                    <p className="mt-1 font-display text-3xl font-bold">
                      <CountUp value={toNear(data.spent)} />{" "}
                      <span className="text-lg font-normal text-muted">
                        of {toNear(data.limits.period_cap)} NEAR
                      </span>
                    </p>
                    <div className="mt-3 h-1.5 rounded-sm bg-rule">
                      <div
                        className="h-1.5 rounded-sm bg-chart transition-[width] duration-700 ease-out"
                        style={{
                          width: `${Math.min(100, (spent / (cap || 1)) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="rounded-sm border border-rule p-5">
                    <h2 className="text-sm text-muted">Your rules</h2>
                    <p className="mt-1 font-display text-3xl font-bold">
                      {toNear(data.limits.per_deal_cap)} NEAR a deal
                    </p>
                    <p className="mt-2 text-sm text-muted">
                      {data.limits.allowlist_only
                        ? "Only businesses you approve."
                        : "Any business."}{" "}
                      <button
                        onClick={() => go("money")}
                        className="underline underline-offset-4 hover:text-ink"
                      >
                        Change
                      </button>
                    </p>
                  </div>
                </section>

                <h2 className="mt-12 font-display text-2xl font-bold">
                  Explore
                </h2>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  {EXPLORE.map((e) => (
                    <button
                      key={e.tab}
                      onClick={() => go(e.tab)}
                      className="group overflow-hidden rounded-sm border border-rule text-left transition-shadow hover:shadow-widget"
                    >
                      <span className="block h-28 bg-band">{e.art}</span>
                      <span className="block p-5">
                        <span className="block font-medium">{e.title}</span>
                        <span className="mt-1 block text-sm text-muted">
                          {e.line}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>

                <div className="mt-12 flex items-baseline justify-between">
                  <h2 className="font-display text-2xl font-bold">
                    Recent deals
                  </h2>
                  {data.deals.length > 3 && (
                    <button
                      onClick={() => go("deals")}
                      className="text-sm text-muted underline underline-offset-4 hover:text-ink"
                    >
                      See all {data.deals.length}
                    </button>
                  )}
                </div>
                {dealList(data.deals.slice(0, 3))}
              </>
            )}

            {tab === "buy" && (
              <>
                <AskAgent
                  company={id}
                  cap={Number(
                    toNear(data.limits.per_deal_cap).replace(/,/g, ""),
                  )}
                  version={data}
                  onDone={() => void reload(id)}
                />
                <DirectDeal company={id} onDone={() => void reload(id)} />
              </>
            )}

            {tab === "deals" && dealList(data.deals)}

            {tab === "approvals" && data.approvals.length === 0 && (
              <p className="mt-6 text-muted">
                Nothing waiting. Deals over your limit show up here.
              </p>
            )}

            {tab === "money" && (
              <Settings
                busy={!!busy}
                current={data.limits}
                onLimits={(i) =>
                  void act("Limits changed", [
                    {
                      method: "set_limits",
                      args: {
                        limits: {
                          ...data.limits,
                          per_deal_cap: toYocto(LIMITS[i].perDeal),
                          period_cap: toYocto(LIMITS[i].perWeek),
                        },
                      },
                      deposit: ONE,
                    },
                  ])
                }
                onAllowlist={(only) =>
                  void act("Rule changed", [
                    {
                      method: "set_limits",
                      args: {
                        limits: { ...data.limits, allowlist_only: only },
                      },
                      deposit: ONE,
                    },
                  ])
                }
                onAdd={(n) =>
                  void act("Money added", [], `${toYocto(n)} yocto`)
                }
                onWithdraw={(n) =>
                  void act("Money taken out", [
                    {
                      method: "withdraw",
                      args: { amount: toYocto(n), to: account },
                      deposit: ONE,
                      gas: "50 Tgas",
                    },
                  ])
                }
              />
            )}

            {tab === "partners" && (
              <Connections
                company={id}
                busy={!!busy}
                act={act}
                version={data}
              />
            )}

            {tab === "treasury" && (
              <Treasury
                company={id}
                account={account!}
                busy={!!busy}
                act={act}
              />
            )}

            {tab === "ai" && <ConnectAi company={id} />}

            {tab === "profile" && (
              <>
                <ProfilePhoto company={id} image={avatar} onImage={setAvatar} />
                <section className="mt-6 flex flex-wrap items-center gap-4 text-sm">
                  <Link
                    href={`/b/${name}`}
                    className="rounded-sm border border-ink px-4 py-2 font-medium hover:bg-ink hover:text-white"
                  >
                    Open your public profile
                  </Link>
                  <ShareOnX
                    text={`My business ${name} now has an AI agent that buys for it, with the money held on @NEARProtocol until delivery.`}
                    path={`/b/${name}`}
                  />
                </section>
                <AgentBrief company={id} />
                <ProfileContacts company={id} />
                <p className="mt-10 text-sm text-muted">
                  Your business address is {id}. Your score comes from the{" "}
                  {REGISTRY_ID} directory.
                </p>
              </>
            )}

            {tab === "approvals" && data.approvals.length > 0 && (
              <section className="mt-6">
                <ul className="space-y-3">
                  {data.approvals.map(([approval, a]) => (
                    <li
                      key={approval}
                      className="flex flex-wrap items-center justify-between gap-4 rounded-sm border border-ink bg-wash px-4 py-3"
                    >
                      <span>
                        {toNear(a.amount)} NEAR to{" "}
                        <span className="font-medium">{a.deal.seller}</span>,
                        over your limit
                      </span>
                      <span className="flex gap-2">
                        <Button
                          variant="plain"
                          disabled={!!busy}
                          onClick={() =>
                            void act("Deal rejected", [
                              {
                                method: "reject",
                                args: { id: approval },
                                deposit: ONE,
                              },
                            ])
                          }
                        >
                          Reject
                        </Button>
                        <Button
                          disabled={!!busy}
                          onClick={() =>
                            void act("Deal approved", [
                              {
                                method: "approve",
                                args: { id: approval },
                                deposit: ONE,
                                gas: "100 Tgas",
                              },
                            ])
                          }
                        >
                          Approve
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
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
    <section className="mt-6">
      <h2 className="font-medium">Spending limits</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {LIMITS.map((l, i) => (
          <Button
            key={l.label}
            variant="plain"
            disabled={
              props.busy || props.current.per_deal_cap === toYocto(l.perDeal)
            }
            onClick={() => props.onLimits(i)}
          >
            {l.label}: {l.perDeal} a deal, {l.perWeek} a week
          </Button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-muted">Who your agent may pay:</span>
        {[false, true].map((only) => (
          <Button
            key={String(only)}
            variant="plain"
            disabled={props.busy || props.current.allowlist_only === only}
            onClick={() => props.onAllowlist(only)}
          >
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
        <Button
          variant="plain"
          disabled={props.busy || !(amount > 0)}
          onClick={() => props.onAdd(amount)}
        >
          Add money
        </Button>
        <Button
          variant="plain"
          disabled={props.busy || !(amount > 0)}
          onClick={() => props.onWithdraw(amount)}
        >
          Take money out
        </Button>
      </div>
    </section>
  );
}
