// Založení VÝVOJOVÉ databáze V2: prázdná databáze → migrace → fiktivní data.
// Použití:
//   npm run db:setup                 založí databázi; pokud už existuje, skončí chybou (nic nepřepíše)
//   npm run db:setup -- --if-missing založí jen, když neexistuje (Codespaces při vytvoření)
//   npm run db:reset                 smaže vývojovou databázi a založí ji znovu s fiktivními daty
// Databáze leží jen ve složce data/ (mimo Git). Aplikace při tom nesmí běžet.
import fs from "node:fs";
import { openDb, resolveDatabaseDir } from "../src/server/db/client.ts";
import { applyMigrations, pendingApproval } from "../src/server/db/migrate.ts";
import { seedDevData } from "../src/server/seed/devSeed.ts";
import { seedDevMaterial } from "../src/server/seed/devSeedMaterial.ts";
import { LocalFileStorage, resolveFilesDir } from "../src/server/storage/localFileStorage.ts";

const args = new Set(process.argv.slice(2));
// Neschválená migrace = nic nezakládat ani nemazat (výjimka jen pro dočasnou testovací databázi e2e).
if (process.env.ALLOW_UNAPPROVED_MIGRATIONS !== "e2e-test-db" && pendingApproval().length) {
  console.error(`Migrace čeká na schválení: ${pendingApproval().join(", ")}. Databáze nebyla změněna.`);
  process.exit(1);
}
const dir = resolveDatabaseDir();
const filesDir = resolveFilesDir();
const exists = fs.existsSync(dir) && fs.readdirSync(dir).length > 0;

if (exists) {
  if (args.has("--if-missing")) {
    console.log(`Vývojová databáze už existuje (${dir}) – nic neměním.`);
    process.exit(0);
  }
  if (!args.has("--reset")) {
    console.error(`Vývojová databáze už existuje (${dir}). Nic jsem nezměnil.\nPro nové založení s fiktivními daty: npm run db:reset`);
    process.exit(1);
  }
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(filesDir, { recursive: true, force: true });
  console.log(`Smazána vývojová databáze ${dir} a soubory ${filesDir}.`);
}

fs.mkdirSync(dir, { recursive: true });
const { db, client } = openDb(dir);
try {
  await applyMigrations(db, { requireApproval: process.env.ALLOW_UNAPPROVED_MIGRATIONS !== "e2e-test-db" });
  console.log("Migrace aplikovány na prázdnou databázi.");
  const seeded = await seedDevData(db, new LocalFileStorage(filesDir));
  await seedDevMaterial(db, seeded);
  console.log(`Fiktivní data: ${seeded.users.length} uživatelé, ${seeded.projects.length} zakázky, fiktivní dokumenty v ${filesDir}, fiktivní dodávky s termíny.`);
} finally {
  await client.close();
}
console.log(`Hotovo: ${dir}`);
