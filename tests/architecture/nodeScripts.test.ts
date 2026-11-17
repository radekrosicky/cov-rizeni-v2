// Databázové skripty (npm run db:*) spouští Node.js přímo z TypeScriptu („strip-only“).
// Tento test ověří, že se serverová vrstva dá takto načíst (žádná nepodporovaná syntaxe, žádné aliasy @/).
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");

describe("serverová vrstva jde načíst přímo v Node.js (skripty db:*)", () => {
  it.each(["src/server/seed/devSeed.ts", "src/server/db/migrate.ts", "src/server/storage/localFileStorage.ts", "src/server/services/documents.ts"])("%s", (file) => {
    const r = spawnSync(process.execPath, ["--input-type=module", "-e", `await import(${JSON.stringify(path.join(root, file))});`], { cwd: root, encoding: "utf8" });
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
  });
});
