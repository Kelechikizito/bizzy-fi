"use client";
import { useEffect } from "react";
import { Button, Frame, Problem } from "@/components/ui";
import { findCompany } from "@/lib/near/read";
import { useSession } from "@/lib/wallet";

export default function Login() {
  const { account, busy, error, signInWithPrivy, signInWithWallet } = useSession();

  // Once signed in, go to the dashboard, or to sign-up if there's no business yet.
  useEffect(() => {
    if (!account) return;
    void findCompany(account).then((company) => location.replace(company ? "/dashboard" : `/start${location.search}`));
  }, [account]);

  return (
    <Frame>
      <h1 className="font-display text-4xl font-bold tracking-tight">Sign in or create an account</h1>
      <p className="mt-3 text-muted">No wallet or app needed. We make a secure account for you.</p>
      <Button onClick={signInWithPrivy} disabled={busy || !!account} className="mt-8 w-full py-4 text-lg">
        {busy || account ? "Signing you in…" : "Continue with Google, email or passkey"}
      </Button>
      <button
        onClick={() => void signInWithWallet()}
        disabled={busy || !!account}
        className="mt-6 text-sm text-muted underline underline-offset-4 disabled:opacity-40"
      >
        I already have a NEAR account
      </button>
      <Problem text={error} />
    </Frame>
  );
}
