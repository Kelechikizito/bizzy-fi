"use client";
import { useEffect, useState } from "react";
import { Button, Frame, Problem } from "@/components/ui";
import { WorldIdButton } from "@/components/world-id";
import { companyId, REGISTRY_ID } from "@/lib/near/contracts";
import { findCompany, getCompany, nameFree, reader, toYocto } from "@/lib/near/read";
import { api, useSession } from "@/lib/wallet";

const WEEK_NS = (7n * 24n * 3600n * 10n ** 9n).toString();
const PRESETS = [
  { label: "Small", perDeal: 1, perWeek: 3 },
  { label: "Medium", perDeal: 2, perWeek: 5 },
  { label: "Large", perDeal: 5, perWeek: 20 },
];
const STEPS = ["Your account", "Your business", "Spending rules", "Starting money", "Open your business", "Prove you're human", "Turn on your agent"];
const [BUSINESS, RULES, MONEY, OPEN, HUMAN, AGENT] = [1, 2, 3, 4, 5, 6];
const FEES = 0.2;

/** Back to the invite that brought them here, or to the dashboard. */
const afterSignUp = () => {
  const invite = new URLSearchParams(location.search).get("invite");
  return invite ? `/invite/${invite}` : "/dashboard";
};

export default function Start() {
  const { account, send } = useSession();
  const [step, setStep] = useState(BUSINESS);
  const [id, setId] = useState<string | null>(null);
  const [human, setHuman] = useState(false);
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [checked, setChecked] = useState<{ name: string; free: boolean } | null>(null);
  const [preset, setPreset] = useState(1);
  const [approvedOnly, setApprovedOnly] = useState(true);
  const [wallet, setWallet] = useState<number | null>(null);
  const [amount, setAmount] = useState(0.5);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A returning guardian picks up at the step they missed.
  useEffect(() => {
    if (account === null) location.replace(`/login${location.search}`);
    if (!account) return;
    void findCompany(account).then(async (c) => {
      if (!c) return;
      const [company, key, status] = await Promise.all([getCompany(c), reader.view(c, "get_agent_key"), reader.view(c, "get_status")]);
      if (key || status !== "Active") return location.replace(afterSignUp());
      setId(c);
      setHuman(!!company?.human);
      setStep(company?.human ? AGENT : HUMAN);
    });
    void reader.getBalance(account).then(Number).catch(() => 0).then((n) => setWallet(Math.floor(n * 100) / 100));
  }, [account]);

  // Check the name as they type.
  const valid = /^[a-z0-9-]{2,32}$/.test(name);
  const free = checked?.name === name ? checked.free : null;
  useEffect(() => {
    if (!valid) return;
    const timer = setTimeout(() => void nameFree(name).then((ok) => setChecked({ name, free: ok })), 400);
    return () => clearTimeout(timer);
  }, [name, valid]);

  const most = Math.min(5, Math.floor(((wallet ?? 0) - FEES) * 10) / 10);

  /** Runs one signed step, showing progress and any error. */
  async function run(label: string, work: () => Promise<void>) {
    setError(null);
    setProgress(label);
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  }

  const open = () =>
    run("Opening your business…", async () => {
      const ref = new URLSearchParams(location.search).get("ref");
      const referrer = ref && (await getCompany(companyId(ref))) ? companyId(ref) : null;
      const { perDeal, perWeek } = PRESETS[preset];
      const limits = { per_deal_cap: toYocto(perDeal), period_cap: toYocto(perWeek), period_length_ns: WEEK_NS, allowlist_only: approvedOnly };
      const { value } = await send(REGISTRY_ID, [
        { method: "create_company", args: { name, about, referrer, limits }, deposit: `${toYocto(amount)} yocto`, gas: "150 Tgas" },
      ]);
      if (value !== true) throw new Error("Your business wasn't opened and your money was returned. Try another name.");
      setId(companyId(name));
      setStep(HUMAN);
    });

  const turnOn = () =>
    run("Giving your agent its key…", async () => {
      const { public_key } = await api<{ public_key: string }>(`/api/companies/${id}/agent-key`);
      await send(id!, [{ method: "set_agent_key", args: { public_key }, deposit: "1 yocto" }]);
      location.replace(afterSignUp());
    });

  const canNext = { [BUSINESS]: valid && free === true && about.trim().length > 0, [RULES]: true, [MONEY]: amount >= 0.5 && amount <= most }[step];

  return (
    <Frame wide>
      <div className="grid gap-10 sm:grid-cols-[13rem_1fr]">
        <nav aria-label="Sign-up steps">
          <p className="text-sm text-muted sm:hidden">
            Step {step + 1} of {STEPS.length}
          </p>
          <ol className="hidden space-y-1 sm:block">
            {STEPS.map((s, i) => (
              <li
                key={s}
                aria-current={i === step ? "step" : undefined}
                className={`flex items-center gap-3 rounded-lg px-2 py-2 ${i === step ? "bg-card font-medium" : i < step ? "" : "text-muted"}`}
              >
                <span
                  className={`grid size-7 shrink-0 place-items-center rounded-sm text-sm ${
                    i < step ? "bg-ink text-white" : i === step ? "border-2 border-ink" : "border border-rule"
                  }`}
                >
                  {i < step ? "✓" : i + 1}
                </span>
                {s}
              </li>
            ))}
          </ol>
        </nav>

        <div>
          <h1 className="font-display text-4xl font-bold">{STEPS[step]}</h1>
          <div className="mt-8 space-y-6">
            {step === BUSINESS && (
              <>
                <label className="block">
                  <span className="font-medium">Business name</span>
                  <div className="mt-2 flex items-center rounded-lg border border-rule bg-card focus-within:border-ink">
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value.toLowerCase())}
                      placeholder="corner-bakery"
                      className="w-full bg-transparent px-4 py-3 outline-none"
                      autoFocus
                    />
                    <span className="pr-4 text-sm text-muted">.{REGISTRY_ID}</span>
                  </div>
                  <span className="mt-2 block text-sm text-muted">
                    {!name
                      ? "Lowercase letters, numbers and dashes. This becomes your business address."
                      : !valid
                        ? "Use 2–32 lowercase letters, numbers or dashes."
                        : free === null
                          ? "Checking…"
                          : free
                            ? "That name is free."
                            : "That name is taken."}
                  </span>
                </label>
                <label className="block">
                  <span className="font-medium">What you do, in one line</span>
                  <input
                    value={about}
                    onChange={(e) => setAbout(e.target.value.slice(0, 280))}
                    placeholder="Bakes bread for cafes in Lagos."
                    className="mt-2 w-full rounded-lg border border-rule bg-card px-4 py-3 outline-none focus:border-ink"
                  />
                  <span className="mt-2 block text-sm text-muted">Shown publicly next to your score.</span>
                </label>
              </>
            )}

            {step === RULES && (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  {PRESETS.map((p, i) => (
                    <button
                      key={p.label}
                      onClick={() => setPreset(i)}
                      aria-pressed={preset === i}
                      className={`rounded-lg border px-4 py-4 text-left ${preset === i ? "border-ink bg-card" : "border-rule"}`}
                    >
                      <span className="font-display text-lg font-bold">{p.label}</span>
                      <span className="mt-1 block text-sm text-muted">
                        Up to {p.perDeal} NEAR a deal, {p.perWeek} NEAR a week
                      </span>
                    </button>
                  ))}
                </div>
                <p className="text-sm text-muted">Anything above these limits waits for your OK. You can change them any time.</p>
                <label className="flex items-start gap-3">
                  <input type="checkbox" checked={approvedOnly} onChange={(e) => setApprovedOnly(e.target.checked)} className="mt-1 size-4 accent-ink" />
                  <span>
                    <span className="font-medium">Only pay businesses I approve</span>
                    <span className="block text-sm text-muted">Recommended. You approve a business by sharing an invite link with it.</span>
                  </span>
                </label>
              </>
            )}

            {step === MONEY && (
              <>
                <p className="text-muted">
                  This money moves into your business account. Your agent can spend it only within your rules, and you can take it back any time.
                </p>
                {wallet === null ? (
                  <p className="text-muted">Checking your balance…</p>
                ) : most < 0.5 ? (
                  <p className="text-muted">
                    Your account has {wallet} NEAR. You need at least {0.5 + FEES} NEAR to start. On testnet, get free test NEAR at near-faucet.io.
                  </p>
                ) : (
                  <div>
                    <div className="flex flex-wrap gap-2">
                      {[...new Set([0.5, 1, 2, 5, most].filter((n) => n <= most))].map((n) => (
                        <Button key={n} variant={amount === n ? "main" : "plain"} onClick={() => setAmount(n)}>
                          {n === most ? `All I can (${n})` : n} NEAR
                        </Button>
                      ))}
                    </div>
                    <label className="mt-4 flex w-fit items-center gap-2 rounded-lg border border-rule bg-card px-4 focus-within:border-ink">
                      <input
                        type="number"
                        min={0.5}
                        max={most}
                        step={0.1}
                        value={amount}
                        onChange={(e) => setAmount(Number(e.target.value))}
                        className="w-24 bg-transparent py-3 font-display text-2xl font-bold outline-none"
                        aria-label="Starting money in NEAR"
                      />
                      NEAR
                    </label>
                    <p className="mt-2 text-sm text-muted">
                      {amount < 0.5 || amount > most
                        ? `Choose between 0.5 and ${most} NEAR.`
                        : `You have ${wallet} NEAR. Up to ${most} can go in; we keep ${FEES} back to pay for your actions.`}
                    </p>
                  </div>
                )}
              </>
            )}

            {step === OPEN && (
              <dl className="divide-y divide-rule rounded-lg border border-rule bg-card">
                {[
                  ["Business address", companyId(name)],
                  ["Spending limits", `${PRESETS[preset].perDeal} NEAR a deal, ${PRESETS[preset].perWeek} NEAR a week`],
                  ["Who it can pay", approvedOnly ? "Only businesses you approve" : "Any business"],
                  ["Starting money", `${amount} NEAR`],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 px-4 py-3">
                    <dt className="text-muted">{k}</dt>
                    <dd className="text-right font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            )}

            {step === HUMAN && (
              <>
                <p className="text-muted">
                  Every business here has a real person in charge. Verify once with World ID and your business gets a <b>Verified human</b> badge, which other
                  businesses&apos; agents check before they deal with you. We only learn that you&apos;re a unique person, never who you are. One person can
                  verify up to 3 businesses.
                </p>
                {human ? (
                  <p className="rounded-lg bg-card px-4 py-3 font-medium">Verified. Your business now shows the Verified human badge.</p>
                ) : (
                  <WorldIdButton
                    company={id!}
                    onDone={() => setHuman(true)}
                    className="rounded-lg bg-ink px-5 py-3 font-medium text-white hover:bg-ink/90"
                  />
                )}
              </>
            )}

            {step === AGENT && (
              <p className="text-muted">
                Your agent gets its own limited key. It can only make deals within your rules, it can never take money out, and the Freeze button removes
                the key at once.
              </p>
            )}
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            {step > BUSINESS && step <= OPEN && !progress && (
              <Button variant="plain" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            )}
            {step < OPEN && (
              <Button onClick={() => setStep(step + 1)} disabled={!canNext}>
                Continue
              </Button>
            )}
            {step === OPEN && (
              <Button onClick={() => void open()} disabled={!!progress}>
                {progress ?? "Open my business"}
              </Button>
            )}
            {step === HUMAN && (
              <Button variant={human ? "main" : "plain"} onClick={() => setStep(AGENT)}>
                {human ? "Continue" : "Do this later"}
              </Button>
            )}
            {step === AGENT && (
              <Button onClick={() => void turnOn()} disabled={!!progress}>
                {progress ?? "Turn on my agent"}
              </Button>
            )}
          </div>
          <Problem text={error} />
        </div>
      </div>
    </Frame>
  );
}
