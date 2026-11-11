"use client";
// The landing page: what Bizzy-Fy does, shown through a real negotiation, then the safety rules and the FAQ.
import Link from "next/link";
import { Frame } from "@/components/ui";
import { useSession } from "@/lib/wallet";

/** A real run on testnet (hh buying from cups), shortened. */
const TALK = [
  { who: "Your agent", say: "100 cups for 0.05 NEAR, delivered in 3 days?" },
  { who: "cups's agent", say: "0.4. Three-day delivery is premium." },
  { who: "Your agent", say: "0.15 for 5 days. Let's meet in the middle." },
  { who: "cups's agent", say: "0.35 is my best for 100." },
  { who: "Your agent", say: "0.25, final offer." },
  { who: "cups's agent", say: "0.35. That's my floor." },
  { who: "Your agent", say: "Agreed: 0.35 NEAR, 5 days." },
];

const STEPS = [
  { title: "You ask", text: "\"500 compostable cups, delivered this week, up to 2 NEAR.\" That's the whole form." },
  { title: "Agents bargain in private", text: "Your agent picks a supplier and haggles with its agent inside sealed hardware. Not even the AI provider can read it." },
  { title: "The money is locked", text: "The payment moves into an escrow contract on NEAR. The seller can see it's there, but can't touch it yet." },
  { title: "Delivered, then paid", text: "You confirm it arrived and the seller is paid. If something's wrong, you report a problem and the money stays put." },
];

const RULES = [
  { title: "Limits you set", text: "A most-per-deal and a most-per-week. Anything bigger waits for your OK." },
  { title: "One freeze button", text: "Stops your agent at once by deleting its key. Only you can turn it back on." },
  { title: "Approved businesses only", text: "Optionally, your agent pays only businesses you've connected with by invite link." },
  { title: "Your money, your account", text: "Funds sit in your business's own contract. Bizzy-Fy can't move them, and neither can the agent beyond your limits." },
];

const FAQ = [
  {
    q: "Is this real money?",
    a: "Not yet. Bizzy-Fy runs on NEAR testnet, so all NEAR here is test money. Nothing on this site touches real funds.",
  },
  {
    q: "Who can read my deal terms?",
    a: "Only you and the other business. The terms are stored encrypted, and the blockchain keeps just a fingerprint of them, so either side can prove what was agreed. The amount locked in escrow is public.",
  },
  {
    q: "How do I know the negotiation was private?",
    a: "Each negotiation runs on NEAR AI Cloud inside a TEE (sealed hardware). We check NVIDIA's signed report on the hardware, that it holds the key that signed every AI reply, and that every reply was signed. All three must pass for the \"Verified private\" badge.",
  },
  {
    q: "What if the seller never delivers?",
    a: "After the delivery deadline, the money goes back to you automatically. If they mark it delivered and it isn't right, you have an hour to report a problem, and the money stays locked until you both agree a split.",
  },
  {
    q: "What stops a rogue or hacked agent?",
    a: "The rules live in your contract, not in the AI. The agent's key can only open deals within your limits and can't pay out a delivery. The guardian (you) can freeze it at any time.",
  },
  {
    q: "Do I need a crypto wallet?",
    a: "No. Sign in with Google, email or a passkey, and you get a NEAR account automatically. If you already have a NEAR wallet, you can use it.",
  },
  {
    q: "What does it cost?",
    a: "Bizzy-Fy takes no fee. Each business pays NEAR's network fees, which are fractions of a cent. The contracts keep working without our server; it only hosts the agents.",
  },
  {
    q: "Is the code open?",
    a: "Yes. The contracts (Rust) and the website are open source on GitHub.",
  },
];

