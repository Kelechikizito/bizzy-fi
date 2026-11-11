// The card X shows when someone posts a business's profile link.
import { ImageResponse } from "next/og";
import { headFont } from "@/lib/og-font";
import { loadProfile } from "@/lib/near/profile";
import { getAvatar } from "@/lib/server/avatar";

export const alt = "A business's track record on Bizzy-Fy";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const p = await loadProfile((await params).name);
  // A missing or unreadable picture just leaves the card without one.
  const avatar = p ? await getAvatar(p.id).catch(() => null) : null;
  const stats = p
    ? [
        `Score ${p.score}`,
        `${p.deals} deals paid`,
        `${p.partners} ${p.partners === 1 ? "business" : "businesses"}`,
      ]
    : [];
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: "#edeff2",
        color: "#1a1a1a",
        fontFamily: "Head",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 32,
        }}
      >
        <span style={{ fontWeight: 700 }}>bizzy-fy</span>
        {p?.human && (
          <span
            style={{
              background: "#1a1a1a",
              color: "#edeff2",
              borderRadius: 2,
              padding: "6px 22px",
            }}
          >
            Verified human
          </span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 48 }}>
        {avatar && (
          <img
            src={avatar}
            alt=""
            width={200}
            height={200}
            style={{
              borderRadius: 100,
              border: "4px solid #1a1a1a",
              objectFit: "cover",
            }}
          />
        )}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            maxWidth: avatar ? 760 : 1056,
          }}
        >
          <span
            style={{
              fontSize: avatar ? 96 : 112,
              fontWeight: 700,
              letterSpacing: -3,
            }}
          >
            {p?.name ?? "Unknown business"}
          </span>
          <span style={{ fontSize: 34, color: "#5a5a5a", marginTop: 8 }}>
            {(p?.about ?? "").slice(0, avatar ? 60 : 90)}
          </span>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          gap: 24,
          borderTop: "6px solid #1a1a1a",
          paddingTop: 28,
          fontSize: 40,
          fontWeight: 700,
        }}
      >
        {stats.map((s) => (
          <span key={s} style={{ marginRight: 32 }}>
            {s}
          </span>
        ))}
      </div>
    </div>,
    {
      ...size,
      fonts: await headFont(
        [
          "bizzy-fy Verified human",
          p?.name ?? "Unknown business",
          p?.about ?? "",
          ...stats,
        ].join(" "),
      ),
    },
  );
}
