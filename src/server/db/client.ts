// Připojení k databázi (PGlite = PostgreSQL uvnitř Node.js, Q1). Jediné místo, kde vzniká spojení.
// Obrazovky ani doména se k databázi nepřipojují přímo – jen přes serverové služby (src/server/services).
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema.ts";

export type Db = PgliteDatabase<typeof schema>;
/** Databáze nebo otevřená transakce – služby fungují s obojím. */
export type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Výchozí složka vývojové databáze (mimo Git, viz .gitignore). */
export const DEFAULT_DATABASE_DIR = "data/dev/db";

/**
 * Složka databáze z proměnné DATABASE_DIR. Smí ležet jen uvnitř ./data projektu
 * (ochrana proti omylu – žádná jiná data se nesmí otevřít ani smazat).
 */
export function resolveDatabaseDir(env: Record<string, string | undefined> = process.env, cwd = process.cwd()): string {
  const dataRoot = path.resolve(cwd, "data");
  const dir = path.resolve(cwd, env.DATABASE_DIR || DEFAULT_DATABASE_DIR);
  if (!dir.startsWith(dataRoot + path.sep)) {
    throw new Error(`DATABASE_DIR musí ležet ve složce data/ projektu (zadáno: ${dir}).`);
  }
  return dir;
}

/** Otevře databázi; bez `dataDir` vznikne dočasná databáze jen v paměti (testy). */
export function openDb(dataDir?: string): { db: Db; client: PGlite } {
  const client = dataDir ? new PGlite(dataDir) : new PGlite();
  return { db: drizzle({ client, schema }), client };
}

// Jedno spojení na proces aplikace (přežije i obnovení modulů ve vývojovém režimu).
const globalForDb = globalThis as unknown as { __covDb?: Db };

/** Databáze pro běžící aplikaci. Migrace se zde NEPOUŠTĚJÍ – jen výslovně příkazem npm run db:*. */
export function getDb(): Db {
  if (!globalForDb.__covDb) globalForDb.__covDb = openDb(resolveDatabaseDir()).db;
  return globalForDb.__covDb;
}
