// Doplní chybějící SCHVÁLENÉ migrace do EXISTUJÍCÍ vývojové databáze.
// Novou databázi zakládá npm run db:setup. Aplikace při tom nesmí běžet.
import fs from "node:fs";
import { openDb, resolveDatabaseDir } from "../src/server/db/client.ts";
import { applyMigrations, pendingApproval } from "../src/server/db/migrate.ts";

const dir = resolveDatabaseDir();
if (!fs.existsSync(dir)) {
  console.error(`Databáze ${dir} neexistuje. Založte ji příkazem npm run db:setup.`);
  process.exit(1);
}
if (process.env.ALLOW_UNAPPROVED_MIGRATIONS !== "e2e-test-db" && pendingApproval().length) {
  console.error(`Migrace čeká na schválení vlastníkem projektu: ${pendingApproval().join(", ")}. Databáze nebyla změněna.`);
  process.exit(1);
}
const { db, client } = openDb(dir);
try {
  await applyMigrations(db, { requireApproval: process.env.ALLOW_UNAPPROVED_MIGRATIONS !== "e2e-test-db" });
  console.log("Migrace jsou aktuální.");
} finally {
  await client.close();
}
