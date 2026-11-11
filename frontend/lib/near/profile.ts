// A business's public record, for its profile page and share image.
import { companyId, REGISTRY_ID } from "./contracts.ts";
import { getCompany, reader, toNear } from "./read.ts";

/** Everything public about `name`, or null if there's no such business. */
export async function loadProfile(name: string) {
  const id = companyId(name);
  const [company, score] = await Promise.all([getCompany(id), reader.view<number>(REGISTRY_ID, "get_score", { account_id: id })]);
  if (!company) return null;
  const r = company.reputation;
  return {
    id,
    name,
    about: company.about,
    human: company.human,
    score: score ?? 0,
    deals: r.on_time + r.late,
    onTime: r.on_time,
    partners: r.counterparties,
    volume: toNear(r.volume),
    disputesLost: r.disputes_lost,
    referrals: company.referrals,
  };
}
