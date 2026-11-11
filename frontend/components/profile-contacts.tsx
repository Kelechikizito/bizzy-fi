"use client";
// What the business shows on its public profile: website, email, X, Telegram, phone, location. All optional.
import { useEffect, useState } from "react";
import { Button, Problem } from "@/components/ui";
import { api } from "@/lib/wallet";

const FIELDS = [
  ["website", "Website", "yourshop.com"],
  ["email", "Email", "orders@yourshop.com"],
  ["x", "X", "@yourshop"],
  ["telegram", "Telegram", "@yourshop"],
  ["phone", "Phone", "+234 …"],
  ["location", "Location", "Lagos, Nigeria"],
] as const;

/** The contact-details editor for `company`'s public profile. */
export function ProfileContacts({ company }: { company: string }) {
  const [c, setC] = useState<Record<string, string> | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const path = `/api/companies/${company}/contacts`;
  useEffect(() => void api<{ contacts: Record<string, string> }>(path).then((r) => setC(r.contacts), (e) => setError(e.message)), [path]);
  if (!c) return <Problem text={error} />;
  return (
    <div className="mt-6">
      <p className="font-medium">Contact details on your public profile</p>
      <p className="text-sm text-muted">Optional. Anyone can see what you fill in here; leave a box empty to hide it.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {FIELDS.map(([k, label, hint]) => (
          <label key={k} className="flex items-center gap-3 rounded-lg border border-rule bg-card px-4">
            <span className="w-20 shrink-0 text-sm text-muted">{label}</span>
            <input value={c[k] ?? ""} placeholder={hint} onChange={(e) => (setC({ ...c, [k]: e.target.value }), setSaved(false))} className="min-w-0 flex-1 bg-transparent py-3 outline-none" />
          </label>
        ))}
      </div>
      <Button variant="plain" className="mt-3" onClick={() => void api<{ contacts: Record<string, string> }>(path, { contacts: c }).then((r) => (setC(r.contacts), setSaved(true)), (e) => setError(e.message))}>
        {saved ? "Saved" : "Save contact details"}
      </Button>
      <Problem text={error} />
    </div>
  );
}
