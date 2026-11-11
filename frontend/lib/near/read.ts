// Public reads from the contracts, used by the browser.
import { Near } from "near-kit";
import { companyId, ESCROW_ID, NETWORK, REGISTRY_ID } from "./contracts.ts";

export const reader = new Near({ network: NETWORK });

export type Limits = { per_deal_cap: string; period_cap: string; period_length_ns: string; allowlist_only: boolean };
export type Company = {
  guardian: string;
  about: string;
  human: boolean;
  kyb: boolean;
  referrals: number;
  reputation: { on_time: number; late: number; disputes_won: number; disputes_lost: number; counterparties: number; volume: string };
};
export type Deal = { buyer: string; seller: string; amount: string; status: string; deliver_by: string; updated_at: string };
export type Approval = { deal: { seller: string }; amount: string; created_at: string };

const YOCTO = 10n ** 24n;

/** yoctoNEAR → "1.25". */
export const toNear = (yocto: string) => (Number(BigInt(yocto) / 10n ** 20n) / 1e4).toLocaleString("en", { maximumFractionDigits: 4 });
/** 1.25 → yoctoNEAR. */
export const toYocto = (near: number) => ((BigInt(Math.round(near * 1e4)) * YOCTO) / 10_000n).toString();

export const getCompany = (id: string) => reader.view<Company | null>(REGISTRY_ID, "get_company", { account_id: id });

/** The company this person guards, if any. */
export async function findCompany(guardian: string): Promise<string | null> {
  for (let from_index = 0; ; from_index += 100) {
    const page = (await reader.view<[string, Company][]>(REGISTRY_ID, "get_companies", { from_index, limit: 100 })) ?? [];
    const mine = page.find(([, c]) => c.guardian === guardian);
    if (mine) return mine[0];
    if (page.length < 100) return null;
  }
}

/** Everything the dashboard shows, read in parallel. */
export async function loadDashboard(id: string) {
  const view = <T>(method: string, args = {}) => reader.view<T>(id, method, args) as Promise<T>;
  const [company, score, available, spent, limits, status, agentKey, unfreezeAt, approvals, deals] = await Promise.all([
    getCompany(id),
    reader.view<number>(REGISTRY_ID, "get_score", { account_id: id }) as Promise<number>,
    view<string>("get_available_balance"),
    view<string>("get_spent_this_period"),
    view<Limits>("get_limits"),
    view<"Active" | "Suspended">("get_status"),
    view<string | null>("get_agent_key"),
    view<string>("get_unfreeze_at"),
    view<[string, Approval][]>("get_pending_approvals", { from_index: 0, limit: 20 }),
    myDeals(id),
  ]);
  return { company: company!, score, available, spent, limits, status, agentKey, unfreezeAt: Number(BigInt(unfreezeAt) / 1_000_000n), approvals, deals };
}

/** Every escrow deal `id` is buying or selling in, newest first. */
export async function myDeals(id: string) {
  const all: [string, Deal][] = [];
  for (let from_index = 0; ; from_index += 100) {
    const page = (await reader.view<[string, Deal][]>(ESCROW_ID, "get_deals", { from_index, limit: 100 })) ?? [];
    all.push(...page.filter(([, d]) => d.buyer === id || d.seller === id));
    if (page.length < 100) return all.reverse();
  }
}

/** True if nobody has this business name yet. */
export const nameFree = async (name: string) => !(await getCompany(companyId(name)));
