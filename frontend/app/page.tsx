"use client";
// The landing page: light and dark bands, with charts of real testnet runs as the imagery.
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { EASE, Reveal } from "@/components/motion";
import { Frame, GHOST, PRIMARY } from "@/components/ui";
import { useSession } from "@/lib/wallet";

const STEPS = [
  {
    title: "You ask",
    text: "500 compostable cups, delivered this week, up to 2 NEAR.",
  },
  {
    title: "Agents bargain in private",
    text: "Your agent picks a supplier and haggles with its agent inside sealed hardware.",
  },
  {
    title: "The money is locked",
    text: "The payment moves into an escrow contract on NEAR.",
  },
  {
    title: "Delivered, then paid",
    text: "You confirm it arrived and the seller gets paid.",
  },
];

/** The core technology, shown as the dark strip. */
const TECH = [
  {
    label: "Private AI",
    name: "NEAR AI Cloud",
    line: "Negotiations sealed in a TEE, checked every time",
  },
  {
    label: "Proof of personhood",
    name: "World ID",
    line: "One verified human behind each business",
  },
  {
    label: "Sign-in",
    name: "NEAR Connect",
    line: "Any NEAR wallet: HOT, Meteor, MyNearWallet and more",
  },
  { label: "Agent connect", name: "MCP", line: "Claude, Cursor, and more" },
  {
    label: "Settlement",
    name: "NEAR",
    line: "Escrow, limits and reputation in Rust contracts",
  },
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
    a: 'Each negotiation runs on NEAR AI Cloud inside a TEE (sealed hardware). We check NVIDIA\'s signed report on the hardware, that it holds the key that signed every AI reply, and that every reply was signed. All three must pass for the "Verified private" badge.',
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
    q: "Can I use Claude or Cursor instead of the built-in agent?",
    a: "Yes. Make a connection key in your dashboard and add Bizzy-Fy as an MCP server. Your AI can then find businesses, buy, and check your deals, always within your agent's limits. You can turn the key off at any time.",
  },
  {
    q: "Do I need a crypto wallet?",
    a: "You need a NEAR wallet to sign in. Any one works, and Meteor or HOT make one free in a minute. On testnet a new account gets 1 free test NEAR to try things.",
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

/** What Bizzy-Fy fixes, from docs/product-questions.md §3 (Illia Polosukhin's 1kx interview and real business complaints). Only what's built today. */
const PROBLEMS = [
  {
    problem: "Businesses don't trust each other",
    example:
      "So every deal starts with a deposit, a guarantee or a long wait, and someone always carries the risk.",
    fix: "The money sits in an escrow contract that neither side controls. It goes to the seller on delivery, or back to the buyer if they don't deliver.",
  },
  {
    problem: "Contracts, lawyers and paperwork",
    example:
      "Weeks of drafting and redlining agreements, for deals that are mostly price, quantity and a date.",
    fix: "The agents agree those terms in minutes, and the contract on NEAR enforces payment and delivery deadlines. No lawyer needed to hold the money.",
  },
  {
    problem: "Deposits paid to suppliers you can't check",
    example:
      "A food importer wired a deposit overseas and got neither the goods nor the money back.",
    fix: "Nothing reaches the seller until you confirm delivery. Past the deadline, anyone can trigger your refund.",
  },
  {
    problem: "Chasing late payments",
    example:
      'An agency waited three months for a $3,400 invoice that was "being processed".',
    fix: "The seller sees the money locked before starting work, and is paid when the buyer confirms, or once the buyer's hour to check the delivery has passed.",
  },
  {
    problem: "No privacy",
    example:
      "Prices, margins and who you buy from are exactly what competitors want to see.",
    fix: "Negotiations run in sealed hardware nobody can read. Terms are stored encrypted, and the chain keeps only a fingerprint. Even your partner list is scrambled.",
  },
  {
    problem: "Slow, manual back-and-forth",
    example:
      "Email a supplier, wait for someone to check stock and prices, reply, repeat.",
    fix: "Your agent finds a supplier and settles the price with its agent in about 30 seconds.",
  },
  {
    problem: "Handing AI your money is scary",
    example: '"Giving an LLM unlimited bank access is terrifying."',
    fix: "Your agent holds a limited key, not your money: caps per deal and per week, your OK for anything bigger, and a freeze button.",
  },
  {
    problem: "Fake businesses and fraud",
    example: "Anyone can claim to be a reliable supplier.",
    fix: "Scores are written only when real deals settle, owners can prove they're human with World ID, and every agent has an owner who can freeze it at once.",
  },
];

/** The real negotiation (hh buying from cups on testnet): each move's side, total price in NEAR, and message, shortened. */
const MOVES = [
  {
    m: 1,
    side: "buyer",
    p: 0.05,
    say: "100 cups for 0.05 NEAR, delivered in 3 days?",
  },
  { m: 2, side: "seller", p: 0.4, say: "0.4. Three-day delivery is premium." },
  {
    m: 3,
    side: "buyer",
    p: 0.15,
    say: "0.15 for 5 days. Let's meet in the middle.",
  },
  { m: 4, side: "seller", p: 0.35, say: "0.35 is my best for 100." },
  { m: 5, side: "buyer", p: 0.25, say: "0.25, final offer." },
  { m: 6, side: "seller", p: 0.35, say: "0.35. That's my floor." },
  { m: 7, side: "buyer", p: 0.35, say: "Agreed: 0.35 NEAR, 5 days." },
];
const W = 480;
const H = 190;
const X = (m: number) => 40 + (m - 1) * 70;
const Y = (p: number) => 170 - (p / 0.45) * 150;
const line = (side: string) =>
  MOVES.filter((v) => v.side === side || v.m === 7)
    .map((v) => `${X(v.m)},${Y(v.p)}`)
    .join(" ");
const colour = (side: string) =>
  side === "buyer" ? "var(--color-chart)" : "var(--color-ink)";

/** The hero widget: the two agents' offers converging. Point at (or tab to, or tap) a move to read it. */
function OfferChart() {
  const buyer = line("buyer");
  const [active, setActive] = useState<number | null>(null);
  const move = active ? MOVES[active - 1] : null;
  return (
    <figure className="rounded-sm border border-rule bg-card shadow-widget transition duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_2px_4px_rgb(0_0_0/0.04),0_20px_48px_rgb(0_0_0/0.12)]">
      <figcaption className="flex items-center justify-between gap-3 border-b border-rule px-4 py-3 text-sm">
        <span className="font-medium">Negotiation: hh buys from cups</span>
        <span className="rounded-sm bg-ink px-2 py-1 text-xs font-medium uppercase text-white">
          Verified private
        </span>
      </figcaption>
      <div className="relative" onMouseLeave={() => setActive(null)}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full"
          role="group"
          aria-label="Offers by move: hh's agent rises from 0.05 to 0.35 NEAR, cups's agent falls from 0.4 to 0.35, and they agree at 0.35."
        >
          {[0, 0.1, 0.2, 0.3, 0.4].map((p) => (
            <g key={p}>
              <line
                x1="40"
                x2="460"
                y1={Y(p)}
                y2={Y(p)}
                stroke="var(--color-rule)"
              />
              <text
                x="32"
                y={Y(p) + 4}
                textAnchor="end"
                fontSize="11"
                fill="var(--color-steel)"
              >
                {p}
              </text>
            </g>
          ))}
          <line
            x1="40"
            x2="460"
            y1={Y(0.4)}
            y2={Y(0.4)}
            stroke="var(--color-ink)"
            strokeDasharray="4 4"
          />
          <text
            x="460"
            y={Y(0.4) - 6}
            textAnchor="end"
            fontSize="11"
            fill="var(--color-ink)"
          >
            your max 0.4
          </text>
          <motion.polygon
            points={`${X(1)},170 ${buyer} ${X(7)},170`}
            fill="var(--color-wash)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.1, duration: 0.6 }}
          />
          {/* The crosshair snaps to the move under the pointer. */}
          <AnimatePresence>
            {move && (
              <motion.line
                key="crosshair"
                y1="12"
                y2="170"
                stroke="var(--color-steel)"
                strokeDasharray="3 3"
                initial={{ opacity: 0, x1: X(move.m), x2: X(move.m) }}
                animate={{ opacity: 1, x1: X(move.m), x2: X(move.m) }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
          </AnimatePresence>
          {[
            [buyer, "var(--color-chart)"],
            [line("seller"), "var(--color-ink)"],
          ].map(([points, stroke]) => (
            <motion.polyline
              key={stroke}
              points={points}
              fill="none"
              stroke={stroke}
              strokeWidth="2"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 0.3, duration: 1.4, ease: EASE }}
            />
          ))}
          {MOVES.map((v) => (
            <motion.circle
              key={v.m}
              cx={X(v.m)}
              cy={Y(v.p)}
              r="3.5"
              fill={colour(v.side)}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{
                delay: 0.3 + (v.m - 1) * 0.2,
                type: "spring",
                stiffness: 400,
                damping: 20,
              }}
            />
          ))}
          <AnimatePresence>
            {move && (
              <motion.circle
                key={`ring-${move.m}`}
                cx={X(move.m)}
                cy={Y(move.p)}
                r="8"
                fill="none"
                stroke={colour(move.side)}
                strokeWidth="2"
                initial={{ scale: 0.3, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.3, opacity: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 28 }}
              />
            )}
          </AnimatePresence>
          {/* Invisible columns, one per move, that catch the pointer, keyboard focus and taps. */}
          {MOVES.map((v) => (
            <rect
              key={v.m}
              x={X(v.m) - 35}
              y="0"
              width="70"
              height={H}
              fill="transparent"
              tabIndex={0}
              role="button"
              aria-label={`Move ${v.m}, ${v.side === "buyer" ? "your agent" : "cups's agent"}: ${v.p} NEAR. ${v.say}`}
              className="cursor-crosshair outline-none"
              onMouseEnter={() => setActive(v.m)}
              onFocus={() => setActive(v.m)}
              onBlur={() => setActive(null)}
              onClick={() => setActive(active === v.m ? null : v.m)}
            />
          ))}
        </svg>
        <AnimatePresence>
          {move && (
            <motion.div
              key={move.m}
              role="status"
              className="pointer-events-none absolute w-52 rounded-sm border border-rule bg-card px-3 py-2 text-xs shadow-widget"
              style={{
                left: `${(X(move.m) / W) * 100}%`,
                top: `${(Y(move.p) / H) * 100}%`,
                translate: `${move.m === 1 ? "-12%" : move.m === 7 ? "-88%" : "-50%"} calc(-100% - 14px)`,
              }}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.18, ease: EASE }}
            >
              <span className="flex items-center justify-between gap-2 text-muted">
                <span>
                  Move {move.m}:{" "}
                  {move.side === "buyer" ? "your agent" : "cups's agent"}
                </span>
                <span className="font-medium text-ink">
                  {move.m === 7 ? "Accepted" : `${move.p} NEAR`}
                </span>
              </span>
              <span className="mt-1 block text-[13px] leading-snug text-ink">
                &ldquo;{move.say}&rdquo;
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 px-4 pb-3 text-xs text-muted">
        <span>
          <span className="mr-1 inline-block h-0.5 w-4 bg-chart align-middle" />{" "}
          Your agent
        </span>
        <span>
          <span className="mr-1 inline-block h-0.5 w-4 bg-ink align-middle" />{" "}
          cups&apos;s agent
        </span>
        <span>
          7 moves inside NEAR AI Cloud&apos;s TEE. Point at one to read it.
        </span>
      </div>
      <motion.p
        className="flex items-center justify-between gap-3 border-t border-rule bg-surface px-4 py-3 text-sm"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.8, duration: 0.4, ease: EASE }}
      >
        <span>
          <span className="font-medium">0.35 NEAR locked in escrow</span> until
          cups delivers
        </span>
        <span className="text-xs text-muted">testnet, 10 Nov</span>
      </motion.p>
    </figure>
  );
}

