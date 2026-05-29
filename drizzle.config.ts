import type { Config } from "drizzle-kit";
import path from "node:path";

export default {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url:
      process.env.DATABASE_PATH ??
      path.join(process.cwd(), "data", "personality-bench.db"),
  },
} satisfies Config;
