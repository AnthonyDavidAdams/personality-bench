import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import fs from "node:fs";
import path from "node:path";
import { openInbox } from "./inbox.mjs";

const defaultPath =
  process.env.NODE_ENV === "production"
    ? "/data/personality-bench.db"
    : path.join(process.cwd(), "data", "personality-bench.db");
const dbPath = process.env.DATABASE_PATH ?? defaultPath;

type Drizzled = ReturnType<typeof drizzle<typeof schema>>;
let _db: Drizzled | null = null;
let _sqlite: Database.Database | null = null;

function getDb(): Drizzled {
  if (_db) return _db;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  _sqlite = new Database(dbPath);
  _sqlite.pragma("journal_mode = WAL");
  _sqlite.pragma("foreign_keys = ON");
  _db = drizzle(_sqlite, { schema });
  return _db;
}

export const db = new Proxy({} as Drizzled, {
  get(_, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export function rawSqlite(): Database.Database {
  getDb();
  return _sqlite!;
}

let _inbox: Database.Database | null = null;
/** Subscribers and model requests. Separate file: never overwritten by the deploy-time reseed. */
export function inbox(): Database.Database {
  if (!_inbox) _inbox = openInbox(dbPath) as Database.Database;
  return _inbox;
}

export { schema };
export type DB = Drizzled;
