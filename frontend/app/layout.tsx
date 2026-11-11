import type { Metadata } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import { Providers } from "@/lib/wallet";
import "./globals.css";

const head = Bricolage_Grotesque({ variable: "--font-head", subsets: ["latin"] });
const body = Instrument_Sans({ variable: "--font-body", subsets: ["latin"] });

/** The site's public address, for share images. Vercel sets the production one automatically. */
const site = process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: "Bizzy-Fy",
  description: "Let an AI agent buy for your business, with money held until the seller delivers.",
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${head.variable} ${body.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
