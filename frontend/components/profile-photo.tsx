"use client";
// The profile picture picker: crops to a square and shrinks to 256px in the browser, then saves it.
import { useEffect, useRef, useState } from "react";
import { Button, Problem } from "@/components/ui";
import { api } from "@/lib/wallet";

const SIZE = 256;

/** Center-crops `file` to a square and returns it as a small JPEG data URL. */
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    SIZE,
    SIZE,
  );
  return canvas.toDataURL("image/jpeg", 0.85);
}

/** Loads `company`'s picture once: undefined while loading, null when there is none. Share it between views. */
export function useAvatar(company: string | null) {
  const [image, setImage] = useState<string | null | undefined>(undefined);
  useEffect(
    () =>
      void (
        company &&
        api<{ image: string | null }>(`/api/companies/${company}/avatar`).then(
          (r) => setImage(r.image),
          () => setImage(null),
        )
      ),
    [company],
  );
  return [image, setImage] as const;
}

/** The round picture, or the business's first letter when there is none. */
export function Avatar({
  company,
  image,
  className,
}: {
  company: string;
  image?: string | null;
  className: string;
}) {
  return image ? (
    // eslint-disable-next-line @next/next/no-img-element -- a small data URL, nothing to optimise
    <img
      src={image}
      alt={`${company.split(".")[0]}'s profile picture`}
      className={`${className} shrink-0 rounded-full object-cover ring-1 ring-rule`}
    />
  ) : (
    <span
      className={`${className} grid shrink-0 place-items-center rounded-full bg-band font-display font-bold uppercase text-white ring-1 ring-graphite`}
      aria-hidden
    >
      {company[0]}
    </span>
  );
}

/** The picker: shows the picture with buttons to change or remove it, and reports each change through `onImage`. */
export function ProfilePhoto({
  company,
  image,
  onImage,
}: {
  company: string;
  image: string | null | undefined;
  onImage(image: string | null): void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const path = `/api/companies/${company}/avatar`;

  const save = async (next: string | null) => {
    setBusy(true);
    setError(null);
    try {
      onImage(
        (await api<{ image: string | null }>(path, { image: next })).image,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const pick = async (file?: File) => {
    if (!file) return;
    try {
      await save(await shrink(file));
    } catch {
      setError("That file isn't a picture we can read. Try a JPEG or PNG.");
    }
  };

  return (
    <section className="mt-6 flex flex-wrap items-center gap-6 rounded-sm border border-rule p-5">
      <Avatar company={company} image={image} className="size-24 text-4xl" />
      <div>
        <p className="font-medium">Profile picture</p>
        <p className="text-sm text-muted">
          Your logo or a photo. Shown on your public profile; anyone can see it.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="plain"
            disabled={busy || image === undefined}
            onClick={() => input.current?.click()}
          >
            {busy ? "Saving…" : image ? "Change picture" : "Upload picture"}
          </Button>
          {image && (
            <Button
              variant="plain"
              disabled={busy}
              onClick={() => void save(null)}
            >
              Remove
            </Button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <Problem text={error} />
      </div>
    </section>
  );
}
