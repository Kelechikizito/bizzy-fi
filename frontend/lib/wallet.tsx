"use client";
// Sign-in and signing: Google through NEAR Auth, or an existing NEAR wallet through NEAR Connect (Meteor, MyNearWallet and others).
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
type Result = { hash: string; value: unknown };
/** Whatever signs for the signed-in account: a NEAR Connect wallet or a NEAR Auth (Google) login. */
export type Wallet = {
  accountId: string;
  send(receiverId: string, calls: Call[], transfer?: string): Promise<Result>;
};
type Session = {
  /** The signed-in account, null when signed out, undefined while checking. */
  account: string | null | undefined;
  busy: boolean;
  error: string | null;
  /** True where Google sign-in (NEAR Auth) is available. */
  google: boolean;
  signInWithGoogle(): Promise<void>;
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
const KIND = "bizzy_signin";
const nearAuth = () => import("./near-auth.ts");

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
async function connectWallet(
  connect: boolean,
): Promise<
  | (Wallet & {
      signMessage(p: {
        message: string;
        recipient: string;
        nonce: Uint8Array;
      }): Promise<Signed>;
    })
  | null
> {
  const c = getConnector();
  const wallet = connect
    ? await c.connect()
    : (await c.getConnectedWallet().catch(() => null))?.wallet;
  const accountId = (await wallet?.getAccounts())?.[0]?.accountId;
  if (!wallet || !accountId) return null;
  // near-kit and NEAR Connect type the same wallet against different near-api-js versions; they match at runtime.
  const near = new Near({
    network: NETWORK,
    wallet: fromNearConnect(
      c as unknown as Parameters<typeof fromNearConnect>[0],
    ),
  });
  return {
    accountId,
    signMessage: (p) =>
      wallet.signMessage({ ...p, signerId: accountId }) as Promise<Signed>,
    async send(receiverId, calls, transfer) {
      let tx = near.transaction(accountId);
      for (const call of calls) {
        tx = tx.functionCall(receiverId, call.method, call.args ?? {}, {
          gas: (call.gas ?? "30 Tgas") as "30 Tgas",
          ...(call.deposit && { attachedDeposit: call.deposit as "1 yocto" }),
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
  };
}

function SessionProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<string | null | undefined>(undefined);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [google, setGoogle] = useState(false);

  /** Proves a NEAR Connect account to our server with a signed message. */
  const proveWallet = useCallback(
    async (w: NonNullable<Awaited<ReturnType<typeof connectWallet>>>) => {
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
    },
    [],
  );

  /** Tops up a new testnet account, then marks it signed in. */
  const finish = useCallback(async (w: Wallet, kind: "google" | "wallet") => {
    await api("/api/sponsor").catch(() => null);
    localStorage.setItem(KIND, kind);
    setWallet(w);
    setAccount(w.accountId);
  }, []);

  // Google sign-in shows only where NEAR Auth accepts this address; load its code early so its window opens straight from the click.
  useEffect(() => {
    void nearAuth().then((m) => {
      if (m.nearAuthEnabled()) setGoogle(true);
    });
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
      const kind = localStorage.getItem(KIND);
      const w = !me?.account
        ? null
        : kind === "google"
          ? await nearAuth()
              .then((m) => m.restoreGoogle(me.account))
              .catch(() => null)
          : await connectWallet(false);
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
      google,
      signInWithGoogle: () =>
        run(async () => {
          const w = await (await nearAuth()).signInWithGoogle();
          await finish(w, "google");
        }),
      signInWithWallet: () =>
        run(async () => {
          const w = await connectWallet(true);
          if (!w) throw new Error("No account was connected");
          await proveWallet(w);
          await finish(w, "wallet");
        }),
      signOut: async () => {
        await api("/api/auth/logout").catch(() => null);
        if (localStorage.getItem(KIND) === "google")
          await (await nearAuth()).signOutGoogle();
        else
          await getConnector()
            .disconnect()
            .catch(() => null);
        localStorage.removeItem(KIND);
        setWallet(null);
        setAccount(null);
      },
      send(receiverId, calls, transfer) {
        if (!wallet) throw new Error("Please sign in again");
        return wallet.send(receiverId, calls, transfer);
      },
    }),
    [account, busy, error, finish, google, proveWallet, run, wallet],
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
