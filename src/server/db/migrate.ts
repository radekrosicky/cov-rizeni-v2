// Aplikace migrací ze složky drizzle/. Používají ji jen skripty (npm run db:*) a testy – nikdy běžící aplikace.
//
// Pojistka schvalování: skripty pro vývojovou databázi aplikují migrace jen tehdy, když jsou VŠECHNY
// uvedené v drizzle/schvalene-migrace.json. Návrh nové migrace tak nelze omylem použít před schválením
// (např. při vytvoření nového Codespace z pracovní větve). Testy na dočasných databázích pojistku nepotřebují.
import fs from "node:fs";
import path from "node:path";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "./client.ts";

export const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, "../../../drizzle");

export function pendingApproval(folder = MIGRATIONS_FOLDER): string[] {
  const journal = JSON.parse(fs.readFileSync(path.join(folder, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
  const approved = new Set<string>(JSON.parse(fs.readFileSync(path.join(folder, "schvalene-migrace.json"), "utf8")).schvalene);
  return journal.entries.map((e) => e.tag).filter((t) => !approved.has(t));
}

export async function applyMigrations(db: Db, options: { requireApproval?: boolean } = {}): Promise<void> {
  if (options.requireApproval) {
    const pending = pendingApproval();
    if (pending.length) {
      throw new Error(
        `Migrace čeká na schválení vlastníkem projektu: ${pending.join(", ")}.\n` +
          "Databáze nebyla změněna. Po schválení se migrace doplní do drizzle/schvalene-migrace.json.",
      );
    }
  }
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}
