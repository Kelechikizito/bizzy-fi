"use client";
// One sign-in layer for both doors: Privy (Google, email, passkey) and existing NEAR wallets (NEAR Connect).
import { NearConnector } from "@hot-labs/near-connect";
import { PrivyProvider, useLogin, useLogout, usePrivy, type User } from "@privy-io/react-auth";
import { useCreateWallet, useSignRawHash } from "@privy-io/react-auth/extended-chains";
import { base58, base64, hex } from "@scure/base";
import { fromNearConnect, Near, parsePublicKey } from "near-kit";
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { NETWORK } from "./near/contracts.ts";
import { nep413Hash } from "./near/nep413.ts";

export type Call = {
  method: string;
  args?: object;
  deposit?: string;
  gas?: string;
};
type Signed = { accountId: string; publicKey: string; signature: string };
type Wallet = {
  accountId: string;
  signMessage(p: { message: string; recipient: string; nonce: Uint8Array }): Promise<Signed>;
  near: Near;
};
type Session = {
  /** The signed-in account, null when signed out, undefined while checking. */
  account: string | null | undefined;
  busy: boolean;
  error: string | null;
  signInWithPrivy(): void;
  signInWithWallet(): Promise<void>;
  signOut(): Promise<void>;
  /** Signs and sends one transaction to `receiverId`; returns its hash and the last call's return value. */
  send(receiverId: string, calls: Call[], transfer?: string): Promise<{ hash: string; value: unknown }>;
};

const SessionContext = createContext<Session | null>(null);
const KIND = "bizzy_wallet";

/** POSTs JSON to our API and throws its error message. */
export async function api<T = Record<string, unknown>>(path: string, body: object = {}): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Something went wrong");
  return data;
}

/** A Privy NEAR account: its ID is its public key in hex, and Privy signs each hash. */
function privyWallet(address: string, signRaw: (hash: Uint8Array) => Promise<Uint8Array>): Wallet {
  if (!/^[0-9a-f]{64}$/.test(address)) throw new Error("Unexpected account from Privy");
  const publicKey = `ed25519:${base58.encode(hex.decode(address))}`;
  const key = {
    publicKey: parsePublicKey(publicKey),
    secretKey: "",
    sign: () => {
      throw new Error("Privy signs");
    },
  };
  const keyStore = {
    get: async () => key,
    add: async () => {},
    remove: async () => {},
    list: async () => [address],
  };
  return {
    accountId: address,
    near: new Near({
      network: NETWORK,
      keyStore,
      signer: async (hash: Uint8Array) => ({
        keyType: 0,
        data: await signRaw(hash),
      }),
    }),
    async signMessage({ message, recipient, nonce }) {
      const signature = await signRaw(await nep413Hash(message, recipient, nonce));
      return {
        accountId: address,
        publicKey,
        signature: base64.encode(signature),
      };
    },
  };
}

/** The NEAR account Privy made for this user, if any. */
const nearAddress = (u: User | null) =>
  (u?.linkedAccounts.find((a) => a.type === "wallet" && "chainType" in a && a.chainType === "near") as { address?: string } | undefined)?.address;

let connector: NearConnector | undefined;
const getConnector = () =>
  (connector ??= new NearConnector({
    network: NETWORK,
    features: { signMessage: true, testnet: true },
  }));

/** An existing NEAR wallet through NEAR Connect; `connect` opens the wallet picker. */
async function connectWallet(connect: boolean): Promise<Wallet | null> {
  const c = getConnector();
  const wallet = connect ? await c.connect() : (await c.getConnectedWallet().catch(() => null))?.wallet;
  const accountId = (await wallet?.getAccounts())?.[0]?.accountId;
  if (!wallet || !accountId) return null;
  return {
    accountId,
    near: new Near({ network: NETWORK, wallet: fromNearConnect(c) }),
    signMessage: (p) => wallet.signMessage({ ...p, signerId: accountId }) as Promise<Signed>,
  };
}

function SessionProvider({ children }: { children: ReactNode }) {
  const { ready, authenticated, user } = usePrivy();
  const { createWallet } = useCreateWallet();
  const { signRawHash } = useSignRawHash();
  const { logout: privyLogout } = useLogout();
  const [account, setAccount] = useState<string | null | undefined>(undefined);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Privy's signer captures its state when made, so always call the newest one.
  const latestSign = useRef(signRawHash);
  useEffect(() => {
    latestSign.current = signRawHash;
  }, [signRawHash]);
  const signRaw = useCallback(
    (address: string) => async (hash: Uint8Array) =>
      hex.decode((await latestSign.current({ address, chainType: "near", hash: `0x${hex.encode(hash)}` })).signature.slice(2)),
    [],
  );

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

  // Privy's signer only sees the user after a re-render, so finish login in an effect, not in onComplete.
  const [pending, setPending] = useState(false);
  const finishing = useRef(false);
  const created = useRef(false);
  const { login } = useLogin({ onComplete: () => setPending(true) });
  useEffect(() => {
    if (!pending || !authenticated || !user || finishing.current) return;
    const address = nearAddress(user);
    if (!address && created.current) return; // wait until Privy's user includes the new account
    finishing.current = true;
    void Promise.resolve().then(() =>
      run(async () => {
        finishing.current = false;
        if (!address) {
          created.current = true;
          return void (await createWallet({ chainType: "near" }).catch((e) => {
            created.current = false;
            setPending(false);
            throw e;
          }));
        }
        setPending(false);
        created.current = false;
        localStorage.setItem(KIND, "privy");
        await startSession(privyWallet(address, signRaw(address)));
      }),
    );
  }, [pending, authenticated, user, createWallet, run, signRaw, startSession]);

  // On load: the server session says who is signed in; rebuild that account's signer.
  useEffect(() => {
    if (!ready || account !== undefined) return;
    void (async () => {
      const me = await fetch("/api/me")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      const kind = localStorage.getItem(KIND);
      const address = nearAddress(user);
      const w = kind === "privy" && authenticated && address ? privyWallet(address, signRaw(address)) : kind === "wallet" ? await connectWallet(false) : null;
      if (me?.account && w?.accountId === me.account) {
        setWallet(w);
        setAccount(me.account);
      } else setAccount(null);
    })();
  }, [ready, authenticated, user, account, signRaw]);

  const session = useMemo<Session>(
    () => ({
      account,
      busy,
      error,
      signInWithPrivy: () => login(),
      signInWithWallet: () =>
        run(async () => {
          const w = await connectWallet(true);
          if (!w) throw new Error("No account was connected");
          localStorage.setItem(KIND, "wallet");
          await startSession(w);
        }),
      signOut: async () => {
        await api("/api/auth/logout").catch(() => null);
        if (localStorage.getItem(KIND) === "privy") await privyLogout();
        else
          await getConnector()
            .disconnect()
            .catch(() => null);
        localStorage.removeItem(KIND);
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
    [account, busy, error, login, run, startSession, privyLogout, wallet],
  );

  return <SessionContext value={session}>{children}</SessionContext>;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        loginMethods: ["google", "email", "passkey"],
        appearance: {
          theme: "light",
          accentColor: "#17302A",
          landingHeader: "Sign in to Bizzy-Fy",
        },
        embeddedWallets: {
          ethereum: { createOnLogin: "off" },
          solana: { createOnLogin: "off" },
        },
      }}
    >
      <SessionProvider>{children}</SessionProvider>
    </PrivyProvider>
  );
}

export function useSession(): Session {
  const session = use(SessionContext);
  if (!session) throw new Error("useSession needs <Providers>");
  return session;
}
