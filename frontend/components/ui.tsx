"use client";
// Small shared pieces: page frame, buttons, receipts.
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { txUrl } from "@/lib/near/contracts";
import { useSession } from "@/lib/wallet";

export function Frame({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const { account, signOut } = useSession();
  const router = useRouter();
  return (
    <div className="min-h-screen">
      <header className="border-b border-rule">
        <div className={`mx-auto flex items-center justify-between px-4 py-4 ${wide ? "max-w-4xl" : "max-w-xl"}`}>
          <Link href="/" className="font-display text-xl font-bold tracking-tight">
            bizzy-fy
          </Link>
          {account && (
            <button onClick={() => void signOut().then(() => router.push("/"))} className="text-sm text-muted underline-offset-4 hover:underline">
              Sign out
            </button>
          )}
        </div>
      </header>
      <main className={`mx-auto px-4 py-10 ${wide ? "max-w-4xl" : "max-w-xl"}`}>{children}</main>
    </div>
  );
}

export function Button({ variant = "main", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "main" | "plain" | "stop" }) {
  const look = {
    main: "bg-ink text-paper hover:bg-ink/90",
    plain: "border border-ink/30 hover:border-ink",
    stop: "bg-stop text-white hover:bg-stop/90",
  }[variant];
  return <button {...props} className={`rounded-lg px-5 py-3 font-medium transition-colors disabled:opacity-40 ${look} ${className}`} />;
}

export const Receipt = ({ hash, label = "Receipt" }: { hash: string; label?: string }) => (
  <a href={txUrl(hash)} target="_blank" rel="noreferrer" className="text-sm text-muted underline underline-offset-4">
    {label}
  </a>
);

export const Problem = ({ text }: { text: string | null }) =>
  text ? <p role="alert" className="mt-4 rounded-lg bg-stop/10 px-4 py-3 text-sm text-stop">{text}</p> : null;
