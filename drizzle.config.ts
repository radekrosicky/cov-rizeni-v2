// Nastavení drizzle-kit: ze schématu (src/server/db/schema.ts) generuje verzované SQL migrace do drizzle/.
// Generování migraci NEAPLIKUJE. Aplikace migrací na vývojovou databázi je samostatný, schvalovaný krok.
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
});
