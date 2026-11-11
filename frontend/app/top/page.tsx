// The leaderboard: every business ranked by the score its deals earned on chain.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Frame } from "@/components/ui";
import { REGISTRY_ID } from "@/lib/near/contracts";
import { type Company, reader } from "@/lib/near/read";

export const metadata: Metadata = { title: "Top businesses on Bizzy-Fy", description: "Businesses ranked by deals paid through escrow on NEAR." };

/** Every company and its score, best first. */
async function ranked() {
  const all: [string, Company][] = [];
  for (let from_index = 0; from_index < 500; from_index += 100) {
    const page = (await reader.view<[string, Company][]>(REGISTRY_ID, "get_companies", { from_index, limit: 100 })) ?? [];
    all.push(...page);
    if (page.length < 100) break;
  }
  const scored = await Promise.all(all.map(async ([id, c]) => ({ id, c, score: (await reader.view<number>(REGISTRY_ID, "get_score", { account_id: id })) ?? 0 })));
  return scored.sort((a, b) => b.score - a.score || b.c.reputation.on_time - a.c.reputation.on_time);
}

export default function Page() {
  return (
    <Frame wide>
      <h1 className="font-display text-4xl font-bold tracking-tight">Top businesses</h1>
      <p className="mt-2 max-w-prose text-muted">
        Ranked by score: 10 points for each deal delivered on time, 5 if late, 3 for each new business dealt with, minus 20 for each dispute lost. Only the escrow contract can
        change these numbers.
      </p>
      <Suspense fallback={<p className="mt-8 text-muted">Loading…</p>}>
        <Table />
      </Suspense>
    </Frame>
  );
}

async function Table() {
  const rows = await ranked();
  return (
    <ol className="mt-8 divide-y divide-rule border-y-2 border-ink">
      {rows.map(({ id, c, score }, i) => {
        const name = id.split(".")[0];
        const deals = c.reputation.on_time + c.reputation.late;
        return (
          <li key={id}>
            <Link href={`/b/${name}`} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-4 py-4 hover:bg-card">
              <span className={`text-center font-display text-2xl font-bold ${i < 3 && score > 0 ? "" : "text-rule"}`}>{i + 1}</span>
              <span className="min-w-0">
                <span className="font-medium">{name}</span>
                {c.human && <span className="ml-2 rounded-full bg-ink px-2 py-0.5 text-xs text-paper">Verified human</span>}
                <span className="block truncate text-sm text-muted">
                  {deals} {deals === 1 ? "deal" : "deals"} paid, {c.reputation.counterparties} {c.reputation.counterparties === 1 ? "business" : "businesses"}
                  {c.about ? `. ${c.about}` : ""}
                </span>
              </span>
              <span className="font-display text-3xl font-bold">{score}</span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
