"use client";
// Sign-in and signing with a NEAR wallet, through NEAR Connect (HOT, Meteor, MyNearWallet and others).
import { NearConnector } from "@hot-labs/near-connect";
import { base64 } from "@scure/base";
import { fromNearConnect, Near } from "near-kit";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { NETWORK } from "./near/contracts.ts";

export type Call = {
  method: string;
  args?: object;
  deposit?: string;
  gas?: string;
};
type Signed = { accountId: string; publicKey: string; signature: string };
type Wallet = {
  accountId: string;
  signMessage(p: {
    message: string;
    recipient: string;
    nonce: Uint8Array;
  }): Promise<Signed>;
  near: Near;
};
type Session = {
  /** The signed-in account, null when signed out, undefined while checking. */
  account: string | null | undefined;
  busy: boolean;
  error: string | null;
  signInWithWallet(): Promise<void>;
  signOut(): Promise<void>;
  /** Signs and sends one transaction to `receiverId`; returns its hash and the last call's return value. */
  send(
    receiverId: string,
    calls: Call[],
    transfer?: string,
  ): Promise<{ hash: string; value: unknown }>;
};

const SessionContext = createContext<Session | null>(null);

/** POSTs JSON to our API and throws its error message. */
export async function api<T = Record<string, unknown>>(
  path: string,
  body: object = {},
): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Something went wrong");
  return data;
}

let connector: NearConnector | undefined;
const getConnector = () =>
  (connector ??= new NearConnector({
    network: NETWORK,
    features: { signMessage: true, testnet: true },
  }));

/** An existing NEAR wallet through NEAR Connect; `connect` opens the wallet picker. */
async function connectWallet(connect: boolean): Promise<Wallet | null> {
  const c = getConnector();
  const wallet = connect
    ? await c.connect()
    : (await c.getConnectedWallet().catch(() => null))?.wallet;
  const accountId = (await wallet?.getAccounts())?.[0]?.accountId;
  if (!wallet || !accountId) return null;
  return {
    accountId,
    near: new Near({ network: NETWORK, wallet: fromNearConnect(c) }),
    signMessage: (p) =>
      wallet.signMessage({ ...p, signerId: accountId }) as Promise<Signed>,
  };
}

function SessionProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<string | null | undefined>(undefined);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Proves the account to our server, then tops up a new testnet account. */
  const startSession = useCallback(async (w: Wallet) => {
    const challenge = await api<{
      nonce: string;
      message: string;
      recipient: string;
    }>("/api/auth/challenge");
    const signed = await w.signMessage({
      message: challenge.message,
      recipient: challenge.recipient,
      nonce: base64.decode(challenge.nonce),
    });
    await api("/api/auth/verify", { nonce: challenge.nonce, signed });
    await api("/api/sponsor").catch(() => null);
    setWallet(w);
    setAccount(w.accountId);
  }, []);

  const run = useCallback(async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  // On load: the server session says who is signed in; rebuild that account's signer.
  useEffect(() => {
    if (account !== undefined) return;
    void (async () => {
      const me = await fetch("/api/me")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      const w = me?.account ? await connectWallet(false) : null;
      if (me?.account && w?.accountId === me.account) {
        setWallet(w);
        setAccount(me.account);
      } else setAccount(null);
    })();
  }, [account]);

  const session = useMemo<Session>(
    () => ({
      account,
      busy,
      error,
      signInWithWallet: () =>
        run(async () => {
          const w = await connectWallet(true);
          if (!w) throw new Error("No account was connected");
          await startSession(w);
        }),
      signOut: async () => {
        await api("/api/auth/logout").catch(() => null);
        await getConnector()
          .disconnect()
          .catch(() => null);
        setWallet(null);
        setAccount(null);
      },
      async send(receiverId, calls, transfer) {
        if (!wallet) throw new Error("Please sign in again");
        let tx = wallet.near.transaction(wallet.accountId);
        for (const c of calls) {
          tx = tx.functionCall(receiverId, c.method, c.args ?? {}, {
            gas: (c.gas ?? "30 Tgas") as "30 Tgas",
            ...(c.deposit && { attachedDeposit: c.deposit as "1 yocto" }),
          });
        }
        if (transfer) tx = tx.transfer(receiverId, transfer as "1 NEAR");
        const result = await tx.send({ waitUntil: "FINAL" });
        const raw = (result.status as { SuccessValue?: string }).SuccessValue;
        return {
          hash: result.transaction.hash,
          value: raw ? JSON.parse(atob(raw)) : undefined,
        };
      },
    }),
    [account, busy, error, run, startSession, wallet],
  );

  return <SessionContext value={session}>{children}</SessionContext>;
}

export function Providers({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}

export function useSession(): Session {
  const session = use(SessionContext);
  if (!session) throw new Error("useSession needs <Providers>");
  return session;
}
