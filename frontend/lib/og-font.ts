// The headline font for share images, fetched from Google Fonts (ImageResponse can't use next/font).

/** Bricolage Grotesque Bold, limited to the letters in `text`; empty if Google Fonts can't be reached. */
export async function headFont(text: string) {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700&text=${encodeURIComponent(text)}`)).text();
    const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!url) return [];
    return [{ name: "Head", data: await (await fetch(url)).arrayBuffer(), weight: 700 as const, style: "normal" as const }];
  } catch {
    return [];
  }
}
