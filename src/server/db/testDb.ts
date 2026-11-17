// Pomůcka pro testy: dočasná databáze v paměti s aplikovanými migracemi. Po testu zanikne.
import { applyMigrations, openDb } from "./client";

export async function createTestDb() {
  const handle = openDb();
  await applyMigrations(handle.db);
  return handle;
}
