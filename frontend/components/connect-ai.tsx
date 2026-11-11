"use client";
// Connect your own AI (Claude, Cursor) as your agent: make a key, see it once, paste the setup.
import { useEffect, useState } from "react";
import { Button, Problem } from "@/components/ui";
import { api } from "@/lib/wallet";

/** The connection-key box for `company`. */
export function ConnectAi({ company }: { company: string }) {
  const [active, setActive] = useState<boolean | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [tab, setTab] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const path = `/api/companies/${company}/mcp-key`;

  useEffect(() => void api<{ active: boolean }>(path).then((r) => setActive(r.active), (e) => setError(e.message)), [path]);

  const run = (action: "create" | "revoke") =>
    api<{ active: boolean; key?: string }>(path, { action }).then(
      (r) => (setActive(r.active), setKey(r.key ?? null)),
      (e) => setError(e.message),
    );

  const url = typeof location === "undefined" ? "" : `${location.origin}/api/mcp`;
  const k = key ?? "YOUR_KEY";
  const setups = [
    { name: "Claude Code", text: `claude mcp add --transport http bizzy-fy ${url} --header "Authorization: Bearer ${k}"` },
    { name: "Claude Desktop", text: JSON.stringify({ mcpServers: { "bizzy-fy": { command: "npx", args: ["-y", "mcp-remote", url, "--header", `Authorization: Bearer ${k}`] } } }, null, 2) },
    { name: "Cursor", text: JSON.stringify({ mcpServers: { "bizzy-fy": { url, headers: { Authorization: `Bearer ${k}` } } } }, null, 2) },
  ];

  if (active === null) return <Problem text={error} />;
  return (
    <section className="mt-10">
      <h2 className="font-display text-2xl font-bold">Use your own AI as your agent</h2>
      <p className="mt-1 max-w-prose text-muted">
        Connect Claude, Cursor or any MCP app, then just ask it to buy. It gets your agent&apos;s powers only: your limits, approvals and Freeze button still apply, and it can&apos;t pay
        out a delivery.
      </p>

      {key && (
        <div className="mt-4 rounded-lg border-l-4 border-wait bg-card px-4 py-3">
          <p className="font-medium">Your key (shown once, keep it secret):</p>
          <code className="mt-1 block break-all text-sm">{key}</code>
        </div>
      )}

      {active && (
        <div className="mt-4">
          <div className="flex flex-wrap gap-2" role="tablist">
            {setups.map((s, i) => (
              <button key={s.name} role="tab" aria-selected={tab === i} onClick={() => setTab(i)} className={`rounded-full px-3 py-1 text-sm ${tab === i ? "bg-ink text-paper" : "border border-rule"}`}>
                {s.name}
              </button>
            ))}
          </div>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-ink p-4 text-sm text-paper">{setups[tab].text}</pre>
          <p className="mt-2 text-sm text-muted">Then try: &quot;Find me a cup supplier on Bizzy-Fy and buy 100 cups for at most 0.5 NEAR.&quot;</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant={active ? "plain" : "main"} onClick={() => void run("create")}>
          {active ? "Make a new key (the old one stops working)" : "Make a connection key"}
        </Button>
        {active && (
          <Button variant="plain" onClick={() => void run("revoke")}>
            Turn off
          </Button>
        )}
      </div>
      <Problem text={error} />
    </section>
  );
}
