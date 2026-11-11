"use client";
// Small shared pieces: page frame (announcement bar, nav, footer), buttons, receipts.
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Logo } from "@/components/logo";
import { txUrl } from "@/lib/near/contracts";
import { useSession } from "@/lib/wallet";

/** Filled black button and its outlined partner, as links. */
export const PRIMARY =
  "inline-block rounded-sm bg-ink px-6 py-3 font-medium text-white shadow-sm transition duration-200 hover:-translate-y-px hover:bg-band hover:shadow-widget active:translate-y-0 active:shadow-sm";
export const GHOST = "inline-block rounded-sm border border-ink px-5 py-2.5 font-medium transition duration-200 hover:bg-ink hover:text-white active:scale-[0.98]";

/** The page frame. `bare` lets a page lay out its own full-width bands (the landing page). */
export function Frame({ children, wide, bare }: { children: ReactNode; wide?: boolean; bare?: boolean }) {
  const { account, signOut } = useSession();
  const router = useRouter();
  const width = bare ? "max-w-[1200px]" : wide ? "max-w-4xl" : "max-w-xl";
  return (
    <div className="flex min-h-screen flex-col">
      <p className="bg-band px-4 py-2 text-center text-sm font-medium text-white">Running on NEAR testnet: every NEAR here is test money.</p>
      <header className="border-b border-rule bg-card">
        <div className={`mx-auto flex h-16 items-center justify-between gap-4 px-4 ${width}`}>
          <Link href="/" className="flex items-center gap-2 text-xl font-bold">
            <Logo />
            bizzy-fy
          </Link>
          <nav className="flex items-center gap-6 text-sm font-medium text-graphite">
            <Link href="/top" className="hidden hover:text-ink sm:inline">
              Top businesses
            </Link>
            {account ? (
              <>
                <button onClick={() => void signOut().then(() => router.push("/"))} className="hover:text-ink">
                  Sign out
                </button>
                <Link href="/dashboard" className={`${PRIMARY} px-4 py-2 text-sm`}>
                  Dashboard
                </Link>
              </>
            ) : (
              <Link href="/login" className={`${PRIMARY} px-4 py-2 text-sm`}>
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main className={bare ? "flex-1" : `mx-auto w-full flex-1 px-4 py-10 ${width}`}>{children}</main>
      <footer className="bg-band text-sm text-fog">
        <div className={`mx-auto grid gap-8 px-4 py-12 sm:grid-cols-3 ${width}`}>
          <div>
            <p className="flex items-center gap-2 text-xl font-bold text-white">
              <Logo className="rounded-sm ring-1 ring-graphite" />
              bizzy-fy
            </p>
            <p className="mt-2 max-w-xs">AI agents buy for your business. NEAR holds the money until delivery.</p>
          </div>
          <div className="space-y-2">
            <p className="font-medium text-white">Product</p>
            <Link href="/top" className="block hover:text-white">
              Top businesses
            </Link>
            <Link href="/#faq" className="block hover:text-white">
              Questions
            </Link>
          </div>
          <div className="space-y-2">
            <p className="font-medium text-white">Build</p>
            <a href="https://github.com/Kelechikizito/bizzy-fy" target="_blank" rel="noreferrer" className="block hover:text-white">
              Code on GitHub
            </a>
            <a href="https://testnet.nearblocks.io/address/escrow.bizzy-fy.testnet" target="_blank" rel="noreferrer" className="block hover:text-white">
              Escrow contract
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function Button({ variant = "main", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "main" | "plain" | "stop" }) {
  const look = {
    main: "bg-ink text-white shadow-sm hover:-translate-y-px hover:bg-band hover:shadow-widget active:translate-y-0 active:shadow-sm",
    plain: "border border-rule bg-card hover:border-ink active:scale-[0.98]",
    stop: "bg-stop text-white hover:-translate-y-px hover:bg-stop/90 hover:shadow-widget active:translate-y-0",
  }[variant];
  return <button {...props} className={`rounded-sm px-6 py-3 font-medium transition duration-200 disabled:pointer-events-none disabled:opacity-40 ${look} ${className}`} />;
}

export const Receipt = ({ hash, label = "Receipt" }: { hash: string; label?: string }) => (
  <a href={txUrl(hash)} target="_blank" rel="noreferrer" className="text-sm text-muted underline underline-offset-4 hover:text-ink">
    {label}
  </a>
);

export const Problem = ({ text }: { text: string | null }) =>
  text ? <p role="alert" className="mt-4 rounded-sm border border-stop/30 bg-stop/5 px-4 py-3 text-sm text-stop">{text}</p> : null;
