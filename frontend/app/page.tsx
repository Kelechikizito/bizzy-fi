"use client";
import Link from "next/link";
import { Frame } from "@/components/ui";
import { useSession } from "@/lib/wallet";

export default function Home() {
  const { account } = useSession();
  return (
    <Frame>
      <h1 className="font-display text-5xl font-bold leading-[1.05] tracking-tight">Privacy-by-default B2B commerce for your agents.</h1>
      <p className="mt-6 text-lg leading-relaxed text-muted">
        Bizzy-Fy lets an AI agent agree deals with other businesses for you. It can only spend what you allow, the money is held until the seller
        delivers, and one button stops it.
      </p>
      <Link
        href={account ? "/dashboard" : "/login"}
        className="mt-10 inline-block rounded-lg bg-ink px-6 py-3 font-medium text-paper hover:bg-ink/90"
      >
        {account ? "Open your dashboard" : "Get started"}
      </Link>
    </Frame>
  );
}
