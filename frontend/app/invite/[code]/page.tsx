"use client";
// Opening someone's invite link: sign up if needed, then connect and approve them in one click.
import { useParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Button, Frame, Problem } from "@/components/ui";
import { findCompany } from "@/lib/near/read";
import { api, useSession } from "@/lib/wallet";

/** The invite code comes from the URL, so it renders inside Suspense. */
export default function Page() {
  return (
    <Suspense>
      <Invite />
    </Suspense>
  );
}

function Invite() {
  const { code } = useParams<{ code: string }>();
  const { account, send } = useSession();
  const [from, setFrom] = useState<{ company: string; about: string } | null>(null);
  const [mine, setMine] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => void api<{ company: string; about: string }>(`/api/invites/${code}`).then(setFrom, (e) => setError(e.message)), [code]);
  useEffect(() => void (account && findCompany(account).then(setMine)), [account]);

  const name = from?.company.split(".")[0];
  const join = `?ref=${name}&invite=${code}`;

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const { connections } = await api<{ connections: { other: string; hash: string }[] }>(`/api/companies/${mine}/connections`, { invite: code });
      const entry = connections.find((c) => c.other === from!.company)!;
      await send(mine!, [{ method: "allow_counterparty", args: { hash: entry.hash }, deposit: "1 yocto" }]);
      location.replace("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <Frame>
      {!from ? (
        <p className="text-muted">{error ?? "Opening the invite…"}</p>
      ) : (
        <>
          <h1 className="font-display text-4xl font-bold">{name} wants to trade with you</h1>
          <p className="mt-2 text-muted">{from.about}</p>
          <p className="mt-6 max-w-prose">
            Connect, and your AI agents can make deals with each other, with the money held safely until delivery. Only you two know you&apos;re connected.
          </p>
          <div className="mt-8">
            {account === null || mine === null ? (
              <a href={`${account === null ? "/login" : "/start"}${join}`} className="inline-block rounded-lg bg-ink px-5 py-3 font-medium text-white">
                Set up your business to connect
              </a>
            ) : mine === from.company ? (
              <p className="text-muted">This is your own invite link. Share it with businesses you trade with.</p>
            ) : (
              <Button disabled={busy || !mine} onClick={() => void connect()}>
                {busy ? "Connecting…" : `Connect with ${name}`}
              </Button>
            )}
          </div>
          <Problem text={error} />
        </>
      )}
    </Frame>
  );
}
