"use client";
// Google sign-in through NEAR Auth: the user's NEAR account is a key NEAR's MPC network holds for their Google login. Each signature opens NEAR Auth's approval window.
import {
  FastAuthClient,
  FastAuthSignature,
  type FastAuthSigner,
} from "@fast-auth-near/browser-sdk";
import { JavascriptProvider } from "@fast-auth-near/javascript-provider";
import { connect, transactions, utils } from "near-api-js";
import { NEAR_AUTH, RPC_URL } from "./near/contracts.ts";
import type { Call, Wallet } from "./wallet.tsx";

type Auth = {
  provider: JavascriptProvider;
  client: FastAuthClient<JavascriptProvider>;
  connection: Awaited<ReturnType<typeof connect>>["connection"];
};
let auth: Promise<Auth> | undefined;

/** NEAR Auth's shared testnet login only accepts localhost for now; NEXT_PUBLIC_NEAR_AUTH=on turns it on elsewhere once NEAR allows that address. */
export const nearAuthEnabled = () =>
  typeof location !== "undefined" &&
  (location.hostname === "localhost" ||
    process.env.NEXT_PUBLIC_NEAR_AUTH === "on");

const load = () =>
  (auth ??= (async () => {
    const provider = new JavascriptProvider({
      network: "testnet",
      clientId: NEAR_AUTH.clientId,
    });
    const { connection } = await connect({
      networkId: "testnet",
      nodeUrl: RPC_URL,
    });
    const client = new FastAuthClient(provider, connection, {
      fastAuthContractId: NEAR_AUTH.fastAuthContractId,
      mpcContractId: NEAR_AUTH.mpcContractId,
    });
    return { provider, client, connection };
  })());

/** POSTs JSON to our API and throws its error message. */
async function post<T>(path: string, body: object): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Something went wrong");
  return data;
}

/** A browser that blocked NEAR Auth's window gets a clear next step. */
const explain = (e: unknown) => {
  const message = e instanceof Error ? e.message : String(e);
  if (/popup|window\.open/i.test(message))
    return new Error(
      "Your browser blocked the NEAR Auth window. Allow pop-ups for this site and try again.",
    );
  if (/cancel|closed/i.test(message))
    return new Error("The NEAR Auth window was closed before you approved.");
  return e instanceof Error ? e : new Error(message);
};

/** "5.5 NEAR" or "100 yocto" in yoctoNEAR. */
const yocto = (amount: string) =>
  amount.endsWith(" yocto")
    ? BigInt(amount.slice(0, -6))
    : BigInt(utils.format.parseNearAmount(amount.replace(/ NEAR$/, "")) ?? "0");
const tgas = (gas = "30 Tgas") => BigInt(Number.parseInt(gas, 10)) * 10n ** 12n;

/** The NEAR Auth account as a wallet: builds each transaction, has the user approve it, has our server fetch the MPC signature, then sends it. */
function nearAuthWallet(
  accountId: string,
  signer: FastAuthSigner<JavascriptProvider>,
  a: Auth,
): Wallet {
  return {
    accountId,
    async send(receiverId: string, calls: Call[], transfer?: string) {
      const publicKey = await signer.getPublicKey();
      const [key, block] = await Promise.all([
        a.connection.provider.query<{
          nonce: number;
          block_height: number;
          block_hash: string;
        }>({
          request_type: "view_access_key",
          finality: "final",
          account_id: accountId,
          public_key: publicKey.toString(),
        }),
        a.connection.provider.block({ finality: "final" }),
      ]);
      const actions = calls.map((c) =>
        transactions.functionCall(
          c.method,
          c.args ?? {},
          tgas(c.gas),
          c.deposit ? yocto(c.deposit) : 0n,
        ),
      );
      if (transfer) actions.push(transactions.transfer(yocto(transfer)));
      const tx = transactions.createTransaction(
        accountId,
        publicKey,
        receiverId,
        BigInt(key.nonce) + 1n,
        actions,
        utils.serialize.base_decode(block.header.hash),
      );
      await signer
        .requestTransactionSignature({ transaction: tx })
        .catch((e) => {
          throw explain(e);
        });
      const { signatureRequest } = await signer.getSignatureRequest();
      const { result } = await post<{ result: string }>("/api/near-auth/sign", {
        ...signatureRequest,
        signPayload: Array.from(signatureRequest.signPayload),
      });
      const outcome = await signer.sendTransaction(
        tx,
        FastAuthSignature.fromBase64(result),
      );
      const raw = (outcome.status as { SuccessValue?: string }).SuccessValue;
      return {
        hash: outcome.transaction.hash as string,
        value: raw ? JSON.parse(atob(raw)) : undefined,
      };
    },
  };
}

/** Opens NEAR Auth's Google window, signs in to our server with the resulting ID token, and returns the wallet. */
export async function signInWithGoogle(): Promise<Wallet> {
  const a = await load();
  await a.client.login().catch((e) => {
    throw explain(e);
  });
  // The provider keeps its Auth0 client private; the raw ID token is what our server verifies.
  const claims = await (
    a.provider as unknown as {
      client: { getIdTokenClaims(): Promise<{ __raw: string } | undefined> };
    }
  ).client.getIdTokenClaims();
  const { account } = await post<{ account: string }>("/api/auth/near-auth", {
    idToken: claims?.__raw,
  });
  return nearAuthWallet(account, await a.client.getSigner(), a);
}

/** Rebuilds the wallet after a page load, if NEAR Auth still has this user signed in as `account`. */
export async function restoreGoogle(account: string): Promise<Wallet | null> {
  const a = await load();
  if (!(await a.provider.isLoggedIn().catch(() => false))) return null;
  const signer = await a.client.getSigner();
  const key = (await signer.getPublicKey()).toString();
  const implicit = Array.from(
    utils.serialize.base_decode(key.split(":")[1]),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  return implicit === account ? nearAuthWallet(account, signer, a) : null;
}

/** Ends the NEAR Auth session without leaving the page. */
export async function signOutGoogle() {
  const a = await load();
  await a.provider.logout({ openUrl: false }).catch(() => null);
}
