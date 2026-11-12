// A business's public profile: its track record on NEAR, and a link to join through it.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CountUp } from "@/components/motion";
import { ShareOnX } from "@/components/share";
import { Frame } from "@/components/ui";
import { accountUrl, badgeUrl } from "@/lib/near/contracts";
import { loadProfile } from "@/lib/near/profile";
import { getAvatar } from "@/lib/server/avatar";
import { contactLinks, getContacts } from "@/lib/server/contacts";

export async function generateMetadata({
  params,
}: PageProps<"/b/[name]">): Promise<Metadata> {
  const { name } = await params;
  return {
    title: `${name} on Bizzy-Fy`,
    description: `${name}'s track record: deals paid through escrow on NEAR, checked by its contracts.`,
  };
}

export default function Page({ params }: PageProps<"/b/[name]">) {
  return (
    <Frame wide>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Profile params={params} />
      </Suspense>
    </Frame>
  );
}

async function Profile({
  params,
}: {
  params: PageProps<"/b/[name]">["params"];
}) {
  const p = await loadProfile((await params).name);
  if (!p) notFound();
  const [contacts, avatar] = await Promise.all([
    getContacts(p.id).then(contactLinks),
    getAvatar(p.id),
  ]);
  const quests = [
    { done: p.human, text: "Verified human", how: "World ID" },
    {
      done: p.kyb,
      text: "Business check",
      how: p.kyb ? "KYB" : "coming next: a third-party KYB provider",
    },
    { done: p.deals > 0, text: "First deal paid", how: "through escrow" },
    {
      done: p.referrals > 0,
      text: "Brought in a business",
      how: `${p.referrals} so far`,
    },
  ];
  const stats = [
    { label: "Score", value: p.score },
    { label: "Deals paid", value: p.deals },
    {
      label: "On time",
      value: p.deals ? `${Math.round((p.onTime / p.deals) * 100)}%` : "–",
    },
    { label: "Businesses dealt with", value: p.partners },
    { label: "Paid through escrow", value: `${p.volume} NEAR` },
    { label: "Disputes lost", value: p.disputesLost },
  ];
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-5">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element -- a small data URL, nothing to optimise
            <img
              src={avatar}
              alt={`${p.name}'s profile picture`}
              className="size-20 shrink-0 rounded-full object-cover ring-1 ring-rule"
            />
          ) : (
            <span
              className="grid size-20 shrink-0 place-items-center rounded-full bg-band font-display text-3xl font-bold uppercase text-white"
              aria-hidden
            >
              {p.name[0]}
            </span>
          )}
          <div>
            <h1 className="font-display text-5xl font-bold">{p.name}</h1>
            <p className="mt-2 max-w-prose text-lg text-muted">{p.about}</p>
          </div>
        </div>
        {p.human && (
          <span className="rounded-sm bg-ink px-2 py-1 text-xs font-medium uppercase text-white">
            Verified human
          </span>
        )}
      </div>

      <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8 border-y-2 border-ink py-8 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="text-sm text-muted">{s.label}</dt>
            <dd className="mt-1 font-display text-4xl font-bold tabular-nums">
              <CountUp value={s.value} />
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-sm text-muted">
        These numbers are written only by the escrow contract when a deal
        settles, so nobody can edit them.{" "}
        <a
          href={accountUrl(p.id)}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-4"
        >
          See {p.name} on NEAR
        </a>
        . Prices and what was bought stay private.
      </p>
      <p className="mt-2 text-sm text-muted">
        <span className="mr-2 rounded-sm bg-ink px-2 py-0.5 text-xs font-medium uppercase text-white">
          Soulbound NFT
        </span>
        This score is also {p.name}&apos;s badge NFT, which can never be sold
        or moved.{" "}
        <a
          href={badgeUrl(p.id)}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-4"
        >
          See the badge
        </a>
        .
      </p>

      <section className="mt-10 grid gap-10 sm:grid-cols-2">
        <div>
          <h2 className="font-display text-xl font-bold">
            Proof of reputation
          </h2>
          <ul className="mt-3 space-y-2">
            {quests.map((q) => (
              <li key={q.text} className={q.done ? "" : "text-muted"}>
                <span aria-hidden className="mr-2 inline-block w-4 text-center">
                  {q.done ? "✓" : "○"}
                </span>
                {q.text} <span className="text-sm text-muted">({q.how})</span>
              </li>
            ))}
          </ul>
        </div>
        {contacts.length > 0 && (
          <div>
            <h2 className="font-display text-xl font-bold">Contact</h2>
            <dl className="mt-3 space-y-2">
              {contacts.map((c) => (
                <div key={c.label} className="flex gap-3">
                  <dt className="w-20 shrink-0 text-sm text-muted">
                    {c.label}
                  </dt>
                  <dd className="min-w-0 break-words">
                    {c.href ? (
                      <a
                        href={c.href}
                        target="_blank"
                        rel="noreferrer nofollow"
                        className="underline underline-offset-4"
                      >
                        {c.text}
                      </a>
                    ) : (
                      c.text
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </section>

      <div className="mt-10 flex flex-wrap items-center gap-6">
        <Link
          href={`/login?ref=${p.name}`}
          className="rounded-lg bg-ink px-6 py-3 font-medium text-white hover:bg-ink/90"
        >
          Set up your business
        </Link>
        <ShareOnX
          text={`${p.name}'s track record on Bizzy-Fy: ${p.deals} deals paid through escrow on @NEARProtocol, score ${p.score}.`}
          path={`/b/${p.name}`}
          label="Share this profile on X"
        />
      </div>
    </>
  );
}
