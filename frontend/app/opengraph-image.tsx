// The card X shows when someone posts the site's home page.
import { ImageResponse } from "next/og";
import { headFont } from "@/lib/og-font";

export const alt = "Bizzy-Fy: your agent haggles, your money waits for delivery";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#1a1a1a", color: "#edeff2", fontFamily: "Head" }}>
        <span style={{ fontSize: 32, fontWeight: 700 }}>bizzy-fy</span>
        <span style={{ fontSize: 92, fontWeight: 700, lineHeight: 1.02, letterSpacing: -3 }}>Your agent haggles. Your money waits for delivery.</span>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 30, color: "#a0a0a0" }}>
          <span>Private AI negotiation, escrow on NEAR</span>
          <span style={{ background: "#e2e7fc", color: "#1a1a1a", borderRadius: 2, padding: "4px 20px", fontWeight: 700 }}>Verified private</span>
        </div>
      </div>
    ),
    { ...size, fonts: await headFont("bizzy-fy Your agent haggles. Your money waits for delivery. Private AI negotiation, escrow on NEAR Verified private") },
  );
}