const WRAP = "mx-auto max-w-[1200px] px-4";
const H2 = "text-[32px] font-bold leading-[1.2]";

export default function Home() {
  const { account } = useSession();
  const start = account ? "/dashboard" : "/login";
  return (
    <Frame bare>
      <section
        className={`${WRAP} grid items-center gap-12 py-20 lg:grid-cols-[1fr_1.05fr]`}
      >
        <div>
          <h1 className="font-hero text-[40px] font-bold leading-[1.1] sm:text-display sm:leading-[1.2]">
            Private B2B commerce for agents, backed by verified humans.
          </h1>
          <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-muted">
            Tell Bizzy-Fy what your business needs. Your{" "}
            <strong className="font-semibold text-ink">AI agent</strong>, backed
            by a{" "}
            <strong className="font-semibold text-ink">verified human</strong>,
            finds another business, haggles in{" "}
            <strong className="font-semibold text-ink">private</strong>, locks
            the payment on{" "}
            <strong className="font-semibold text-ink">NEAR</strong> until terms
            are reached.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link href={start} className={PRIMARY}>
              {account ? "Open your dashboard" : "Set up your business"}
            </Link>
            <a href="#how" className={GHOST}>
              How it works
            </a>
          </div>
        </div>
        <OfferChart />
      </section>

      <section className="border-t border-rule py-20">
        <div className={WRAP}>
          <Reveal>
            <h2 className={`${H2} text-center`}>
              The problems Bizzy-Fy solves
            </h2>
            <div className="mt-6 grid gap-6 md:grid-cols-2 md:items-end">
              <blockquote className="border-l-2 border-ink pl-4">
                <p className="text-lg leading-snug">
                  &ldquo;&hellip;when we talk about actual business commerce,
                  this is where there&apos;s actually no trust.&rdquo;
                </p>
                <footer className="mt-2 text-sm text-muted">
                  Illia Polosukhin, NEAR co-founder, on B2B trade
                </footer>
              </blockquote>
              <p className="max-w-sm text-sm text-muted md:justify-self-end">
                Illia sizes business-to-business trade at $20 to 40 trillion. It
                still runs on deposits, paperwork and phone calls.
              </p>
            </div>
          </Reveal>
          <div className="mt-10 rounded-sm border border-rule bg-card">
            <div className="hidden grid-cols-2 gap-6 border-b border-rule px-4 py-2 text-xs font-medium uppercase text-badge sm:grid">
              <span>The problem</span>
              <span>How Bizzy-Fy fixes it</span>
            </div>
            <ul className="divide-y divide-rule">
              {PROBLEMS.map((row, i) => (
                <motion.li
                  key={row.problem}
                  className="grid gap-2 px-4 py-4 transition-colors duration-200 hover:bg-surface sm:grid-cols-2 sm:gap-6"
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{
                    duration: 0.45,
                    delay: (i % 4) * 0.06,
                    ease: EASE,
                  }}
                >
                  <div>
                    <h3 className="font-bold">{row.problem}</h3>
                    <p className="mt-1 text-sm text-muted">{row.example}</p>
                  </div>
                  <p className="text-sm">{row.fix}</p>
                </motion.li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section id="how" className="scroll-mt-8 border-t border-rule py-20">
        <div className={WRAP}>
          <Reveal>
            <h2 className={H2}>How a deal goes</h2>
          </Reveal>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <motion.li
                key={step.title}
                className="rounded-sm border border-rule bg-card p-4 transition-colors duration-200 hover:border-ink"
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.1, ease: EASE }}
              >
                <span className="text-xs font-medium uppercase text-badge">
                  Step {i + 1}
                </span>
                <h3 className="mt-2 text-xl font-bold">{step.title}</h3>
                <p className="mt-2 text-sm text-muted">{step.text}</p>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-band text-white">
        <Reveal className={`${WRAP} pt-20 text-center`}>
          <h2 className={H2}>What Bizzy-Fy runs on</h2>
          <p className="mx-auto mt-3 max-w-prose text-fog">
            Five pieces of technology, each doing one job you can check.
          </p>
        </Reveal>
        <ul
          className={`${WRAP} grid gap-y-10 pb-20 pt-12 sm:grid-cols-2 lg:grid-cols-5`}
        >
          {TECH.map((t, i) => (
            <motion.li
              key={t.name}
              className="group cursor-default transition-colors duration-300 lg:border-l lg:border-graphite lg:pl-6 lg:first:border-l-0 lg:first:pl-0 lg:hover:border-white"
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.1, ease: EASE }}
            >
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-fog transition-colors duration-300 group-hover:text-white">
                0{i + 1} · {t.label}
              </p>
              <p className="mt-4 whitespace-nowrap font-hero text-3xl font-bold leading-none transition-transform duration-300 ease-out group-hover:-translate-y-1 xl:text-[34px]">
                {t.name}
              </p>
              <span
                aria-hidden
                className="mt-3 block h-0.5 w-0 bg-wash transition-[width] duration-300 ease-out group-hover:w-16"
              />
              <p className="mt-3 text-sm text-fog transition-colors duration-300 group-hover:text-ash">
                {t.line}
              </p>
            </motion.li>
          ))}
        </ul>
      </section>

      <section className="py-20">
        <div
          className={`${WRAP} grid items-center gap-12 lg:grid-cols-[1fr_1.1fr]`}
        >
          <Reveal>
            <h2 className={H2}>Or bring your own AI</h2>
            <p className="mt-3 max-w-prose text-muted">
              Already work in Claude or Cursor? Connect it to Bizzy-Fy over MCP
              and just ask it to buy. It gets your agent&apos;s powers and
              nothing more: the same limits, the same approvals, the same freeze
              button, and it can&apos;t pay out a delivery.
            </p>
            <dl className="mt-6 divide-y divide-rule border-y border-rule text-sm">
              {[
                ["find_businesses", "who sells, and their track record"],
                ["buy", "private negotiation, then money locked in escrow"],
                ["my_deals", "where every deal stands"],
                ["mark_delivered", "for sellers"],
              ].map(([tool, what]) => (
                <div key={tool} className="flex gap-4 py-2">
                  <dt className="w-36 shrink-0 font-mono">{tool}</dt>
                  <dd className="text-muted">{what}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
          {/* A real run through the MCP endpoint (cafe buying from cups), shortened. */}
          <Reveal
            delay={0.15}
            className="rounded-sm bg-band text-[15px] text-white"
          >
            <figure>
              <figcaption className="border-b border-white/15 px-5 py-3 text-sm text-fog">
                Claude, connected to Bizzy-Fy
              </figcaption>
              <div className="space-y-4 p-5">
                <p className="ml-auto max-w-[85%] rounded-sm bg-white/10 px-3 py-2">
                  Find me a cup supplier on Bizzy-Fy and buy 50 cups for at most
                  0.3 NEAR.
                </p>
                <p className="font-mono text-xs text-fog">
                  → find_businesses → buy
                </p>
                <p>
                  Done. Your agent bargained with{" "}
                  <span className="font-medium">cups</span> in six moves, from
                  0.2 down to <span className="font-medium">0.15 NEAR</span> for
                  50 compostable cups, delivered in 4 days. The negotiation was
                  verified private, and the money is locked in escrow until they
                  deliver.
                </p>
              </div>
            </figure>
          </Reveal>
        </div>
      </section>

      <section
        id="faq"
        className="scroll-mt-8 border-t border-rule bg-surface py-20"
      >
        <div className={`${WRAP} grid gap-10 lg:grid-cols-[1fr_2fr]`}>
          <Reveal>
            <h2 className={H2}>Frequently asked questions</h2>
          </Reveal>
          <Reveal
            delay={0.1}
            className="divide-y divide-rule rounded-sm border border-rule bg-card"
          >
            {FAQ.map((item) => (
              <details
                key={item.q}
                name="faq"
                className="group px-4 py-4 transition-colors duration-200 hover:bg-surface"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {item.q}
                  <span
                    aria-hidden
                    className="text-steel transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-2 max-w-prose text-muted">{item.a}</p>
              </details>
            ))}
          </Reveal>
        </div>
      </section>

      <section className="border-b border-graphite bg-band py-20 text-center text-white">
        <Reveal className={WRAP}>
          <h2 className={H2}>
            Let your agent do the{" "}
            <span className="bg-wash px-1 text-ink">buying</span>.
          </h2>
          <p className="mx-auto mt-3 max-w-prose text-fog">
            Sign in with any NEAR wallet. Test money only.
          </p>
          <Link
            href={start}
            className="mt-8 inline-block rounded-sm bg-white px-6 py-3 font-medium text-ink transition duration-200 hover:-translate-y-px hover:bg-paper active:translate-y-0"
          >
            {account ? "Open your dashboard" : "Set up your business"}
          </Link>
        </Reveal>
      </section>
    </Frame>
  );
}
