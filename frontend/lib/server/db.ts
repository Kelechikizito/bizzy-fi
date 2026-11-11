import "server-only";
import { type Client, createClient } from "@libsql/client";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS challenges (nonce TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS agent_keys (company TEXT PRIMARY KEY, public_key TEXT NOT NULL, sealed TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS terms (hash TEXT PRIMARY KEY, buyer TEXT NOT NULL, seller TEXT NOT NULL, sealed TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sponsored (account TEXT PRIMARY KEY, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS briefs (company TEXT PRIMARY KEY, sealed TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS invites (code TEXT PRIMARY KEY, company TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS connections (company TEXT NOT NULL, other TEXT NOT NULL, sealed TEXT NOT NULL, PRIMARY KEY (company, other));
CREATE TABLE IF NOT EXISTS contacts (company TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS mcp_keys (hash TEXT PRIMARY KEY, company TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS negotiations (id INTEGER PRIMARY KEY, buyer TEXT NOT NULL, seller TEXT NOT NULL, status TEXT NOT NULL, terms_hash TEXT, sealed TEXT NOT NULL, at INTEGER NOT NULL);
`;

let client: Promise<Client> | undefined;

/** The database: a local file by default, or a hosted one through DATABASE_URL. */
export function db(): Promise<Client> {
  client ??= (async () => {
    const connection = createClient({
      url: process.env.DATABASE_URL ?? "file:bizzy.db",
      authToken: process.env.DATABASE_TOKEN,
    });
    await connection.executeMultiple(SCHEMA);
    return connection;
  })();
  return client;
}
