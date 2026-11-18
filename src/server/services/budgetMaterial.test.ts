// Import rozpočtu a sledované dodávky – serverová logika nad DOČASNOU databází a složkou (jen fiktivní rozpočty).
// Pozn.: PGlite má jediné spojení – souběžné operace se v něm řadí za sebou. Testy souběhu proto ověřují,
// že výsledek je správný (nic se nezdvojí ani nepřekročí), ne skutečné paralelní zamykání; to je nutné
// ověřit na PostgreSQL před víceuživatelským provozem (viz docs/DATABAZE-V2-3.md).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../db/client.ts";
import { budgetImports, budgetItems, materialNeedSources, materialNeeds, projects } from "../db/schema.ts";
import { createTestDb } from "../db/testDb.ts";
import { DomainError } from "../errors.ts";
import { seedDevData } from "../seed/devSeed.ts";
import { buildXlsx, fictiveBudgetXlsx } from "../seed/fictiveBudget.ts";
import { LocalFileStorage } from "../storage/localFileStorage.ts";
import { analyzeBudget, confirmImport, listBudgetItems, listBudgetSources, markItemReviewed, previewBudget, setItemKind, voidImport, type ConfirmInput } from "./budget.ts";
import type { SessionActor } from "./common.ts";
import { uploadDocumentRevision } from "./documents.ts";
import { listProjectHistory } from "./history.ts";
import {
  addSourcesToNeed,
  archiveNeed,
  createManualNeed,
  createNeedsFromItems,
  getNeed,
  listNeeds,
  removeSource,
  unarchiveNeed,
  updateNeed,
  updateSourceQuantity,
  type NeedFields,
} from "./material.ts";
import { archiveProject } from "./projects.ts";

let db: Db;
let client: PGlite;
let root: string;
let storage: LocalFileStorage;
let admin: SessionActor, deputy: SessionActor, viewer1: SessionActor, viewer2: SessionActor;
let p1: string, p3: string;

const T = { timeout: 60_000 };
const technologie = { sheetName: "SO 01 Technologie", headerRow: 4, firstDataRow: 5, columns: { code: "B", description: "C", unit: "D", quantity: "E", unitPrice: "F", totalPrice: "G" } };
const elektro = { sheetName: "SO 02 Elektro", headerRow: 2, firstDataRow: 3, columns: { description: "A", quantity: "B", unit: "C", unitPrice: "D", totalPrice: "E" } };
const confirm = (over: Partial<ConfirmInput> = {}): ConfirmInput => ({ mappings: [technologie, elektro], currency: "CZK", vatBasis: "without_vat", reviewAcknowledged: true, sameFileAcknowledged: false, ...over });
const fields = (over: Partial<NeedFields> = {}): NeedFields => ({ name: "Kalová čerpadla", trackingReason: "critical_technology", trackingReasonNote: null, plannedQuantity: null, unit: null, responsibleUserId: null, note: null, ...over });

async function expectError(p: Promise<unknown>, code: DomainError["code"], message?: RegExp) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err, String(err)).toBeInstanceOf(DomainError);
  expect((err as DomainError).code).toBe(code);
  if (message) expect((err as DomainError).message + " " + JSON.stringify((err as DomainError).fieldErrors)).toMatch(message);
}

async function uploadBudget(pid = p1, data = fictiveBudgetXlsx(), documentId: string | null = null, expectedVersion: number | null = null) {
  return uploadDocumentRevision(
    db,
    storage,
    deputy,
    pid,
    { documentId, expectedVersion, category: "budget", title: "Položkový rozpočet (FIKTIVNÍ)", documentDate: null, revisionLabel: null, note: null, filename: "rozpocet.xlsx" },
    [data],
  );
}

