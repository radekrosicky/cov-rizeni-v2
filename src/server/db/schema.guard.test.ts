// Strážní test pravidla „jeden zdroj termínů“ (viz schemaRules.ts).
// Hlídá kopie termínů událostí a milníků; NEBRÁNÍ samostatným termínům objednávek, dodávek, úkolů a dokumentů.
import { is } from "drizzle-orm";
import { date, getTableConfig, pgTable, PgTable, text, uuid } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "./schema.ts";
import { checkDateColumn, checkSchemaDates, dateColumns } from "./schemaRules.ts";

const tables: PgTable[] = (Object.values(schema) as unknown[]).filter((v): v is PgTable => is(v, PgTable));

describe("schéma V2-1 – jeden zdroj termínů událostí", () => {
  it("načte všech 11 tabulek", () => {
    expect(tables.length).toBe(11);
  });

  it("současné schéma pravidlo splňuje; termíny událostí jsou jen v events, datum dokumentu je samostatný údaj", () => {
    expect(checkSchemaDates(tables)).toEqual([]);
    expect(dateColumns(tables).sort((a, b) => (a.table + a.column).localeCompare(b.table + b.column))).toEqual([
      { table: "document_revisions", column: "document_date" },
      { table: "events", column: "actual_date" },
      { table: "events", column: "contract_date" },
      { table: "events", column: "planned_date" },
    ]);
  });

  it("časová razítka jsou jen metadata záznamu (končí na _at)", () => {
    for (const t of tables) {
      for (const col of getTableConfig(t).columns) {
        if (col.getSQLType().startsWith("timestamp")) expect(col.name === "at" || col.name.endsWith("_at"), col.name).toBe(true);
      }
    }
  });
});

describe("pravidlo NEBLOKUJE budoucí samostatné termíny", () => {
  it.each([
    ["material_needs", "need_date_override"],
    ["material_needs", "ordered_date"],
    ["material_needs", "promised_delivery_date"],
    ["material_needs", "planned_delivery_date"],
    ["material_needs", "confirmed_delivery_date"],
    ["material_needs", "actual_delivery_date"],
    ["purchase_orders", "order_date"],
    ["tasks", "due_date"],
    ["readiness_conditions", "verify_by_date"],
    ["document_revisions", "document_date"],
    ["document_revisions", "revision_date"],
  ])("%s.%s je povolený", (table, column) => {
    expect(checkDateColumn({ table, column })).toBeNull();
  });

  it("totéž platí pro skutečnou tabulku Drizzle (příklad budoucího materiálu)", () => {
    const futureMaterial = pgTable("material_needs", {
      id: uuid("id").primaryKey(),
      eventId: uuid("event_id"), // odkaz na konkrétní událost, ne kopie jejího data
      name: text("name"),
      orderedDate: date("ordered_date", { mode: "string" }),
      confirmedDeliveryDate: date("confirmed_delivery_date", { mode: "string" }),
      actualDeliveryDate: date("actual_delivery_date", { mode: "string" }),
    });
    expect(checkSchemaDates([...tables, futureMaterial])).toEqual([]);
  });
});

describe("pravidlo ZACHYTÍ kopii termínu události / milníku", () => {
  it.each([
    ["material_needs", "assembly_date"],
    ["material_needs", "assembly_start_date"],
    ["readiness_conditions", "stage_date"],
    ["readiness_conditions", "milestone_date"],
    ["tasks", "event_date"],
    ["tasks", "site_handover_date"],
    ["documents", "handover_date"],
    ["material_needs", "planned_date"],
    ["material_needs", "actual_date"],
    ["material_needs", "contract_date"],
  ])("%s.%s je odmítnut", (table, column) => {
    expect(checkDateColumn({ table, column })).not.toBeNull();
  });

  it("zakázka nesmí mít žádný vlastní datový sloupec", () => {
    expect(checkDateColumn({ table: "projects", column: "start_date" })).not.toBeNull();
    const badProjects = pgTable("projects", { id: uuid("id"), assemblyStart: date("assembly_start", { mode: "string" }) });
    expect(checkSchemaDates([badProjects]).map((v) => v.column)).toEqual(["assembly_start"]);
  });
});
