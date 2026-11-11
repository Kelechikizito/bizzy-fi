// Bring your own agent: Claude, Cursor or any MCP client acts as a business's agent, with the agent's limits.
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { ESCROW_ID, REGISTRY_ID, txUrl } from "@/lib/near/contracts";
import { myDeals, toNear } from "@/lib/near/read";
import { db } from "@/lib/server/db";
import { companyForKey } from "@/lib/server/mcp-keys";
import { agentSigner, call, reader } from "@/lib/server/near";
import { negotiate } from "@/lib/server/negotiate";
import { SITE } from "@/lib/site";

export const maxDuration = 120;

type Ctx = { http?: { authInfo?: { clientId: string } } };
const companyOf = (ctx: Ctx) => ctx.http!.authInfo!.clientId;
const reply = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
const short = (id: string) => id.split(".")[0];

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "find_businesses",
      {
        title: "Find businesses",
        description: "Lists the businesses on Bizzy-Fy that can sell to you, with what they do and their reputation score.",
        inputSchema: z.object({}),
      },
      async (_, ctx) => {
        const me = companyOf(ctx);
        const { rows } = await (await db()).execute({ sql: "SELECT company FROM agent_keys WHERE company != ? LIMIT 30", args: [me] });
        const list = await Promise.all(
          rows.map(async (r) => {
            const id = String(r.company);
            const [c, score] = await Promise.all([
              reader.view<{ about: string; human: boolean }>(REGISTRY_ID, "get_company", { account_id: id }),
              reader.view<number>(REGISTRY_ID, "get_score", { account_id: id }),
            ]);
            return { name: short(id), about: c?.about, score, verified_human: c?.human, profile: `${SITE}/b/${short(id)}` };
          }),
        );
        return reply(list);
      },
    );

    server.registerTool(
      "buy",
      {
        title: "Buy something",
        description:
          "Your Bizzy-Fy agent negotiates privately (inside NEAR AI's sealed hardware) with a seller's agent and, if they agree, locks the money in escrow until delivery. Takes 20 to 40 seconds. Your spending limits, approvals and approved-business list still apply; deals over your limits wait for the owner's OK.",
        inputSchema: z.object({
          want: z.string().min(3).describe('What to buy, in plain words, e.g. "300 compostable cups, delivered this week"'),
          max_near: z.number().positive().describe("The most to pay in total, in NEAR"),
          seller: z.string().optional().describe("A business name from find_businesses; leave out to let the agent choose"),
        }),
      },
      async ({ want, max_near, seller }, ctx) => {
        const me = companyOf(ctx);
        if ((await reader.view<string>(me, "get_status")) !== "Active") return reply({ error: "Your agent is frozen. The owner can turn it back on in the dashboard." });
        const n = await negotiate(me, want, max_near, seller ? `${seller}.${REGISTRY_ID}` : undefined);
        return reply({
          result: { opened: "Deal made; money locked until delivery", waiting: "Agreed, but over your limits: waiting for the owner's OK in the dashboard", no_deal: "No deal", failed: "Agreed, but locking the money failed" }[n.status],
          seller: short(n.seller),
          terms: n.terms && { item: n.terms.item, quantity: n.terms.quantity, price_near: n.terms.price_near, delivery_days: n.terms.delivery_days },
          moves: n.turns.map((t) => `${t.side}: ${t.offer.action === "offer" ? `${t.offer.price_near} NEAR` : t.offer.action}. ${t.offer.note}`),
          verified_private: n.proof.verified,
          problem: n.problem,
          receipts: Object.fromEntries(Object.entries(n.receipts).map(([k, h]) => [k, txUrl(h!)])),
          dashboard: `${SITE}/dashboard`,
        });
      },
    );

    server.registerTool(
      "my_deals",
      {
        title: "My deals",
        description: "Lists your deals in escrow (buying and selling), where each one is, and a link to its page.",
        inputSchema: z.object({}),
      },
      async (_, ctx) => {
        const me = companyOf(ctx);
        const deals = (await myDeals(me)).slice(0, 20);
        return reply(deals.map(([id, d]) => ({ deal_id: id, side: d.buyer === me ? "buying" : "selling", with: short(d.buyer === me ? d.seller : d.buyer), amount_near: toNear(d.amount), status: d.status, page: `${SITE}/deals/${id}` })));
      },
    );

    server.registerTool(
      "mark_delivered",
      {
        title: "Mark delivered",
        description: "As the seller, says you delivered a deal. The buyer then has an hour to check it before you're paid.",
        inputSchema: z.object({ deal_id: z.string().describe("From my_deals") }),
      },
      async ({ deal_id }, ctx) => {
        const me = companyOf(ctx);
        const deal = await reader.view<{ seller: string; status: string }>(ESCROW_ID, "get_deal", { id: deal_id });
        if (deal?.seller !== me || deal.status !== "Accepted") return reply({ error: "You can only mark your own accepted sales as delivered." });
        const { hash } = await call(await agentSigner(me), me, "deal_action", { method: "mark_delivered", args: { id: deal_id } }, "100 Tgas");
        return reply({ result: "Marked delivered", receipt: txUrl(hash) });
      },
    );
  },
  { serverInfo: { name: "bizzy-fy", version: "1.0.0" } },
);

/** Each request must carry a business's connection key; the key decides which business the tools act for. */
const authed = withMcpAuth(
  handler,
  async (_, token) => {
    const company = token ? await companyForKey(token) : null;
    return company ? { token: token!, clientId: company, scopes: ["agent"] } : undefined;
  },
  { required: true },
);

export { authed as GET, authed as POST };
