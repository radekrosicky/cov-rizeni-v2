// Doplní chybějící migrace do EXISTUJÍCÍ vývojové databáze (pro budoucí schválené migrace).
// Novou databázi zakládá npm run db:setup. Aplikace při tom nesmí běžet.
import fs from "node:fs";
import { openDb, resolveDatabaseDir } from "../src/server/db/client.ts";
import { applyMigrations } from "../src/server/db/migrate.ts";

const dir = resolveDatabaseDir();
if (!fs.existsSync(dir)) {
  console.error(`Databáze ${dir} neexistuje. Založte ji příkazem npm run db:setup.`);
  process.exit(1);
}
const { db, client } = openDb(dir);
try {
  await applyMigrations(db);
  console.log("Migrace jsou aktuální.");
} finally {
  await client.close();
}
