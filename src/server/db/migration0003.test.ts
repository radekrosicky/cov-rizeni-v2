// Návrh migrace 0003 (rozpočet a sledovaný materiál) – ověření na DOČASNÝCH databázích v paměti.
// 1) Přechod z databáze V2-1 + V2-2: existující data se nezmění.
// 2) Pravidla, která hlídá přímo databáze (import, položky, dodávky, sloučení a rozdělení, překročení množství).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { seedDevData } from "../seed/devSeed.ts";
import { LocalFileStorage } from "../storage/localFileStorage.ts";
import { openDb, type Db } from "./client.ts";
import { MIGRATIONS_FOLDER } from "./migrate.ts";
import { budgetImports, budgetItems, documentRevisions, documents, historyEntries, materialNeeds, materialNeedSources } from "./schema.ts";
import { createTestDb } from "./testDb.ts";

/** Složka jen s migracemi do zadané (včetně) – simuluje databázi před V2-3. */
function migrationsUpTo(lastTag: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cov-migrace-"));
  fs.mkdirSync(path.join(dir, "meta"));
  const journal = JSON.parse(fs.readFileSync(path.join(MIGRATIONS_FOLDER, "meta/_journal.json"), "utf8"));
  const idx = journal.entries.findIndex((e: { tag: string }) => e.tag === lastTag);
  journal.entries = journal.entries.slice(0, idx + 1);
  fs.writeFileSync(path.join(dir, "meta/_journal.json"), JSON.stringify(journal));
  for (const e of journal.entries as { tag: string }[]) fs.copyFileSync(path.join(MIGRATIONS_FOLDER, `${e.tag}.sql`), path.join(dir, `${e.tag}.sql`));
  return dir;
}

async function pgError(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const err = e as { message?: string; cause?: { message?: string } };
    return `${err.message ?? ""} ${err.cause?.message ?? ""}`;
  }
  throw new Error("Očekávala se chyba databáze, ale operace prošla.");
}

const sha = (c: string) => c.repeat(64).slice(0, 64);
let keyNo = 0;

describe("migrace 0003 – přechod z databáze V2-1 + V2-2", () => {
  it("projde na databázi s daty V2-1 i dokumenty V2-2 a nic z nich nezmění", async () => {
    const { db, client } = openDb();
    const filesDir = fs.mkdtempSync(path.join(os.tmpdir(), "cov-m3-"));
    try {
      await migrate(db, { migrationsFolder: migrationsUpTo("0002_v2_2_dokumenty") });
      await seedDevData(db, new LocalFileStorage(filesDir)); // včetně fiktivních dokumentů
      const tables = ["users", "projects", "project_members", "events", "history_entries", "documents", "document_revisions"];
      const snap = async () => {
        const out: Record<string, unknown> = {};
        for (const t of tables) out[t] = (await db.execute(sql.raw(`select md5(coalesce(string_agg(t::text, '|' order by t::text), '')) h, count(*) n from ${t} t`))).rows[0];
        return out;
      };
      const before = await snap();
      expect((before.document_revisions as { n: number }).n).toBeGreaterThan(0);
      await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER }); // doplní jen 0003
      expect(await snap()).toEqual(before);
    } finally {
      await client.close();
      fs.rmSync(filesDir, { recursive: true, force: true });
    }
  });
});

