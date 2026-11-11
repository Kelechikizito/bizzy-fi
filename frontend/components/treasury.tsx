"use client";
// The team treasury card: create it, move money between it and the agent, approve teammates' requests.
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { accountUrl } from "@/lib/near/contracts";
import { reader, toNear, toYocto } from "@/lib/near/read";
import { CREATE_COST, createArgs, FACTORY, loadTreasury, type Proposal, transfer, type Transfer } from "@/lib/near/treasury";
import type { Call } from "@/lib/wallet";

type Act = (label: string, calls: Call[], transfer?: string, receiver?: string) => Promise<void>;
const COST = Number.parseFloat(CREATE_COST);

export function Treasury({ company, account, busy, act }: { company: string; account: string; busy: boolean; act: Act }) {
  const [t, setT] = useState<Awaited<ReturnType<typeof loadTreasury>> | undefined>(undefined);
  const [wallet, setWallet] = useState(0);
  const [team, setTeam] = useState("");
  const [amount, setAmount] = useState(0.5);

  const reload = useCallback(
    () =>
      Promise.all([loadTreasury(company), reader.getBalance(account).catch(() => 0)]).then(([treasury, balance]) => {
        setT(treasury);
        setWallet(Number(balance));
      }),
    [company, account],
  );
  useEffect(() => void reload(), [reload]);

  /** Signs, then refreshes the treasury. */
  const run: Act = async (...args) => {
    await act(...args);
    await reload();
  };

  if (t === undefined) return null;

  if (!t) {
    const members = [account, ...team.split(/[\s,]+/).filter(Boolean)];
    return (
      <section className="mt-10 rounded-2xl border border-rule p-6">
        <h2 className="font-display text-2xl font-bold">Team treasury</h2>
        <p className="mt-2 max-w-prose text-muted">
          Savings your agent can&apos;t touch. Moving money out needs approval from more than half of your team, so no one person (or agent) can drain it.
        </p>
        <label className="mt-4 block">
          <span className="font-medium">Teammates who approve payments (optional)</span>
          <input
            value={team}
            onChange={(e) => setTeam(e.target.value.toLowerCase())}
            placeholder="ada.testnet, tunde.testnet"
            className="mt-2 w-full rounded-lg border border-rule bg-card px-4 py-3 outline-none focus:border-ink"
          />
        </label>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <Button
            disabled={busy || wallet < COST + 0.1}
            onClick={() => void run("Treasury created", [{ method: "create", args: createArgs(company, members), deposit: CREATE_COST, gas: "300 Tgas" }], undefined, FACTORY)}
          >
            Create team treasury
          </Button>
          <span className="text-sm text-muted">Costs {COST} NEAR, kept by NEAR to store it.</span>
        </div>
        {wallet < COST + 0.1 && (
          <div className="mt-4 rounded-sm border border-ink bg-wash px-4 py-3 text-sm">
            <p>
              Your account has {wallet.toFixed(2)} NEAR; you need {COST + 0.1}. On testnet, get free test NEAR at{" "}
              <a href="https://near-faucet.io" target="_blank" rel="noreferrer" className="underline underline-offset-4">
                near-faucet.io
              </a>{" "}
              by pasting your account address, then reload this page.
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-2">
              <code className="break-all rounded bg-paper px-2 py-1">{account}</code>
              <button onClick={() => void navigator.clipboard.writeText(account)} className="underline underline-offset-4">
                Copy
              </button>
            </p>
          </div>
        )}
      </section>
    );
  }

  const member = t.members.includes(account);
  const kind = transfer(company, toYocto(amount));
  return (
    <section className="mt-10 rounded-2xl border border-rule p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold">Team treasury</h2>
          <p className="mt-1 font-display text-4xl font-bold">{t.balance} NEAR</p>
        </div>
        <a href={accountUrl(t.id)} target="_blank" rel="noreferrer" className="text-sm text-muted underline underline-offset-4">
          {t.members.length === 1 ? "Only you approve" : `${Math.floor(t.members.length / 2) + 1} of ${t.members.length} people approve`}
        </a>
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
          disabled={busy || !member || !(amount > 0)}
          onClick={() =>
            void run(
              "Move to agent requested",
              [
                { method: "add_proposal", args: { proposal: { description: `Move ${amount} NEAR to the agent`, kind } } },
                { method: "act_proposal", args: { id: t.nextId, action: "VoteApprove", proposal: kind }, gas: "200 Tgas" },
              ],
              undefined,
              t.id,
            )
          }
        >
          Move to agent
        </Button>
        <Button
          variant="plain"
          disabled={busy || !(amount > 0)}
          onClick={() =>
            void run("Moved to treasury", [{ method: "withdraw", args: { amount: toYocto(amount), to: t.id }, deposit: "1 yocto", gas: "50 Tgas" }])
          }
        >
          Move from agent to treasury
        </Button>
      </div>

      {t.open.length > 0 && (
        <ul className="mt-6 space-y-3">
          {t.open.map((p) => (
            <Request key={p.id} p={p} account={account} busy={busy || !member} vote={(action) => run(`Request ${action === "VoteApprove" ? "approved" : "rejected"}`, [{ method: "act_proposal", args: { id: p.id, action, proposal: p.kind }, gas: "200 Tgas" }], undefined, t.id)} />
          ))}
        </ul>
      )}
      <p className="mt-6 text-sm text-muted">
        Runs on Sputnik DAO, the multisig behind Trezu. On testnet its balance is public; on mainnet, Trezu&apos;s confidential treasuries hide it.
      </p>
    </section>
  );
}

function Request({ p, account, busy, vote }: { p: Proposal; account: string; busy: boolean; vote(action: string): void }) {
  const t = (p.kind as Transfer).Transfer;
  return (
    <li className="flex flex-wrap items-center justify-between gap-4 rounded-sm border border-ink bg-wash px-4 py-3">
      <span>
        {t ? `${toNear(t.amount)} NEAR to ${t.receiver_id}` : p.description}
        <span className="block text-sm text-muted">Asked by {p.proposer}</span>
      </span>
      {p.votes[account] ? (
        <span className="text-sm text-muted">You voted. Waiting for teammates.</span>
      ) : (
        <span className="flex gap-2">
          <Button variant="plain" disabled={busy} onClick={() => vote("VoteReject")}>
            Reject
          </Button>
          <Button disabled={busy} onClick={() => vote("VoteApprove")}>
            Approve
          </Button>
        </span>
      )}
    </li>
  );
}
