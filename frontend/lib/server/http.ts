import "server-only";

export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Reads a required setting from the environment. */
export function need(name: string): string {
  const value = process.env[name];
  if (!value) throw new HttpError(503, `Server is missing ${name}`);
  return value;
}
