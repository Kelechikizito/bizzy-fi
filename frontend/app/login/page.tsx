"use client";
import { useEffect } from "react";
import { Button, Frame, Problem } from "@/components/ui";
import { findCompany } from "@/lib/near/read";
import { useSession } from "@/lib/wallet";

export default function Login() {
  const { account, busy, error, signInWithWallet } = useSession();

  // Once signed in, go to the dashboard, or to sign-up if there's no business yet.
  useEffect(() => {
    if (!account) return;
    void findCompany(account).then((company) =>
      location.replace(company ? "/dashboard" : `/start${location.search}`),
    );
  }, [account]);

  return (
    <Frame>
      <h1 className="font-display text-4xl font-bold">
        Sign in with your NEAR wallet
      </h1>
      <p className="mt-3 text-muted">
        Pick a NEAR wallet that supports testnet, such as Meteor, MyNearWallet
        or Intear. It asks you to sign one message to prove the account is
        yours. That costs nothing.
      </p>
      <Button
        onClick={() => void signInWithWallet()}
        disabled={busy || !!account}
        className="mt-8 w-full py-4 text-lg"
      >
        {busy || account ? "Signing you in…" : "Connect a NEAR wallet"}
      </Button>
      <p className="mt-6 text-sm text-muted">
        No wallet yet?{" "}
        <a
          href="https://wallet.meteorwallet.app"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-4 hover:text-ink"
        >
          Make a free one with Meteor
        </a>{" "}
        in a minute, then come back.
      </p>
      <Problem text={error} />
    </Frame>
  );
}
