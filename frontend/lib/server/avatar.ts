import "server-only";
// A business's profile picture: one small JPEG, shown on its public profile. Optional.
import { db } from "./db.ts";
import { HttpError } from "./http.ts";

const MAX_BYTES = 150_000;
const PREFIX = "data:image/jpeg;base64,";

/** The picture as a data URL, or null if the business hasn't set one. */
export async function getAvatar(company: string): Promise<string | null> {
  const { rows } = await (
    await db()
  ).execute({
    sql: "SELECT jpeg FROM avatars WHERE company = ?",
    args: [company],
  });
  return rows[0] ? PREFIX + String(rows[0].jpeg) : null;
}

/** Saves a JPEG data URL, or removes the picture when given null. Only real, small JPEGs get in. */
export async function setAvatar(company: string, image: unknown) {
  const conn = await db();
  if (image === null)
    return void (await conn.execute({
      sql: "DELETE FROM avatars WHERE company = ?",
      args: [company],
    }));
  const base64 =
    typeof image === "string" && image.startsWith(PREFIX)
      ? image.slice(PREFIX.length)
      : "";
  const bytes = Buffer.from(base64, "base64");
  if (
    bytes.length < 3 ||
    bytes.length > MAX_BYTES ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[2] !== 0xff ||
    bytes.at(-2) !== 0xff ||
    bytes.at(-1) !== 0xd9
  ) {
    throw new HttpError(
      400,
      "That picture didn't work. Try a JPEG or PNG photo.",
    );
  }
  await conn.execute({
    sql: "INSERT OR REPLACE INTO avatars (company, jpeg) VALUES (?, ?)",
    args: [company, bytes.toString("base64")],
  });
}