describe("migrace 0003 – pravidla v databázi", () => {
  let db: Db;
  let client: PGlite;
  let userId: string;
  let projectId: string;
  let otherProjectId: string;

  /** Fiktivní dokument + revize (bez souboru – jen databáze). */
  async function addRevision(pid: string, category: "budget" | "contract" = "budget", fileKind: "xlsx" | "pdf" = "xlsx") {
    return db.transaction(async (tx) => {
      const [d] = await tx.insert(documents).values({ projectId: pid, category, title: "Položkový rozpočet (FIKTIVNÍ)", createdBy: userId, updatedBy: userId }).returning();
      const [r] = await tx
        .insert(documentRevisions)
        .values({ documentId: d!.id, revisionNo: 1, originalFilename: "rozpocet.xlsx", fileKind, sizeBytes: 100, sha256: sha("c"), storageKey: `projects/${pid}/k${keyNo++}`, uploadedBy: userId })
        .returning();
      await tx.update(documents).set({ currentRevisionId: r!.id }).where(eq(documents.id, d!.id));
      return r!.id;
    });
  }

  const mapping = [{ sheetName: "Technologie", headerRow: 3, firstDataRow: 4, columns: { description: "C", unit: "D", quantity: "E" } }];

  async function addImport(pid = projectId, revisionId?: string) {
    const rev = revisionId ?? (await addRevision(pid));
    const [i] = await db.insert(budgetImports).values({ projectId: pid, documentRevisionId: rev, mapping, createdBy: userId, updatedBy: userId }).returning();
    return i!;
  }

  type ItemOver = Partial<typeof budgetItems.$inferInsert>;
  let rowNo = 10;
  async function addItem(importId: string, over: ItemOver = {}) {
    const [it] = await db
      .insert(budgetItems)
      .values({
        importId,
        sheetName: "Technologie",
        rowNumber: rowNo++,
        rawCells: { C: { value: "Dmychadlo (fiktivní)" }, D: { value: "ks" }, E: { value: 10 } },
        detectedKind: "material",
        kind: "material",
        description: "Dmychadlo (fiktivní)",
        unitRaw: "ks",
        unit: "ks",
        quantityRaw: "10",
        quantity: "10",
        quantityStatus: "numeric",
        ...over,
      })
      .returning();
    return it!;
  }

  async function addNeed(pid = projectId, over: Partial<typeof materialNeeds.$inferInsert> = {}) {
    const [n] = await db
      .insert(materialNeeds)
      .values({ projectId: pid, name: "Dmychadla D1–D2", trackingReason: "critical_technology", createdBy: userId, updatedBy: userId, ...over })
      .returning();
    return n!;
  }

  const link = (needId: string, itemId: string, quantityTaken: string | null, overAllocationReason: string | null = null) =>
    db.insert(materialNeedSources).values({ materialNeedId: needId, budgetItemId: itemId, quantityTaken, overAllocationReason, createdBy: userId });

  beforeEach(async () => {
    ({ db, client } = await createTestDb());
    const seeded = await seedDevData(db);
    userId = seeded.users[0]!.id;
    [projectId, otherProjectId] = seeded.projects as [string, string];
  });
  afterEach(async () => {
    await client.close();
  });

  describe("import rozpočtu", () => {
    it("jde jen z revize XLSX dokumentu druhu „Rozpočty“ téže zakázky", async () => {
      await addImport();
      const pdf = await addRevision(projectId, "budget", "pdf");
      expect(await pgError(addImport(projectId, pdf))).toMatch(/jen ze souboru XLSX/);
      const contract = await addRevision(projectId, "contract", "xlsx");
      expect(await pgError(addImport(projectId, contract))).toMatch(/druhu „Rozpočty“/);
      const foreign = await addRevision(otherProjectId);
      expect(await pgError(addImport(projectId, foreign))).toMatch(/téže zakázky/);
    });

    it("jedna revize = nejvýše jeden platný import; po zneplatnění s důvodem lze importovat znovu", async () => {
      const first = await addImport();
      expect(await pgError(addImport(projectId, first.documentRevisionId))).toMatch(/one_active_per_revision/);
      expect(await pgError(db.update(budgetImports).set({ status: "voided", voidedAt: new Date(), voidedBy: userId }).where(eq(budgetImports.id, first.id)))).toMatch(
        /void_consistent/,
      );
      await db.update(budgetImports).set({ status: "voided", voidedAt: new Date(), voidedBy: userId, voidReason: "Špatně zvolené sloupce (fiktivní)" }).where(eq(budgetImports.id, first.id));
      await addImport(projectId, first.documentRevisionId);
    });

    it("zakázku ani zdrojovou revizi importu nelze změnit; neznámou měnu a DPH lze nechat prázdné", async () => {
      const imp = await addImport();
      expect(imp.currency).toBeNull();
      expect(imp.vatBasis).toBeNull();
      const other = await addRevision(projectId);
      expect(await pgError(db.update(budgetImports).set({ documentRevisionId: other }).where(eq(budgetImports.id, imp.id)))).toMatch(/nelze změnit/);
      expect(await pgError(db.update(budgetImports).set({ currency: "korun" }).where(eq(budgetImports.id, imp.id)))).toMatch(/currency_format/);
      expect(await pgError(db.update(budgetImports).set({ vatBasis: "mozna" as never }).where(eq(budgetImports.id, imp.id)))).toMatch(/vat_valid/);
    });
  });

  describe("položky rozpočtu", () => {
    it("původní hodnoty jsou neměnné; měnit lze jen druh řádku a vyřízení kontroly; mazat nelze", async () => {
      const imp = await addImport();
      const it1 = await addItem(imp.id, { reviewReasons: ["Neznámá jednotka „bal.“"] });
      const where = eq(budgetItems.id, it1.id);
      for (const change of [{ quantity: "12" }, { description: "jiný" }, { rawCells: {} }, { unitPrice: "1" }, { reviewReasons: [] }, { rowNumber: 99 }]) {
        expect(await pgError(db.update(budgetItems).set(change as never).where(where))).toMatch(/nelze měnit/);
      }
      await db.update(budgetItems).set({ kind: "service", reviewedAt: new Date(), reviewedBy: userId, reviewNote: "Ověřeno (fiktivní)" }).where(where);
      expect(await pgError(db.delete(budgetItems).where(where))).toMatch(/nelze mazat/);
      expect(await pgError(db.execute(sql`truncate budget_items cascade`))).toMatch(/nelze mazat|truncate/i);
      const [after] = await db.select().from(budgetItems).where(where);
      expect([after!.quantity, after!.detectedKind, after!.kind]).toEqual(["10.0000", "material", "service"]);
    });

    it("množství: číslo jen se stavem „číslo“; nečíselné / chybějící / nejednoznačné zůstane prázdné", async () => {
      const imp = await addImport();
      await addItem(imp.id, { quantity: null, quantityRaw: "dle PD", quantityStatus: "non_numeric" });
      await addItem(imp.id, { quantity: null, quantityRaw: "1.250", quantityStatus: "ambiguous" });
      await addItem(imp.id, { quantity: null, quantityRaw: null, quantityStatus: "missing" });
      expect(await pgError(addItem(imp.id, { quantity: "5", quantityStatus: "ambiguous" }))).toMatch(/quantity_consistent/);
      expect(await pgError(addItem(imp.id, { quantity: null, quantityStatus: "numeric" }))).toMatch(/quantity_consistent/);
      expect(await pgError(addItem(imp.id, { quantity: null, quantityRaw: "x", quantityStatus: "missing" }))).toMatch(/missing_has_no_raw/);
    });

    it("řádek listu jen jednou; položky jen do platného importu; neznámý druh řádku odmítnut", async () => {
      const imp = await addImport();
      await addItem(imp.id, { rowNumber: 5 });
      expect(await pgError(addItem(imp.id, { rowNumber: 5 }))).toMatch(/budget_items_row_unique/);
      expect(await pgError(addItem(imp.id, { kind: "objednavka" as never }))).toMatch(/kind_valid/);
      await db.update(budgetImports).set({ status: "voided", voidedAt: new Date(), voidedBy: userId, voidReason: "Test" }).where(eq(budgetImports.id, imp.id));
      expect(await pgError(addItem(imp.id))).toMatch(/platného importu/);
    });
  });

  describe("sledované dodávky", () => {
    it("ruční dodávka bez rozpočtu; odpovědný nepovinný; jiný důvod vyžaduje text", async () => {
      const n = await addNeed(projectId, { name: "Těsnění přírub (ruční záznam)", trackingReason: "may_block_assembly" });
      expect(n.responsibleUserId).toBeNull();
      expect(await pgError(addNeed(projectId, { trackingReason: "other" }))).toMatch(/other_reason_has_note/);
      await addNeed(projectId, { trackingReason: "other", trackingReasonNote: "Jediný dodavatel v ČR (fiktivní)" });
      expect(await pgError(addNeed(projectId, { trackingReason: "cena" as never }))).toMatch(/reason_valid/);
    });

    it("dodávku nelze přesunout do jiné zakázky ani archivovat bez důvodu", async () => {
      const n = await addNeed();
      expect(await pgError(db.update(materialNeeds).set({ projectId: otherProjectId }).where(eq(materialNeeds.id, n.id)))).toMatch(/přesunout/);
      expect(await pgError(db.update(materialNeeds).set({ status: "archived", archivedAt: new Date(), archivedBy: userId }).where(eq(materialNeeds.id, n.id)))).toMatch(
        /archive_consistent/,
      );
    });
  });

  describe("vazby na rozpočet – sloučení, rozdělení, množství (S13)", () => {
    it("sloučení: 3 položky → 1 dodávka, všechny zdroje dohledatelné", async () => {
      const imp = await addImport();
      const items = [await addItem(imp.id), await addItem(imp.id, { quantity: "4", quantityRaw: "4" }), await addItem(imp.id, { quantity: "1", quantityRaw: "1", unit: "kpl", unitRaw: "kpl" })];
      const n = await addNeed();
      for (const it of items) await link(n.id, it.id, it.quantity);
      const src = await db.select().from(materialNeedSources).where(eq(materialNeedSources.materialNeedId, n.id));
      expect(src.map((s) => s.budgetItemId).sort()).toEqual(items.map((i) => i.id).sort());
    });

    it("rozdělení: 1 položka (10 ks) → 2 dodávky (6 + 4); původní množství v rozpočtu se nemění", async () => {
      const imp = await addImport();
      const it1 = await addItem(imp.id);
      await link((await addNeed()).id, it1.id, "6");
      await link((await addNeed()).id, it1.id, "4");
      const [after] = await db.select().from(budgetItems).where(eq(budgetItems.id, it1.id));
      expect(after!.quantity).toBe("10.0000");
    });

    it("překročení množství z rozpočtu jen s důvodem; archivovaná dodávka se nepočítá, obnovení se hlídá", async () => {
      const imp = await addImport();
      const it1 = await addItem(imp.id);
      const a = await addNeed();
      await link(a.id, it1.id, "8");
      const b = await addNeed();
      expect(await pgError(link(b.id, it1.id, "3"))).toMatch(/\(11\.0000\) překračuje množství v rozpočtu \(10\.0000\)/);
      await link(b.id, it1.id, "3", "Rezerva na poškození při montáži (fiktivní)");
      // Archivovaná dodávka se do součtu nepočítá…
      const c = await addNeed();
      await db.update(materialNeeds).set({ status: "archived", archivedAt: new Date(), archivedBy: userId, archiveReason: "Zrušeno (fiktivní)" }).where(eq(materialNeeds.id, b.id));
      await link(c.id, it1.id, "2");
      // …ale její obnovení by množství překročilo – bez důvodu u nové vazby by to potichu prošlo; zde má vazba důvod → projde.
      await db.update(materialNeeds).set({ status: "to_confirm", archivedAt: null, archivedBy: null, archiveReason: null }).where(eq(materialNeeds.id, b.id));
      // Dodávka bez důvodu: obnovení odmítnuto.
      await db.update(materialNeeds).set({ status: "archived", archivedAt: new Date(), archivedBy: userId, archiveReason: "Test" }).where(eq(materialNeeds.id, c.id));
      const d = await addNeed();
      await link(d.id, it1.id, "2", "Ověřeno (fiktivní)");
      expect(
        await pgError(db.update(materialNeeds).set({ status: "to_confirm", archivedAt: null, archivedBy: null, archiveReason: null }).where(eq(materialNeeds.id, c.id))),
      ).toMatch(/Obnovením by převzaté množství překročilo/);
    });

    it("položka s nečíselným nebo nejednoznačným množstvím: vazba jen bez převzatého množství", async () => {
      const imp = await addImport();
      const vague = await addItem(imp.id, { quantity: null, quantityRaw: "dle PD", quantityStatus: "non_numeric" });
      const n = await addNeed(projectId, { plannedQuantity: "3", unit: "ks" });
      expect(await pgError(link(n.id, vague.id, "3"))).toMatch(/nemá jednoznačné číselné množství/);
      await link(n.id, vague.id, null);
      const numeric = await addItem(imp.id);
      expect(await pgError(link(n.id, numeric.id, null))).toMatch(/zadejte převzaté množství/);
    });

    it("nadpis ani mezisoučet nelze sledovat; práci a službu ano (rozhodne člověk)", async () => {
      const imp = await addImport();
      const n = await addNeed();
      const heading = await addItem(imp.id, { kind: "heading", detectedKind: "heading", quantity: null, quantityRaw: null, quantityStatus: "missing" });
      const subtotal = await addItem(imp.id, { kind: "subtotal", detectedKind: "subtotal", quantity: null, quantityRaw: null, quantityStatus: "missing" });
      expect(await pgError(link(n.id, heading.id, null))).toMatch(/Nadpis ani mezisoučet/);
      expect(await pgError(link(n.id, subtotal.id, null))).toMatch(/Nadpis ani mezisoučet/);
      const service = await addItem(imp.id, { kind: "service", detectedKind: "service" });
      await link(n.id, service.id, "10");
    });

    it("položka a dodávka musí patřit téže zakázce; stejná vazba jen jednou; vazbu nelze přepojit", async () => {
      const imp = await addImport();
      const it1 = await addItem(imp.id);
      const foreignNeed = await addNeed(otherProjectId);
      expect(await pgError(link(foreignNeed.id, it1.id, "1"))).toMatch(/téže zakázce/);
      const n = await addNeed();
      await link(n.id, it1.id, "1");
      expect(await pgError(link(n.id, it1.id, "1"))).toMatch(/material_need_sources_unique/);
      const other = await addNeed();
      expect(await pgError(db.update(materialNeedSources).set({ materialNeedId: other.id }).where(eq(materialNeedSources.budgetItemId, it1.id)))).toMatch(/přepojit/);
      await db.update(materialNeedSources).set({ quantityTaken: "2" }).where(eq(materialNeedSources.budgetItemId, it1.id));
    });

    it("archivovanou dodávku nelze rozšířit; import s navázanými dodávkami nelze zneplatnit", async () => {
      const imp = await addImport();
      const it1 = await addItem(imp.id);
      const n = await addNeed();
      await link(n.id, it1.id, "2");
      expect(
        await pgError(db.update(budgetImports).set({ status: "voided", voidedAt: new Date(), voidedBy: userId, voidReason: "Test" }).where(eq(budgetImports.id, imp.id))),
      ).toMatch(/vycházejí sledované dodávky/);
      await db.update(materialNeeds).set({ status: "archived", archivedAt: new Date(), archivedBy: userId, archiveReason: "Test" }).where(eq(materialNeeds.id, n.id));
      expect(await pgError(link(n.id, (await addItem(imp.id)).id, "1"))).toMatch(/Archivovanou dodávku/);
    });

    it("položky, importy, dodávky ani vazby nelze smazat kaskádou přes zakázku", async () => {
      const imp = await addImport();
      await link((await addNeed()).id, (await addItem(imp.id)).id, "1");
      expect(await pgError(db.execute(sql`delete from projects where id = ${projectId}`))).toMatch(/foreign key|violates/i);
      expect(await pgError(db.delete(budgetImports).where(eq(budgetImports.id, imp.id)))).toMatch(/foreign key|violates/i);
    });
  });

  it("historie přijme nové druhy záznamů", async () => {
    const n = await addNeed();
    await db.insert(historyEntries).values([
      { actorUserId: userId, projectId, entityType: "material_need", entityId: n.id, action: "create" },
      { actorUserId: userId, projectId, entityType: "material_need_source", entityId: "x", action: "link_source" },
      { actorUserId: userId, projectId, entityType: "budget_item", entityId: "x", action: "review" },
    ]);
  });
});
