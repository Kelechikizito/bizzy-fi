import type { Metadata } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import { SITE } from "@/lib/site";
import { MotionRoot } from "@/components/motion";
import { Providers } from "@/lib/wallet";
import "./globals.css";

const head = Bricolage_Grotesque({ variable: "--font-head", subsets: ["latin"] });
const body = Instrument_Sans({ variable: "--font-body", subsets: ["latin"] });


export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "Bizzy-Fy",
  description: "Let an AI agent buy for your business, with money held until the seller delivers.",
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${head.variable} ${body.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <MotionRoot>
          <Providers>{children}</Providers>
        </MotionRoot>
      </body>
    </html>
  );
}
