"use client";
import { useEffect } from "react";
import { Button, Frame, Problem } from "@/components/ui";
import { findCompany } from "@/lib/near/read";
import { useSession } from "@/lib/wallet";

export default function Login() {
  const { account, busy, error, google, signInWithGoogle, signInWithWallet } =
    useSession();

  // Once signed in, go to the dashboard, or to sign-up if there's no business yet.
  useEffect(() => {
    if (!account) return;
    void findCompany(account).then((company) =>
      location.replace(company ? "/dashboard" : `/start${location.search}`),
    );
  }, [account]);

  const working = busy || !!account;
  const wallet = (
    <>
      <Button
        variant={google ? "plain" : "main"}
        onClick={() => void signInWithWallet()}
        disabled={working}
        className="mt-4 w-full py-4 text-lg"
      >
        {working && !google
          ? "Signing you in…"
          : google
            ? "I have a NEAR wallet"
            : "Connect a NEAR wallet"}
      </Button>
      <p className="mt-6 text-sm text-muted">
        {google
          ? "Wallets that support testnet work, such as Meteor, MyNearWallet or Intear. "
          : "No wallet yet? "}
        {!google && (
          <>
            <a
              href="https://wallet.meteorwallet.app"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4 hover:text-ink"
            >
              Make a free one with Meteor
            </a>{" "}
            in a minute, then come back.
          </>
        )}
      </p>
    </>
  );

  return (
    <Frame>
      <h1 className="font-display text-4xl font-bold">
        {google
          ? "Sign in or create an account"
          : "Sign in with your NEAR wallet"}
      </h1>
      <p className="mt-3 text-muted">
        {google
          ? "Use your Google account and we make a NEAR account for you, with no seed phrase. NEAR Auth opens a small window each time you approve something."
          : "Pick a NEAR wallet that supports testnet, such as Meteor, MyNearWallet or Intear. It asks you to sign one message to prove the account is yours. That costs nothing."}
      </p>
      {google && (
        <Button
          onClick={() => void signInWithGoogle()}
          disabled={working}
          className="mt-8 w-full py-4 text-lg"
        >
          {working ? "Signing you in…" : "Continue with Google"}
        </Button>
      )}
      <div className={google ? "" : "mt-4"}>{wallet}</div>
      <Problem text={error} />
    </Frame>
  );
}
