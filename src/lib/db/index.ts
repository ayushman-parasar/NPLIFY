import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export type Db = ReturnType<typeof drizzle<typeof schema>>;

let cached: Db | null | undefined;

/** The database, or null when DATABASE_URL is not configured (local development without logging). */
export function getDb(): Db | null {
  if (cached !== undefined) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) {
    cached = null;
    return cached;
  }
  cached = drizzle(neon(url), { schema });
  return cached;
}

export { schema };
