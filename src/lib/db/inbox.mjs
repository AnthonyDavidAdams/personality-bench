/**
 * Visitor-submitted data (subscribers, model requests) lives in its own SQLite file next to the
 * results DB. The results DB is replaced wholesale from seed/ on deploy; this file never is.
 * Plain .mjs so scripts/start.mjs can share it with the app.
 */
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export const INBOX_TABLES = ["email_subscribers", "requests"];

const DDL = `
CREATE TABLE IF NOT EXISTS email_subscribers (
  id text PRIMARY KEY NOT NULL,
  email text NOT NULL UNIQUE,
  source text,
  status text DEFAULT 'active' NOT NULL,
  confirmed_at integer,
  unsubscribed_at integer,
  unsubscribe_token text NOT NULL,
  created_at integer DEFAULT (unixepoch()) NOT NULL
);
CREATE INDEX IF NOT EXISTS subscribers_by_status ON email_subscribers (status);
CREATE TABLE IF NOT EXISTS requests (
  id text PRIMARY KEY NOT NULL,
  type text NOT NULL,
  target text NOT NULL,
  rationale text,
  submitter_email text,
  ip_hash text,
  status text DEFAULT 'pending' NOT NULL,
  resolved_at integer,
  resolution_note text,
  created_at integer DEFAULT (unixepoch()) NOT NULL
);
CREATE INDEX IF NOT EXISTS requests_by_status ON requests (status);
`;

/** /data/personality-bench.db → /data/personality-bench-inbox.db */
export function inboxPathFor(mainDbPath) {
  return mainDbPath.replace(/\.db$/, "") + "-inbox.db";
}

export function openInbox(mainDbPath) {
  const p = inboxPathFor(mainDbPath);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const db = new Database(p);
  db.pragma("journal_mode = WAL");
  db.exec(DDL);
  return db;
}

/**
 * Copy any rows still sitting in the results DB into the inbox (INSERT OR IGNORE, so it is
 * safe to run on every start). Returns the number of rows copied per table.
 */
export function rescueIntoInbox(inbox, mainDbPath) {
  const copied = {};
  if (!fs.existsSync(mainDbPath)) return copied;
  inbox.prepare("ATTACH DATABASE ? AS main_db").run(mainDbPath);
  try {
    for (const t of INBOX_TABLES) {
      const exists = inbox
        .prepare("SELECT 1 FROM main_db.sqlite_master WHERE type='table' AND name=?")
        .get(t);
      if (!exists) continue;
      const cols = inbox.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name).join(", ");
      copied[t] = inbox.prepare(`INSERT OR IGNORE INTO ${t} (${cols}) SELECT ${cols} FROM main_db.${t}`).run().changes;
    }
  } finally {
    inbox.exec("DETACH DATABASE main_db");
  }
  return copied;
}
