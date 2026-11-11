"use client";
// "Already agreed a deal?": the buyer types the terms, the money is locked, and the seller accepts on the deal page.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Problem } from "@/components/ui";
import { api } from "@/lib/wallet";

const FIELD = "rounded-lg border border-rule bg-card px-4 py-3 outline-none focus:border-ink";

/** The direct-deal form for buyer `company`. */
export function DirectDeal({ company, onDone }: { company: string; onDone(): void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ seller: "", item: "", quantity: 100, price_near: 0.5, delivery_days: 7 });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.type === "number" ? Number(e.target.value) : e.target.value });

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ status: string; deal?: string }>(`/api/companies/${company}/direct-deal`, f);
      if (r.deal) return router.push(`/deals/${r.deal}`);
      setNote("It's over your limits, so it's waiting for your OK above. Once you approve, the seller can accept.");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="font-medium underline-offset-4 hover:underline">
        {open ? "−" : "+"} Already agreed a deal with a business? Lock the money here
      </button>
      {open && (
        <form
          className="mt-3 grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <p className="text-sm text-muted sm:col-span-2">
            For deals you made in person or by phone. No AI bargaining: the money is locked in escrow, the terms stay private between you two, and the seller accepts on the deal page.
          </p>
          <input required value={f.seller} onChange={set("seller")} placeholder="Their business name, e.g. cups" aria-label="Seller's business name" className={FIELD} />
          <input required value={f.item} onChange={set("item")} placeholder="What, e.g. compostable cups" aria-label="Item" className={FIELD} />
          {(
            [
              ["quantity", "Quantity", 1, 1],
              ["price_near", "Total price (NEAR)", 0.1, 0.01],
              ["delivery_days", "Days to deliver", 1, 1],
            ] as const
          ).map(([k, label, min, step]) => (
            <label key={k} className="flex items-center justify-between gap-3 rounded-lg border border-rule bg-card px-4">
              <span className="text-sm text-muted">{label}</span>
              <input type="number" required min={min} step={step} value={f[k]} onChange={set(k)} className="w-24 bg-transparent py-3 text-right outline-none" />
            </label>
          ))}
          <Button disabled={busy}>{busy ? "Locking the money…" : "Lock the money"}</Button>
          {note && <p className="text-sm sm:col-span-2">{note}</p>}
          <div className="sm:col-span-2">
            <Problem text={error} />
          </div>
        </form>
      )}
    </div>
  );
}
