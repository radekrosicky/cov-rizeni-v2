// Pomůcka pro testy: dočasná databáze v paměti s aplikovanými migracemi. Po testu zanikne.
import { openDb } from "./client.ts";
import { applyMigrations } from "./migrate.ts";

export async function createTestDb() {
  const handle = openDb();
  await applyMigrations(handle.db);
  return handle;
}
