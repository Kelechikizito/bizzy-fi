// Team treasury: a Sputnik DAO multisig (what Trezu is built on) holding savings the agent can't touch.
import { reader } from "./read.ts";

export const FACTORY = "sputnikv2.testnet";
/** The factory's price for one treasury (mostly storage for the DAO's code). */
export const CREATE_COST = "5.5 NEAR";

export type Transfer = { Transfer: { token_id: string; receiver_id: string; amount: string; msg: null } };
export type Proposal = {
  id: number;
  proposer: string;
  description: string;
  kind: Transfer | Record<string, unknown>;
  status: string;
  votes: Record<string, string>;
};

/** Each business's treasury lives at a fixed address, so nothing needs storing. */
export const treasuryName = (company: string) => `bizzy-${company.split(".")[0]}`;
export const treasuryId = (company: string) => `${treasuryName(company)}.${FACTORY}`;

/** The factory's `create` args: every member can propose, and more than half must approve. */
export function createArgs(company: string, members: string[]) {
  const policy = {
    roles: [{ name: "Team", kind: { Group: members }, permissions: ["*:*"], vote_policy: {} }],
    default_vote_policy: { weight_kind: "RoleWeight", quorum: "0", threshold: [1, 2] },
    proposal_bond: "0",
    proposal_period: "604800000000000",
    bounty_bond: "0",
    bounty_forgiveness_period: "604800000000000",
  };
  const config = { name: treasuryName(company), purpose: `Savings for ${company}`, metadata: "" };
  return { name: treasuryName(company), args: btoa(JSON.stringify({ config, policy })) };
}

/** A transfer out of the treasury, as a proposal kind. */
export const transfer = (receiver_id: string, amount: string): Transfer => ({ Transfer: { token_id: "", receiver_id, amount, msg: null } });

/** The treasury's balance, members and open requests, or null if it doesn't exist yet. */
export async function loadTreasury(company: string) {
  const id = treasuryId(company);
  if (!(await reader.accountExists(id))) return null;
  const view = <T>(method: string, args = {}) => reader.view(id, method, args) as Promise<T>;
  const [policy, last, balance] = await Promise.all([
    view<{ roles: { kind: { Group?: string[] } }[] }>("get_policy"),
    view<number>("get_last_proposal_id"),
    reader.getBalance(id),
  ]);
  const proposals = await view<Proposal[]>("get_proposals", { from_index: Math.max(0, last - 20), limit: 20 });
  return {
    id,
    balance,
    nextId: last,
    members: policy.roles.flatMap((r) => r.kind.Group ?? []),
    open: proposals.filter((p) => p.status === "InProgress").reverse(),
  };
}
