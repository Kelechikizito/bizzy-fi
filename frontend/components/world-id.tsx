"use client";
// "Prove you're human" with World ID Selfie Check (phone camera, no Orb); the server checks the proof and writes it to the registry.
import { IDKitRequestWidget, type RpContext, selfieCheckLegacy } from "@worldcoin/idkit";
import { useState } from "react";
import { api } from "@/lib/wallet";

type Request = { app_id: `app_${string}`; action: string; environment: "production" | "staging" | "sandbox"; rp_context: RpContext };

const PILL = "rounded-sm border border-ink px-3 py-1 hover:bg-ink hover:text-white";

export function WorldIdButton({ company, onDone, className = PILL }: { company: string; onDone(): void; className?: string }) {
  const [request, setRequest] = useState<Request | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slot, setSlot] = useState(1);

  const start = async (next = slot) => {
    setError(null);
    try {
      setRequest(await api<Request>("/api/world-id/rp-signature", { slot: next }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  /** A used slot means this person already verified another business: move to their next one, up to 3. */
  const stopped = (code: string) => {
    setRequest(null);
    if (code !== "nullifier_replayed") return setError(`World ID stopped: ${code}`);
    if (slot >= 3) return setError("Your World ID has already verified 3 businesses, the most one person can.");
    setSlot(slot + 1);
    setError(`You've verified ${slot === 1 ? "a business" : `${slot} businesses`} before. Press verify and scan once more to use your next slot (up to 3).`);
  };

  return (
    <>
      <button onClick={() => void start(slot)} className={className}>
        Verify you&apos;re human
      </button>
      {error && <span className="text-sm text-stop">{error}</span>}
      {request && (
        <IDKitRequestWidget
          {...request}
          // Selfie Check in the World App today is a World ID 3.0 credential, which IDKit calls "legacy".
          allow_legacy_proofs
          preset={selfieCheckLegacy()}
          open
          onOpenChange={(open) => !open && setRequest(null)}
          handleVerify={async (result) => void (await api(`/api/companies/${company}/world-id`, result))}
          onSuccess={onDone}
          onError={(code) => stopped(String(code))}
        />
      )}
    </>
  );
}
