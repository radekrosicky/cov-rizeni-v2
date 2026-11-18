// DEMO pro předvedení: připraví ČERSTVÁ fiktivní demonstrační data a spustí aplikaci.
//   npm run demo           → smaže a znovu založí POUZE DEMO databázi (data/demo) a spustí aplikaci na portu 3000
//   npm run demo:data      → jen připraví DEMO data (aplikaci nespustí)
// Termíny se odvozují od dnešního dne, proto se data zakládají při každém spuštění znovu
// (změny provedené během předvedení se tím vrátí do výchozího stavu – to je záměr).
// Bezpečnost: maže se výhradně složka data/demo; vývojová databáze data/dev ani nic jiného se nemění.
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { openDb } from "../src/server/db/client.ts";
import { applyMigrations } from "../src/server/db/migrate.ts";
import { formatDateCz } from "../src/domain/calendar/calendar.ts";
import { DEMO_PROJECT_NAME, seedDemoData } from "../src/server/seed/demoSeed.ts";
import { LocalFileStorage } from "../src/server/storage/localFileStorage.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const DEMO_DIR = path.join(ROOT, "data", "demo"); // pevně dané – nelze přesměrovat proměnnou prostředí
const DB_DIR = path.join(DEMO_DIR, "db");
const FILES_DIR = path.join(DEMO_DIR, "files");
const PORT = 3000;
const onlyData = process.argv.includes("--jen-data");

function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect(port, "127.0.0.1");
    s.once("connect", () => (s.destroy(), resolve(true)));
    s.once("error", () => resolve(false));
  });
}

if (process.env.NODE_ENV === "production") {
  console.error("DEMO nelze připravit v produkčním režimu. Nic nebylo změněno.");
  process.exit(1);
}
if (await portInUse(PORT)) {
  console.error(`Na portu ${PORT} už běží aplikace. Zastavte ji (v terminálu Ctrl+C) a spusťte DEMO znovu. Nic nebylo změněno.`);
  process.exit(1);
}
// Pojistka: mazat smíme jen přesně data/demo uvnitř tohoto projektu.
if (path.relative(path.join(ROOT, "data"), DEMO_DIR) !== "demo") throw new Error("Neočekávaná cesta DEMO dat – nic nemažu.");

console.log("──────────────────────────────────────────────────────────────");
console.log(" DEMO ČOV Řízení 2.0 – POUZE FIKTIVNÍ DATA");
console.log(" Mažu a znovu zakládám JEN demonstrační data ve složce data/demo.");
console.log(" Vývojová databáze (data/dev) ani nic jiného se nemění.");
console.log("──────────────────────────────────────────────────────────────");
fs.rmSync(DEMO_DIR, { recursive: true, force: true });
fs.mkdirSync(DB_DIR, { recursive: true });
const { db, client } = openDb(DB_DIR);
try {
  await applyMigrations(db, { requireApproval: true });
  const r = await seedDemoData(db, new LocalFileStorage(FILES_DIR));
  console.log(`Hotovo: „${DEMO_PROJECT_NAME}“ + 1 další zakázka, ${r.users.length} fiktivní uživatelé.`);
  console.log(`Montáž biologické linky (plán): ${formatDateCz(r.dates.bio)}`);
} finally {
  await client.close();
}

if (!onlyData) {
  console.log(`\nSpouštím aplikaci: http://localhost:${PORT} (v Codespaces záložka PORTS → 3000 → Open in Browser; port nechte Private).\n`);
  const child = spawn("npx", ["next", "dev", "--hostname", "localhost", "--port", String(PORT)], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, DATABASE_DIR: DB_DIR, FILES_DIR, NEXT_TELEMETRY_DISABLED: "1" },
  });
  const stop = () => child.kill("SIGINT");
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  child.on("exit", (code) => process.exit(code ?? 0));
}
