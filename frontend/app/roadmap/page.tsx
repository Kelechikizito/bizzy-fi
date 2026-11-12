// The roadmap: what's live today and what we'd build next, one linkable section per item.
import type { Metadata } from "next";
import { Frame } from "@/components/ui";

export const metadata: Metadata = { title: "Roadmap · Bizzy-Fy", description: "What's live on testnet today and what Bizzy-Fy builds next." };

type Item = { id: string; title: string; when: "Next" | "Before mainnet" | "Later"; now: string; plan: string[] };

const ITEMS: Item[] = [
  {
    id: "mainnet",
    title: "Mainnet launch",
    when: "Before mainnet",
    now: "Everything runs on NEAR testnet with test money. The registry and escrow accounts still have full-access keys so we can update them.",
    plan: [
      "An outside audit of the three contracts, then delete the registry and escrow full-access keys so nobody, including us, can change them.",
      "A small fee per deal so the escrow's storage pays for itself, and finished deals cleaned up.",
      "Review, dispute and freeze windows of days instead of the demo's one hour.",
    ],
  },
  {
    id: "treasury",
    title: "Confidential treasury on mainnet",
    when: "Before mainnet",
    now: "Each business's team treasury is a Sputnik DAO multisig: savings the agent can't touch. On testnet its balance is public.",
    plan: [
      "On mainnet, open each treasury as a Trezu confidential treasury on NEAR's private shard, so competitors can't see your balance or who you pay.",
      "Agent spending accounts topped up from the treasury only with the team's approval.",
    ],
  },
  {
    id: "social-login",
    title: "Google and social login on mainnet",
    when: "Before mainnet",
    now: "Continue with Google works through NEAR Auth on localhost. NEAR Auth's shared testnet login doesn't accept other sites yet, so the hosted site uses NEAR wallets.",
    plan: [
      "Get our domain approved by NEAR Auth, then turn it on with one setting. No code change.",
      "Email and passkey sign-in, so a café owner never sees a wallet or seed phrase.",
      "Move sign-in to NEAR Auth's signed messages once its SDK publishes them.",
    ],
  },
  {
    id: "kyb",
    title: "Know your business (KYB)",
    when: "Next",
    now: "The registry already has a KYB attestation and profiles show it as quest 2 of 4, but nothing sets it yet.",
    plan: [
      "Domain check: add a DNS record to prove you control your business website. Only a fingerprint of the domain goes on chain.",
      "Company register lookup (Companies House, Nigeria's CAC, OpenCorporates) to show the business is registered and active.",
      "Full KYB through a provider such as Sumsub, Persona or Middesk: owners, directors and sanctions screening, re-checked daily.",
      "Documents never stored by us. The check runs in sealed hardware (TEE), and only \"passed\", the level, the checker and an expiry go on chain.",
      "Several trusted checkers, attestations that expire and can be revoked, and a spending rule: \"my agent only deals with verified businesses above 1,000\".",
      "Verify once, trusted by every partner: vendor onboarding from about three weeks to one click.",
    ],
  },
  {
    id: "netting",
    title: "Netting",
    when: "Later",
    now: "Every deal settles on its own.",
    plan: ["Businesses that trade both ways settle only the difference each period, with deposits as collateral. Fewer payments, and fewer of them public."],
  },
  {
    id: "stablecoins",
    title: "Stablecoin deals from any chain",
    when: "Later",
    now: "Deals are priced and paid in NEAR.",
    plan: ["Price in USDC and let the buyer pay from any chain through NEAR Intents, while the escrow still settles on NEAR."],
  },
  {
    id: "credit",
    title: "Credit from trade history",
    when: "Later",
    now: "Every settled deal is already an on-chain payment record that can't be faked.",
    plan: ["Let lenders offer working capital to businesses with a strong record. This matters most where banks don't serve small traders."],
  },
  {
    id: "agent-market",
    title: "Agents on NEAR's Agent Market",
    when: "Later",
    now: "A business's agent buys only for that business, or for an outside AI over MCP.",
    plan: ["List agents on Agent Market so other businesses can hire them by the job."],
  },
];

export default function Page() {
  return (
    <Frame wide>
      <h1 className="font-display text-4xl font-bold">Roadmap</h1>
      <p className="mt-2 max-w-prose text-muted">What&apos;s live on testnet today, and what we build next. Each item has its own link to share.</p>
      <nav className="mt-6 flex flex-wrap gap-2 text-sm">
        {ITEMS.map((item) => (
          <a key={item.id} href={`#${item.id}`} className="rounded-sm border border-rule px-3 py-1 hover:border-ink">
            {item.title}
          </a>
        ))}
      </nav>
      <ol className="mt-10 space-y-12">
        {ITEMS.map((item) => (
          <li key={item.id} id={item.id} className="scroll-mt-8 border-t-2 border-ink pt-6">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted">{item.when}</p>
            <h2 className="mt-2 font-display text-2xl font-bold">
              <a href={`#${item.id}`} className="hover:underline">
                {item.title}
              </a>
            </h2>
            <p className="mt-3 text-muted">
              <span className="font-medium text-ink">Today: </span>
              {item.now}
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-5">
              {item.plan.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </Frame>
  );
}