export default function Home() {
  const { account } = useSession();
  const start = account ? "/dashboard" : "/login";
  return (
    <Frame wide>
      <section className="grid items-center gap-10 md:grid-cols-[1.1fr_1fr]">
        <div>
          <h1 className="font-display text-5xl font-bold leading-[1.02] tracking-tight sm:text-6xl">Your agent haggles. Your money waits for delivery.</h1>
          <p className="mt-6 max-w-prose text-lg leading-relaxed text-muted">
            Tell Bizzy-Fy what your business needs. Your AI agent finds a supplier, bargains with its agent in private, and locks the payment on NEAR until the goods arrive.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link href={start} className="rounded-lg bg-ink px-6 py-3 font-medium text-paper hover:bg-ink/90">
              {account ? "Open your dashboard" : "Set up your business"}
            </Link>
            <a href="#faq" className="text-muted underline underline-offset-4">
              Questions
            </a>
          </div>
        </div>

        {/* The memorable bit: a real negotiation, ending in locked money. */}
        <figure className="rounded-2xl border-2 border-ink bg-card p-5 shadow-[6px_6px_0_var(--color-ink)]">
          <figcaption className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted">A real negotiation on testnet</span>
            <span className="rounded-full bg-ink px-3 py-1 text-paper">Verified private</span>
          </figcaption>
          <ol className="mt-4 space-y-2 text-[15px]">
            {TALK.map((line, i) => (
              <li key={i} className={`max-w-[85%] rounded-xl px-3 py-2 ${line.who === "Your agent" ? "bg-paper" : "ml-auto bg-rule/60 text-right"}`}>
                <span className="block text-xs text-muted">{line.who}</span>
                {line.say}
              </li>
            ))}
          </ol>
          <p className="mt-4 rounded-lg border-l-4 border-wait bg-paper px-3 py-2 text-sm">
            <span className="font-medium">0.35 NEAR locked in escrow</span> until cups delivers.
          </p>
        </figure>
      </section>

      <section className="mt-24">
        <h2 className="font-display text-3xl font-bold tracking-tight">How a deal goes</h2>
        <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="border-t-4 border-ink pt-4">
              <span className="font-display text-4xl font-bold text-rule">{i + 1}</span>
              <h3 className="mt-1 font-display text-lg font-bold">{step.title}</h3>
              <p className="mt-2 text-muted">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-24 rounded-2xl bg-ink p-8 text-paper sm:p-10">
        <h2 className="font-display text-3xl font-bold tracking-tight">You stay in charge</h2>
        <p className="mt-2 max-w-prose text-paper/75">The agent is clever. The rules are not up to it: they&apos;re enforced by your business&apos;s contract on NEAR.</p>
        <ul className="mt-8 grid gap-8 sm:grid-cols-2">
          {RULES.map((rule) => (
            <li key={rule.title}>
              <h3 className="font-display text-lg font-bold">{rule.title}</h3>
              <p className="mt-1 text-paper/75">{rule.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="faq" className="mt-24 scroll-mt-8">
        <h2 className="font-display text-3xl font-bold tracking-tight">Questions</h2>
        <div className="mt-6 divide-y divide-rule border-y border-rule">
          {FAQ.map((item) => (
            <details key={item.q} className="group py-4">
              <summary className="cursor-pointer list-none font-medium">
                <span className="mr-2 inline-block transition-transform group-open:rotate-90">›</span>
                {item.q}
              </summary>
              <p className="mt-2 max-w-prose pl-5 text-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mt-24 text-center">
        <h2 className="font-display text-3xl font-bold tracking-tight">Let your agent do the buying.</h2>
        <Link href={start} className="mt-6 inline-block rounded-lg bg-ink px-6 py-3 font-medium text-paper hover:bg-ink/90">
          {account ? "Open your dashboard" : "Set up your business"}
        </Link>
        <p className="mt-6 text-sm text-muted">
          Built on NEAR for the NEAR hackathon.{" "}
          <a href="https://github.com/Kelechikizito/bizzy-fy" target="_blank" rel="noreferrer" className="underline underline-offset-4">
            Code on GitHub
          </a>
        </p>
      </section>
    </Frame>
  );
}
