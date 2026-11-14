// Every Bizzy-Fy feature, A to Z, read from FEATURES.md so the page and the file never drift apart.
import type { Metadata } from "next";
import { Fragment } from "react";
import { Frame } from "@/components/ui";
import md from "@/FEATURES.md";

export const metadata: Metadata = { title: "Features · Bizzy-Fy", description: "Every Bizzy-Fy feature, A to Z, as it runs on NEAR testnet today." };

type Group = { title: string; items: { name: string; text: string }[] };

/** Splits the file into "### X" letter groups and the roadmap list under "## ". */
function parse(text: string) {
  const groups: Group[] = [];
  for (const line of text.split("\n")) {
    const heading = line.match(/^#{2,3} (.+)/);
    const item = line.match(/^- (?:\*\*(.+?)\*\*: )?(.+)/);
    if (heading) groups.push({ title: heading[1], items: [] });
    else if (item && groups.length) groups.at(-1)!.items.push({ name: item[1] ?? "", text: item[2] });
  }
  return groups.filter((g) => g.items.length);
}

/** Shows `code` spans as code; everything else as plain text. */
const Inline = ({ text }: { text: string }) =>
  text.split(/`([^`]+)`/).map((part, i) => (i % 2 ? <code key={i} className="rounded-sm bg-surface px-1 text-[0.9em]">{part}</code> : <Fragment key={i}>{part}</Fragment>));

export default function Page() {
  const groups = parse(md);
  const letters = groups.filter((g) => g.title.length === 1);
  const later = groups.filter((g) => g.title.length > 1);
  const count = letters.reduce((n, g) => n + g.items.length, 0);
  return (
    <Frame wide>
      <h1 className="font-display text-4xl font-bold">Features, A to Z</h1>
      <p className="mt-2 max-w-prose text-muted">All {count} things Bizzy-Fy does today, on NEAR testnet. What&apos;s planned but not built is at the end.</p>
      <nav className="mt-6 flex flex-wrap gap-2 text-sm" aria-label="Jump to a letter">
        {letters.map((g) => (
          <a key={g.title} href={`#${g.title}`} className="grid size-9 place-items-center rounded-sm border border-rule font-medium hover:border-ink">
            {g.title}
          </a>
        ))}
        <a href="#later" className="rounded-sm border border-rule px-3 py-1.5 hover:border-ink">Not built yet</a>
      </nav>
      {letters.map((g) => (
        <section key={g.title} id={g.title} className="mt-10 scroll-mt-8 border-t-2 border-ink pt-4">
          <h2 className="font-display text-3xl font-bold">{g.title}</h2>
          <dl className="mt-4 divide-y divide-rule">
            {g.items.map((item) => (
              <div key={item.name} className="grid gap-1 py-3 sm:grid-cols-[14rem_1fr] sm:gap-6">
                <dt className="font-bold">{item.name}</dt>
                <dd className="text-muted"><Inline text={item.text} /></dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      {later.map((g) => (
        <section key={g.title} id="later" className="mt-12 scroll-mt-8 border-t-2 border-ink pt-4">
          <h2 className="font-display text-2xl font-bold">{g.title}</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-muted">
            {g.items.map((item) => (
              <li key={item.text}><Inline text={item.text} /></li>
            ))}
          </ul>
        </section>
      ))}
    </Frame>
  );
}
