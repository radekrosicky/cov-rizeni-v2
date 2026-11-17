// Aplikace migrací ze složky drizzle/. Používají ji jen skripty (npm run db:*) a testy – nikdy běžící aplikace.
import path from "node:path";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "./client.ts";

export const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, "../../../drizzle");

export async function applyMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}
