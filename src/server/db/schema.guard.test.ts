// Strážní test: termíny zakázky smí existovat jen v tabulce events (jeden údaj = jeden zdroj).
// Nový sloupec typu `date` mimo seznam níže = test selže → vědomé rozhodnutí, ne omyl.
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "./schema";

/** Povolené obchodní datové sloupce (tabulka.sloupec) a důvod. */
const ALLOWED_DATE_COLUMNS: Record<string, string> = {
  "events.contract_date": "smluvní termín události",
  "events.planned_date": "interní plán události",
  "events.actual_date": "skutečné datum události",
};

const tables: PgTable[] = (Object.values(schema) as unknown[]).filter((v): v is PgTable => is(v, PgTable));

describe("schéma – jeden zdroj termínů", () => {
  it("načte všech 5 tabulek", () => {
    expect(tables.map((t) => getTableConfig(t).name).sort()).toEqual([
      "events",
      "history_entries",
      "project_members",
      "projects",
      "users",
    ]);
  });

  it("sloupce typu date jsou jen ty schválené (v tabulce events)", () => {
    const found = tables.flatMap((t) => {
      const cfg = getTableConfig(t);
      return cfg.columns.filter((c) => c.getSQLType() === "date").map((c) => `${cfg.name}.${c.name}`);
    });
    expect(found.sort()).toEqual(Object.keys(ALLOWED_DATE_COLUMNS).sort());
  });

  it("časová razítka jsou jen metadata záznamu (končí na _at) – žádný skrytý termín", () => {
    for (const t of tables) {
      const cfg = getTableConfig(t);
      for (const c of cfg.columns.filter((x) => x.getSQLType().startsWith("timestamp"))) {
        expect(c.name === "at" || c.name.endsWith("_at"), `${cfg.name}.${c.name}`).toBe(true);
      }
    }
  });

  it("zakázka nemá žádný vlastní termín", () => {
    const cols = getTableConfig(schema.projects).columns.map((c) => c.name);
    expect(cols.filter((n) => /(^|_)(date|termin|deadline|start|handover|assembly|due)(_|$)/i.test(n))).toEqual([]);
  });
});
