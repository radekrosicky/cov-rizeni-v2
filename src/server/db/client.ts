// Připojení k databázi (PGlite = PostgreSQL uvnitř Node.js, Q1). Jediné místo, kde vzniká spojení.
// Obrazovky ani doména se k databázi nepřipojují přímo – jen přes serverové služby.
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";

export type Db = PgliteDatabase<typeof schema>;

export const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, "../../../drizzle");

/**
 * Otevře databázi. `dataDir` = složka s daty (např. data/dev/db, mimo Git);
 * bez ní vznikne dočasná databáze jen v paměti (testy).
 */
export function openDb(dataDir?: string): { db: Db; client: PGlite } {
  const client = dataDir ? new PGlite(dataDir) : new PGlite();
  return { db: drizzle({ client, schema }), client };
}

/** Aplikuje migrace ze složky drizzle/. Volá se jen výslovně (zatím pouze testy nad dočasnou databází). */
export async function applyMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}
