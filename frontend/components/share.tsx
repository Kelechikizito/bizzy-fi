"use client";
// A "Post on X" link: opens X with the text and a link to this site filled in.

/** Opens X's post box with `text` and a link to `path` on this site. */
export function ShareOnX({ text, path, label = "Post on X" }: { text: string; path: string; label?: string }) {
  const open = () => {
    const url = new URL(path, location.origin).toString();
    window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, "_blank", "noopener");
  };
  return (
    <button onClick={open} className="text-sm text-muted underline underline-offset-4 hover:text-ink">
      {label}
    </button>
  );
}
