"use client";
// "Prove you're human" with World ID Selfie Check (phone camera, no Orb); the server checks the proof and writes it to the registry.
import { IDKitRequestWidget, type RpContext, selfieCheck } from "@worldcoin/idkit";
import { useState } from "react";
import { api } from "@/lib/wallet";

type Request = { app_id: `app_${string}`; action: string; environment: "production" | "staging" | "sandbox"; rp_context: RpContext };

const PILL = "rounded-sm border border-ink px-3 py-1 hover:bg-ink hover:text-white";

export function WorldIdButton({ company, onDone, className = PILL }: { company: string; onDone(): void; className?: string }) {
  const [request, setRequest] = useState<Request | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setError(null);
    try {
      setRequest(await api<Request>("/api/world-id/rp-signature"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <button onClick={() => void start()} className={className}>
        Verify you&apos;re human
      </button>
      {error && <span className="text-sm text-stop">{error}</span>}
      {request && (
        <IDKitRequestWidget
          {...request}
          allow_legacy_proofs={false}
          preset={selfieCheck()}
          open
          onOpenChange={(open) => !open && setRequest(null)}
          handleVerify={async (result) => void (await api(`/api/companies/${company}/world-id`, result))}
          onSuccess={onDone}
          onError={(code) => setError(`World ID stopped: ${code}`)}
        />
      )}
    </>
  );
}