/** Nahraný a potvrzený rozpočet → mapa „list:řádek“ → položka. */
async function importedBudget() {
  const up = await uploadBudget();
  const r = await confirmImport(db, storage, deputy, p1, up.revisionId, confirm());
  const items = await db.select().from(budgetItems).where(eq(budgetItems.importId, r.importId));
  const at = (sheet: string, row: number) => items.find((i) => i.sheetName === sheet && i.rowNumber === row)!;
  return { up, importId: r.importId, items, at, pump: at("SO 01 Technologie", 6), seal: at("SO 01 Technologie", 7), pipe: at("SO 01 Technologie", 8), fasteners: at("SO 01 Technologie", 9), blower: at("SO 01 Technologie", 12), heading: at("SO 01 Technologie", 5) };
}

beforeEach(async () => {
  ({ db, client } = await createTestDb());
  root = fs.mkdtempSync(path.join(os.tmpdir(), "cov-bm-"));
  storage = new LocalFileStorage(root);
  const seeded = await seedDevData(db);
  [admin, deputy, viewer1, viewer2] = seeded.users as [SessionActor, SessionActor, SessionActor, SessionActor];
  [p1, , p3] = seeded.projects as [string, string, string];
});
afterEach(async () => {
  await client.close();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("import rozpočtu", () => {
  it("náhled a kontrola nic neukládají; potvrzení uloží import i položky najednou + historie", T, async () => {
    const up = await uploadBudget();
    const prev = await previewBudget(db, storage, deputy, p1, up.revisionId);
    expect(prev.sheets.map((s) => s.name)).toContain("SO 02 Elektro");
    const an = await analyzeBudget(db, storage, deputy, p1, up.revisionId, [technologie, elektro]);
    expect(an.summary.needsReview).toBe(3);
    expect(await db.$count(budgetImports)).toBe(0);
    const r = await confirmImport(db, storage, deputy, p1, up.revisionId, confirm());
    expect(r.summary.items).toBe(13);
    expect(await db.$count(budgetItems)).toBe(17);
    const [imp] = await db.select().from(budgetImports);
    expect(imp).toMatchObject({ currency: "CZK", vatBasis: "without_vat", documentRevisionId: up.revisionId });
    expect((await listProjectHistory(db, viewer1, p1)).some((h) => h.entityType === "budget_import" && h.action === "create")).toBe(true);
  });

  it("bez potvrzení kontroly nejednoznačných položek se nic neuloží", T, async () => {
    const up = await uploadBudget();
    await expectError(confirmImport(db, storage, deputy, p1, up.revisionId, confirm({ reviewAcknowledged: false })), "validation", /ruční kontrole/);
    expect(await db.$count(budgetImports)).toBe(0);
  });

  it("měnu a DPH aplikace nevymýšlí – bez potvrzení zůstanou prázdné", T, async () => {
    const up = await uploadBudget();
    await confirmImport(db, storage, deputy, p1, up.revisionId, confirm({ currency: null, vatBasis: null }));
    const [imp] = await db.select().from(budgetImports);
    expect([imp!.currency, imp!.vatBasis]).toEqual([null, null]);
  });

  it("chybný výběr sloupců (žádná položka) → srozumitelná chyba, nic se neuloží", T, async () => {
    const up = await uploadBudget();
    await expectError(confirmImport(db, storage, deputy, p1, up.revisionId, confirm({ mappings: [{ ...technologie, firstDataRow: 100 }] })), "validation", /žádná položka/);
    expect(await db.$count(budgetImports)).toBe(0);
  });

  it("stejná revize podruhé → odmítnuto; ani při současném potvrzení nevzniknou dva importy", T, async () => {
    const up = await uploadBudget();
    const results = await Promise.allSettled([
      confirmImport(db, storage, deputy, p1, up.revisionId, confirm()),
      confirmImport(db, storage, admin, p1, up.revisionId, confirm()),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect((rejected.reason as DomainError).message).toMatch(/už byla importována/);
    expect(await db.$count(budgetImports)).toBe(1);
    expect(await db.$count(budgetItems)).toBe(17);
  });

  it("shodný soubor nahraný jako jiný dokument → import jen s výslovným potvrzením", T, async () => {
    const first = await uploadBudget();
    await confirmImport(db, storage, deputy, p1, first.revisionId, confirm());
    const copy = await uploadBudget();
    await expectError(confirmImport(db, storage, deputy, p1, copy.revisionId, confirm()), "validation", /Shodný soubor/);
    await confirmImport(db, storage, deputy, p1, copy.revisionId, confirm({ sameFileAcknowledged: true }));
  });

  it("příliš rozsáhlý rozpočet → srozumitelná zpráva, žádný neúplný import", T, async () => {
    const huge = buildXlsx([0, 1, 2].map((s) => ({ name: `L${s}`, rows: Array.from({ length: 18_000 }, (_, i) => [`Položka ${i}`, "ks", 1]) })));
    const up = await uploadBudget(p1, huge);
    await expectError(previewBudget(db, storage, deputy, p1, up.revisionId), "too_large", /příliš rozsáhlý/);
    await expectError(
      confirmImport(db, storage, deputy, p1, up.revisionId, confirm({ mappings: [{ sheetName: "L0", headerRow: null, firstDataRow: 1, columns: { description: "A", unit: "B", quantity: "C" } }] })),
      "too_large",
    );
    expect(await db.$count(budgetImports)).toBe(0);
    expect(await db.$count(budgetItems)).toBe(0);
  });

  it("nová revize rozpočtu: upozornění, nic se automaticky nepřepíše", T, async () => {
    const b = await importedBudget();
    const [needId] = await createNeedsFromItems(db, deputy, p1, { mode: "one", fields: fields(), sources: [{ budgetItemId: b.pump.id, quantityTaken: "2", overAllocationReason: null }], acknowledgeTracked: false });
    await uploadBudget(p1, fictiveBudgetXlsx(), b.up.documentId, 1);
    const src = await listBudgetSources(db, deputy, p1);
    expect(src.sources.find((s) => s.document.id === b.up.documentId)!.newerRevisionNotImported).toBe(true);
    const need = await getNeed(db, deputy, p1, needId!);
    expect(need.newerBudgetRevision).toEqual(["Položkový rozpočet (FIKTIVNÍ)"]);
    expect(need.sources[0]!.quantityTaken).toBe("2.0000");
  });

  it("import s navázanými dodávkami nelze zneplatnit; bez dodávek s důvodem ano", T, async () => {
    const b = await importedBudget();
    await createNeedsFromItems(db, deputy, p1, { mode: "one", fields: fields(), sources: [{ budgetItemId: b.pump.id, quantityTaken: "1", overAllocationReason: null }], acknowledgeTracked: false });
    await expectError(voidImport(db, deputy, p1, b.importId, 1, "Špatně"), "validation", /vycházejí sledované dodávky/);
  });

  it("druh řádku a vyřízení kontroly lze změnit (s historií); původní hodnoty ne", T, async () => {
    const b = await importedBudget();
    await setItemKind(db, deputy, p1, b.fasteners.id, "other");
    await markItemReviewed(db, deputy, p1, b.fasteners.id, "Množství upřesní dodavatel (fiktivní)");
    const [it] = await db.select().from(budgetItems).where(eq(budgetItems.id, b.fasteners.id));
    expect([it!.kind, it!.detectedKind, it!.quantityRaw]).toEqual(["other", "material", "dle PD"]);
    const actions = (await listProjectHistory(db, deputy, p1)).filter((h) => h.entityType === "budget_item").map((h) => h.action);
    expect(actions.sort()).toEqual(["review", "update"]);
  });
});

describe("sledované dodávky – jednoduché vytvoření, sloučení, rozdělení", () => {
  it("jedna technologie: jedna položka → jedna dodávka jedním voláním", T, async () => {
    const b = await importedBudget();
    const [id] = await createNeedsFromItems(db, deputy, p1, {
      mode: "one",
      fields: fields({ plannedQuantity: "2", unit: "ks" }),
      sources: [{ budgetItemId: b.pump.id, quantityTaken: "2", overAllocationReason: null }],
      acknowledgeTracked: false,
    });
    const need = await getNeed(db, viewer1, p1, id!);
    expect(need.need).toMatchObject({ name: "Kalová čerpadla", status: "to_confirm", plannedQuantity: "2.0000", responsibleUserId: null });
    expect(need.responsibleName).toBeNull(); // obrazovka ukáže „Nepřiřazeno“
    expect(need.sources[0]).toMatchObject({ quantityTaken: "2.0000", documentTitle: "Položkový rozpočet (FIKTIVNÍ)", revisionNo: 1 });
    expect(need.sources[0]!.item).toMatchObject({ sheetName: "SO 01 Technologie", rowNumber: 6, code: "TECH-001" });
    const list = await listBudgetItems(db, deputy, p1, { onlyUntracked: true });
    expect(list.items.some((i) => i.id === b.pump.id)).toBe(false);
  });

  it("sloučení: více položek → jedna dodávka; „každou zvlášť“ → více dodávek najednou", T, async () => {
    const b = await importedBudget();
    const [merged] = await createNeedsFromItems(db, deputy, p1, {
      mode: "one",
      fields: fields({ name: "Potrubí a těsnění DN100/150", trackingReason: "may_block_assembly" }),
      sources: [
        { budgetItemId: b.seal.id, quantityTaken: "12", overAllocationReason: null },
        { budgetItemId: b.pipe.id, quantityTaken: "48,5", overAllocationReason: null },
      ],
      acknowledgeTracked: false,
    });
    expect((await getNeed(db, deputy, p1, merged!)).sources).toHaveLength(2);
    const each = await createNeedsFromItems(db, deputy, p1, {
      mode: "each",
      fields: fields({ trackingReason: "long_lead_time" }),
      sources: [
        { budgetItemId: b.pump.id, quantityTaken: "2", overAllocationReason: null },
        { budgetItemId: b.blower.id, quantityTaken: "2", overAllocationReason: null },
      ],
      acknowledgeTracked: false,
    });
    expect(each).toHaveLength(2);
    const names = (await listNeeds(db, deputy, p1)).needs.map((n) => n.name);
    expect(names).toEqual(expect.arrayContaining(["Ponorné kalové čerpadlo Qmax 12 l/s, 4 kW (fiktivní)", "Dmychadlo Q=600 m3/h, 15 kW (fiktivní)"]));
  });

  it("rozdělení: čerpadla 2 ks → 2 dodávky po 1 ks; druhá jen s výslovným potvrzením; rozpočet beze změny", T, async () => {
    const b = await importedBudget();
    await createNeedsFromItems(db, deputy, p1, { mode: "one", fields: fields({ name: "Čerpadlo ČS1" }), sources: [{ budgetItemId: b.pump.id, quantityTaken: "1", overAllocationReason: null }], acknowledgeTracked: false });
    const second = { mode: "one" as const, fields: fields({ name: "Čerpadlo ČS2" }), sources: [{ budgetItemId: b.pump.id, quantityTaken: "1", overAllocationReason: null }] };
    await expectError(createNeedsFromItems(db, deputy, p1, { ...second, acknowledgeTracked: false }), "validation", /Už sledováno/);
    await createNeedsFromItems(db, deputy, p1, { ...second, acknowledgeTracked: true });
    // Třetí dodávka by překročila rozpočet → jen s důvodem.
    const third = { mode: "one" as const, fields: fields({ name: "Záložní čerpadlo" }), acknowledgeTracked: true };
    await expectError(createNeedsFromItems(db, deputy, p1, { ...third, sources: [{ budgetItemId: b.pump.id, quantityTaken: "1", overAllocationReason: null }] }), "validation", /překročí množství v rozpočtu.*důvod/);
    await createNeedsFromItems(db, deputy, p1, { ...third, sources: [{ budgetItemId: b.pump.id, quantityTaken: "1", overAllocationReason: "Záložní kus na sklad stavby (fiktivní)" }] });
    const [orig] = await db.select().from(budgetItems).where(eq(budgetItems.id, b.pump.id));
    expect(orig!.quantity).toBe("2.0000");
    const list = await listBudgetItems(db, deputy, p1, {});
    expect(list.items.find((i) => i.id === b.pump.id)!.allocation).toMatchObject({ budget: 2, taken: 3, over: true });
  });

  it("nečíselné množství: vazba jen bez převzatého množství; množství uvede člověk u dodávky", T, async () => {
    const b = await importedBudget();
    await expectError(
      createNeedsFromItems(db, deputy, p1, { mode: "one", fields: fields({ name: "Spojovací materiál" }), sources: [{ budgetItemId: b.fasteners.id, quantityTaken: "5", overAllocationReason: null }], acknowledgeTracked: false }),
      "validation",
      /jednoznačné množství/,
    );
    const [id] = await createNeedsFromItems(db, deputy, p1, {
      mode: "one",
      fields: fields({ name: "Spojovací materiál", plannedQuantity: "3", unit: "bal." }),
      sources: [{ budgetItemId: b.fasteners.id, quantityTaken: null, overAllocationReason: null }],
      acknowledgeTracked: false,
    });
    expect((await getNeed(db, deputy, p1, id!)).sources[0]!.quantityTaken).toBeNull();
  });

  it("nadpis ani mezisoučet nejde sledovat", T, async () => {
    const b = await importedBudget();
    await expectError(createNeedsFromItems(db, deputy, p1, { mode: "one", fields: fields(), sources: [{ budgetItemId: b.heading.id, quantityTaken: null, overAllocationReason: null }], acknowledgeTracked: false }), "validation", /nadpis nebo mezisoučet/);
  });

  it("ruční dodávka bez Excelu; vlastní důvod; odpovědný jen s přístupem pro úpravy", T, async () => {
    await expectError(createManualNeed(db, deputy, p1, fields({ trackingReason: "other" })), "validation", /vlastní důvod/);
    await expectError(createManualNeed(db, deputy, p1, fields({ responsibleUserId: viewer1.id })), "validation", /správce nebo člen zakázky s právem úprav/);
    const id = await createManualNeed(db, deputy, p1, fields({ name: "Chemie pro srážení P (ruční záznam)", trackingReason: "other", trackingReasonNote: "Jediný dodavatel (fiktivní)", responsibleUserId: deputy.id }));
    const need = await getNeed(db, deputy, p1, id);
    expect(need.sources).toEqual([]);
    expect(need.responsibleName).toBe("Zástupce (fiktivní)");
  });

  it("dodatečné sloučení, změna množství s důvodem, odebrání vazby – vše v historii", T, async () => {
    const b = await importedBudget();
    const [id] = await createNeedsFromItems(db, deputy, p1, { mode: "one", fields: fields(), sources: [{ budgetItemId: b.pump.id, quantityTaken: "2", overAllocationReason: null }], acknowledgeTracked: false });
    await addSourcesToNeed(db, deputy, p1, id!, 1, [{ budgetItemId: b.seal.id, quantityTaken: "12", overAllocationReason: null }], false);
    const need = await getNeed(db, deputy, p1, id!);
    const sealSrc = need.sources.find((s) => s.budgetItemId === b.seal.id)!;
    await expectError(updateSourceQuantity(db, deputy, p1, sealSrc.id, "14", null), "validation", /Uveďte důvod/);
    await updateSourceQuantity(db, deputy, p1, sealSrc.id, "14", "Rezerva na výměnu (fiktivní)");
    await removeSource(db, deputy, p1, sealSrc.id);
    const actions = (await listProjectHistory(db, deputy, p1)).filter((h) => h.entityType === "material_need_source").map((h) => h.action);
    expect(actions).toEqual(expect.arrayContaining(["link_source", "update", "unlink_source"]));
  });

  it("souběžné převzetí zbytku položky dvěma uživateli → jen jedno projde, rozpočet se nepřekročí potichu", T, async () => {
    const b = await importedBudget();
    const take = (who: SessionActor, name: string) =>
      createNeedsFromItems(db, who, p1, { mode: "one", fields: fields({ name }), sources: [{ budgetItemId: b.blower.id, quantityTaken: "2", overAllocationReason: null }], acknowledgeTracked: true });
    const results = await Promise.allSettled([take(deputy, "Dmychadla A"), take(admin, "Dmychadla B")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const sum = (await db.select().from(materialNeedSources).where(eq(materialNeedSources.budgetItemId, b.blower.id))).reduce((s, x) => s + Number(x.quantityTaken), 0);
    expect(sum).toBe(2);
  });

  it("souběžná úprava dodávky → druhá skončí konfliktem", T, async () => {
    const id = await createManualNeed(db, deputy, p1, fields());
    await updateNeed(db, deputy, p1, id, 1, fields({ name: "A" }));
    await expectError(updateNeed(db, admin, p1, id, 1, fields({ name: "B" })), "conflict");
  });

  it("archivace s důvodem uvolní množství; obnovení nesmí potichu překročit rozpočet", T, async () => {
    const b = await importedBudget();
    const [a] = await createNeedsFromItems(db, deputy, p1, { mode: "one", fields: fields(), sources: [{ budgetItemId: b.pump.id, quantityTaken: "2", overAllocationReason: null }], acknowledgeTracked: false });
    await archiveNeed(db, deputy, p1, a!, 1, "Zrušeno objednatelem (fiktivní)");
    await createNeedsFromItems(db, deputy, p1, { mode: "one", fields: fields({ name: "Náhrada" }), sources: [{ budgetItemId: b.pump.id, quantityTaken: "2", overAllocationReason: null }], acknowledgeTracked: false });
    await expectError(unarchiveNeed(db, deputy, p1, a!, 2, "Omyl"), "validation", /Obnovením by převzaté množství překročilo/);
  });
});

describe("oprávnění vždy na serveru", () => {
  it("sledující čte rozpočet i dodávky, ale nic nezmění", T, async () => {
    const b = await importedBudget();
    const [id] = await createNeedsFromItems(db, deputy, p1, { mode: "one", fields: fields(), sources: [{ budgetItemId: b.pump.id, quantityTaken: "1", overAllocationReason: null }], acknowledgeTracked: false });
    expect((await listBudgetItems(db, viewer1, p1)).manage).toBe(false);
    expect((await listNeeds(db, viewer1, p1)).needs).toHaveLength(1);
    await expectError(previewBudget(db, storage, viewer1, p1, b.up.revisionId), "forbidden");
    await expectError(confirmImport(db, storage, viewer1, p1, b.up.revisionId, confirm()), "forbidden");
    await expectError(createNeedsFromItems(db, viewer1, p1, { mode: "one", fields: fields(), sources: [{ budgetItemId: b.pump.id, quantityTaken: "1", overAllocationReason: null }], acknowledgeTracked: true }), "forbidden");
    await expectError(createManualNeed(db, viewer1, p1, fields()), "forbidden");
    await expectError(updateNeed(db, viewer1, p1, id!, 1, fields({ name: "x" })), "forbidden");
    await expectError(setItemKind(db, viewer1, p1, b.pump.id, "work"), "forbidden");
    const src = (await getNeed(db, viewer1, p1, id!)).sources[0]!;
    await expectError(removeSource(db, viewer1, p1, src.id), "forbidden");
    await expectError(archiveNeed(db, viewer1, p1, id!, 1, "x"), "forbidden");
  });

  it("bez přístupu k zakázce 404; položku cizí zakázky nelze použít", T, async () => {
    const b = await importedBudget();
    await expectError(listBudgetItems(db, viewer2, p1), "not_found");
    await expectError(listNeeds(db, viewer2, p1), "not_found");
    await expectError(createNeedsFromItems(db, deputy, p3, { mode: "one", fields: fields(), sources: [{ budgetItemId: b.pump.id, quantityTaken: "1", overAllocationReason: null }], acknowledgeTracked: false }), "not_found");
  });

  it("archivovaná zakázka: jen čtení i pro správce", T, async () => {
    const b = await importedBudget();
    const [p] = await db.select().from(projects).where(eq(projects.id, p1));
    await archiveProject(db, admin, p1, p!.version, "Konec (fiktivní)");
    await expectError(createManualNeed(db, admin, p1, fields()), "forbidden", /archivovaná/);
    expect((await listBudgetItems(db, admin, p1)).items.length).toBeGreaterThan(0);
    expect(await db.$count(materialNeeds)).toBe(0);
    void b;
  });
});
