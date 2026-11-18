// Import položkového rozpočtu (V2-3).
// Postup: soubor je dokument druhu „Rozpočty“ (V2-2) → NÁHLED (nic se neukládá) → uživatel potvrdí sloupce
// → KONTROLA (nic se neukládá) → POTVRZENÍ = jedna transakce (import + všechny položky + historie).
// Čtení Excelu probíhá v samostatném procesu s limity (reader.ts); překročení limitu = nic se neuloží.
import { and, desc, eq, inArray } from "drizzle-orm";
import { allocationOf } from "../../domain/budget/allocation.ts";
import type { ClassifiedRow } from "../../domain/budget/classify.ts";
import type { SheetMapping } from "../../domain/budget/types.ts";
import { BUDGET_ROW_KINDS, VAT_BASES, type BudgetRowKind, type VatBasis } from "../../domain/values.ts";
import { extractBudgetFile, previewBudgetFile, type ReaderFailure } from "../budget/reader.ts";
import type { Db, DbOrTx } from "../db/client.ts";
import { budgetImports, budgetItems, documentRevisions, documents, materialNeeds, materialNeedSources, users } from "../db/schema.ts";
import { DomainError } from "../errors.ts";
import type { FileStorage } from "../storage/fileStorage.ts";
import { canProject } from "../../domain/access/permissions.ts";
import { conflictError, fromDbError, isUuid, requireProject, requireReason, writeHistory, type SessionActor } from "./common.ts";

const failure = (f: ReaderFailure) => new DomainError(f.kind === "limit" ? "too_large" : f.kind === "busy" ? "conflict" : "validation", f.message);

/** Revize rozpočtu (XLSX dokument druhu „Rozpočty“) této zakázky. */
async function loadBudgetRevision(db: DbOrTx, projectId: string, revisionId: string) {
  if (!isUuid(revisionId)) throw new DomainError("not_found", "Rozpočet nebyl nalezen.");
  const [row] = await db
    .select({ r: documentRevisions, d: documents })
    .from(documentRevisions)
    .innerJoin(documents, eq(documents.id, documentRevisions.documentId))
    .where(and(eq(documentRevisions.id, revisionId), eq(documents.projectId, projectId)));
  if (!row) throw new DomainError("not_found", "Rozpočet nebyl nalezen.");
  if (row.d.category !== "budget" || row.r.fileKind !== "xlsx") {
    throw new DomainError("validation", "Položky lze načíst jen ze souboru XLSX uloženého v Dokumentech jako druh „Rozpočty“.");
  }
  return row;
}

// ---------- Výběr rozpočtu a upozornění na novější revize ----------

export async function listBudgetSources(db: Db, actor: SessionActor, projectId: string) {
  const { project, membership } = await requireProject(db, actor, projectId, "material.view");
  const docs = await db.select().from(documents).where(and(eq(documents.projectId, projectId), eq(documents.category, "budget"), eq(documents.status, "active")));
  if (!docs.length) return { manage: canProject(actor, "material.manage", { status: project.status, membership }).allowed, sources: [] };
  const revs = await db.select().from(documentRevisions).where(inArray(documentRevisions.documentId, docs.map((d) => d.id)));
  const imports = revs.length
    ? await db.select().from(budgetImports).where(and(inArray(budgetImports.documentRevisionId, revs.map((r) => r.id)), eq(budgetImports.status, "active")))
    : [];
  const sources = docs.map((d) => {
    const own = revs.filter((r) => r.documentId === d.id).sort((a, b) => b.revisionNo - a.revisionNo);
    const current = own.find((r) => r.id === d.currentRevisionId) ?? own[0]!;
    const importOf = (revId: string) => imports.find((i) => i.documentRevisionId === revId) ?? null;
    const imported = own.filter((r) => importOf(r.id)).map((r) => ({ revisionNo: r.revisionNo, importId: importOf(r.id)!.id }));
    return {
      document: d,
      current,
      currentImport: importOf(current.id),
      isXlsx: current.fileKind === "xlsx",
      importedRevisions: imported,
      /** Existuje import starší revize, ale aktuální revize importovaná není → upozornit (nic se nepřepisuje). */
      newerRevisionNotImported: !importOf(current.id) && imported.length > 0,
    };
  });
  return { manage: canProject(actor, "material.manage", { status: project.status, membership }).allowed, sources };
}

// ---------- Náhled a kontrola (nic se neukládá) ----------

export async function previewBudget(db: Db, storage: FileStorage, actor: SessionActor, projectId: string, revisionId: string) {
  await requireProject(db, actor, projectId, "material.manage");
  const { r, d } = await loadBudgetRevision(db, projectId, revisionId);
  const [existing] = await db.select().from(budgetImports).where(and(eq(budgetImports.documentRevisionId, revisionId), eq(budgetImports.status, "active")));
  const result = await storage.withLocalFile(r.storageKey, (file) => previewBudgetFile(file));
  if (!result.ok) throw failure(result);
  // Shodný soubor (otisk) už importovaný jinde → upozornění, ne zákaz.
  const sameFile = await db
    .select({ title: documents.title, revisionNo: documentRevisions.revisionNo })
    .from(budgetImports)
    .innerJoin(documentRevisions, eq(documentRevisions.id, budgetImports.documentRevisionId))
    .innerJoin(documents, eq(documents.id, documentRevisions.documentId))
    .where(and(eq(budgetImports.projectId, projectId), eq(budgetImports.status, "active"), eq(documentRevisions.sha256, r.sha256)));
  return { document: d, revision: r, alreadyImported: existing ?? null, sameFileImported: sameFile.filter((x) => !(x.title === d.title && x.revisionNo === r.revisionNo)), sheets: result.sheets };
}

export async function analyzeBudget(db: Db, storage: FileStorage, actor: SessionActor, projectId: string, revisionId: string, mappings: SheetMapping[]) {
  await requireProject(db, actor, projectId, "material.manage");
  const { r } = await loadBudgetRevision(db, projectId, revisionId);
  const result = await storage.withLocalFile(r.storageKey, (file) => extractBudgetFile(file, mappings));
  if (!result.ok) throw failure(result);
  const [already] = await db.select({ id: budgetImports.id }).from(budgetImports).where(and(eq(budgetImports.documentRevisionId, r.id), eq(budgetImports.status, "active")));
  const sameFile = await db
    .select({ id: budgetImports.id })
    .from(budgetImports)
    .innerJoin(documentRevisions, eq(documentRevisions.id, budgetImports.documentRevisionId))
    .where(and(eq(budgetImports.projectId, projectId), eq(budgetImports.status, "active"), eq(documentRevisions.sha256, r.sha256)));
  return { ...result, alreadyImported: !!already, sameFileImported: !already && sameFile.length > 0 };
}

// ---------- Potvrzení importu (jedna transakce) ----------

export interface ConfirmInput {
  mappings: SheetMapping[];
  currency: string | null;
  vatBasis: string | null;
  /** Uživatel potvrdil, že zkontroloval položky označené k ruční kontrole. */
  reviewAcknowledged: boolean;
  /** Uživatel potvrdil import souboru, který už byl importován z jiného dokumentu (shodný otisk). */
  sameFileAcknowledged: boolean;
}

export async function confirmImport(db: Db, storage: FileStorage, actor: SessionActor, projectId: string, revisionId: string, input: ConfirmInput) {
  await requireProject(db, actor, projectId, "material.manage");
  const { r, d } = await loadBudgetRevision(db, projectId, revisionId);
  const currency = input.currency && /^[A-Z]{3}$/.test(input.currency) ? input.currency : null;
  const vatBasis = (VAT_BASES as readonly string[]).includes(input.vatBasis ?? "") ? (input.vatBasis as VatBasis) : null;

  // Celé čtení znovu ze souboru (žádná data z prohlížeče se nepřebírají) – limity platí i zde.
  const result = await storage.withLocalFile(r.storageKey, (file) => extractBudgetFile(file, input.mappings));
  if (!result.ok) throw failure(result);
  const rows = result.rows;
  if (!rows.some((x) => x.kind !== "heading" && x.kind !== "subtotal")) {
    throw new DomainError("validation", "Podle zvolených sloupců nebyla nalezena žádná položka. Zkontrolujte výběr sloupců a první řádek s daty.");
  }
  if (result.summary.needsReview > 0 && !input.reviewAcknowledged) {
    const n = result.summary.needsReview;
    const word = n === 1 ? "položku označenou" : n >= 2 && n <= 4 ? "položky označené" : "položek označených";
    throw new DomainError("validation", `Před uložením zkontrolujte ${n} ${word} k ruční kontrole a potvrďte to zaškrtnutím.`, {
      reviewAcknowledged: "Potvrďte kontrolu nejednoznačných položek.",
    });
  }
  const [already] = await db.select({ id: budgetImports.id }).from(budgetImports).where(and(eq(budgetImports.documentRevisionId, r.id), eq(budgetImports.status, "active")));
  if (already) throw new DomainError("conflict", "Tato revize rozpočtu už byla importována. Nic nebylo uloženo podruhé.");
  const same = await db
    .select({ id: budgetImports.id })
    .from(budgetImports)
    .innerJoin(documentRevisions, eq(documentRevisions.id, budgetImports.documentRevisionId))
    .where(and(eq(budgetImports.projectId, projectId), eq(budgetImports.status, "active"), eq(documentRevisions.sha256, r.sha256)));
  if (same.length && !input.sameFileAcknowledged) {
    throw new DomainError("validation", "Shodný soubor už byl v této zakázce importován z jiného dokumentu. Potvrďte, že ho chcete importovat znovu.", {
      sameFileAcknowledged: "Potvrďte opakovaný import shodného souboru.",
    });
  }

  try {
    return await db.transaction(async (tx) => {
      await requireProject(tx, actor, projectId, "material.manage");
      const [imp] = await tx
        .insert(budgetImports)
        .values({ projectId, documentRevisionId: r.id, mapping: input.mappings, currency, vatBasis, createdBy: actor.id, updatedBy: actor.id })
        .returning();
      for (let i = 0; i < rows.length; i += 500) {
        await tx.insert(budgetItems).values(rows.slice(i, i + 500).map((x) => itemValues(imp!.id, x)));
      }
      await writeHistory(tx, {
        actorId: actor.id,
        projectId,
        entityType: "budget_import",
        entityId: imp!.id,
        action: "create",
        changes: {
          source: { before: null, after: `${d.title} – rev. ${r.revisionNo} (${r.originalFilename})` },
          sheets: { before: null, after: input.mappings.map((m) => m.sheetName).join(", ") },
          items: { before: null, after: result.summary.items },
          needsReview: { before: null, after: result.summary.needsReview },
        },
      });
      return { importId: imp!.id, summary: result.summary };
    });
  } catch (e) {
    throw fromDbError(e, { budget_imports_one_active_per_revision: "Tato revize rozpočtu už byla importována. Nic nebylo uloženo podruhé." });
  }
}

function itemValues(importId: string, x: ClassifiedRow): typeof budgetItems.$inferInsert {
  return {
    importId,
    sheetName: x.sheetName,
    rowNumber: x.rowNumber,
    rawCells: x.rawCells,
    detectedKind: x.kind,
    kind: x.kind,
    code: x.code,
    description: x.description,
    unitRaw: x.unitRaw,
    unit: x.unit,
    quantityRaw: x.quantityRaw,
    quantity: x.quantity,
    quantityStatus: x.quantityStatus,
    unitPriceRaw: x.unitPriceRaw,
    unitPrice: x.unitPrice,
    totalPriceRaw: x.totalPriceRaw,
    totalPrice: x.totalPrice,
    reviewReasons: x.reviewReasons,
  };
}

export async function voidImport(db: Db, actor: SessionActor, projectId: string, importId: string, version: number, reason: string) {
  const why = requireReason(reason);
  try {
    await db.transaction(async (tx) => {
      await requireProject(tx, actor, projectId, "material.manage");
      const [imp] = await tx.select().from(budgetImports).where(and(eq(budgetImports.id, importId), eq(budgetImports.projectId, projectId)));
      if (!imp) throw new DomainError("not_found", "Import nebyl nalezen.");
      if (imp.status !== "active") throw new DomainError("validation", "Import už je zneplatněný.");
      const updated = await tx
        .update(budgetImports)
        .set({ status: "voided", voidedAt: new Date(), voidedBy: actor.id, voidReason: why, version: imp.version + 1, updatedBy: actor.id, updatedAt: new Date() })
        .where(and(eq(budgetImports.id, importId), eq(budgetImports.version, version)))
        .returning({ id: budgetImports.id });
      if (!updated.length) throw conflictError();
      await writeHistory(tx, { actorId: actor.id, projectId, entityType: "budget_import", entityId: importId, action: "cancel", changes: { status: { before: "active", after: "voided" } }, reason: why });
    });
  } catch (e) {
    throw fromDbError(e);
  }
}

// ---------- Položky rozpočtu ----------

export interface ItemFilter {
  importId?: string | null;
  /** „k-objednani“ (materiál + ostatní), „vse“ (všechny řádky vč. nadpisů), nebo konkrétní druh. */
  kind?: string | null;
  q?: string | null;
  onlyUntracked?: boolean;
  onlyReview?: boolean;
}

export async function listBudgetItems(db: Db, actor: SessionActor, projectId: string, filter: ItemFilter = {}) {
  const { project, membership } = await requireProject(db, actor, projectId, "material.view");
  const imports = await db
    .select({ imp: budgetImports, title: documents.title, revisionNo: documentRevisions.revisionNo, filename: documentRevisions.originalFilename })
    .from(budgetImports)
    .innerJoin(documentRevisions, eq(documentRevisions.id, budgetImports.documentRevisionId))
    .innerJoin(documents, eq(documents.id, documentRevisions.documentId))
    .where(and(eq(budgetImports.projectId, projectId), eq(budgetImports.status, "active")))
    .orderBy(desc(budgetImports.createdAt));
  const chosen = filter.importId && imports.some((i) => i.imp.id === filter.importId) ? filter.importId : imports[0]?.imp.id ?? null;
  const manage = canProject(actor, "material.manage", { status: project.status, membership }).allowed;
  if (!chosen) return { manage, imports, importId: null, items: [] };

  const items = await db.select().from(budgetItems).where(eq(budgetItems.importId, chosen));
  const sources = items.length
    ? await db
        .select({ s: materialNeedSources, needName: materialNeeds.name, needStatus: materialNeeds.status })
        .from(materialNeedSources)
        .innerJoin(materialNeeds, eq(materialNeeds.id, materialNeedSources.materialNeedId))
        .where(inArray(materialNeedSources.budgetItemId, items.map((i) => i.id)))
    : [];
  const q = filter.q?.trim().toLowerCase() ?? "";
  const kind = filter.kind ?? "k-objednani";
  const rows = items
    .sort((a, b) => a.sheetName.localeCompare(b.sheetName, "cs") || a.rowNumber - b.rowNumber)
    .map((it) => {
      const own = sources.filter((s) => s.s.budgetItemId === it.id && s.needStatus !== "archived");
      return {
        ...it,
        tracking: own.map((s) => ({ needId: s.s.materialNeedId, needName: s.needName, quantityTaken: s.s.quantityTaken })),
        allocation: allocationOf(it.quantity, own.map((s) => s.s.quantityTaken)),
      };
    })
    .filter((it) => {
      if (kind === "k-objednani" && !["material", "other"].includes(it.kind)) return it.kind === "heading" ? !q && !filter.onlyUntracked && !filter.onlyReview : false;
      if (kind !== "k-objednani" && kind !== "vse" && it.kind !== kind) return false;
      if (q && !`${it.code ?? ""} ${it.description ?? ""}`.toLowerCase().includes(q)) return false;
      if (filter.onlyUntracked && (it.allocation.tracked || ["heading", "subtotal"].includes(it.kind))) return false;
      if (filter.onlyReview && (it.reviewReasons.length === 0 || it.reviewedAt)) return false;
      return true;
    });
  return { manage, imports, importId: chosen, items: rows };
}

export async function getBudgetItem(db: Db, actor: SessionActor, projectId: string, itemId: string) {
  const { project, membership } = await requireProject(db, actor, projectId, "material.view");
  if (!isUuid(itemId)) throw new DomainError("not_found", "Položka nebyla nalezena.");
  const [row] = await db
    .select({ it: budgetItems, imp: budgetImports, rev: documentRevisions, doc: documents })
    .from(budgetItems)
    .innerJoin(budgetImports, eq(budgetImports.id, budgetItems.importId))
    .innerJoin(documentRevisions, eq(documentRevisions.id, budgetImports.documentRevisionId))
    .innerJoin(documents, eq(documents.id, documentRevisions.documentId))
    .where(and(eq(budgetItems.id, itemId), eq(budgetImports.projectId, projectId)));
  if (!row) throw new DomainError("not_found", "Položka nebyla nalezena.");
  const sources = await db
    .select({ s: materialNeedSources, need: materialNeeds })
    .from(materialNeedSources)
    .innerJoin(materialNeeds, eq(materialNeeds.id, materialNeedSources.materialNeedId))
    .where(eq(materialNeedSources.budgetItemId, itemId));
  const [reviewer] = row.it.reviewedBy ? await db.select({ n: users.displayName }).from(users).where(eq(users.id, row.it.reviewedBy)) : [];
  const active = sources.filter((s) => s.need.status !== "archived");
  return {
    manage: canProject(actor, "material.manage", { status: project.status, membership }).allowed && row.imp.status === "active",
    item: row.it,
    import: row.imp,
    revision: row.rev,
    document: row.doc,
    reviewerName: reviewer?.n ?? null,
    sources,
    allocation: allocationOf(row.it.quantity, active.map((s) => s.s.quantityTaken)),
  };
}

export async function setItemKind(db: Db, actor: SessionActor, projectId: string, itemId: string, kind: string) {
  if (!(BUDGET_ROW_KINDS as readonly string[]).includes(kind)) throw new DomainError("validation", "Vyberte druh řádku.");
  try {
    await db.transaction(async (tx) => {
      await requireProject(tx, actor, projectId, "material.manage");
      const { item } = await getItemForUpdate(tx, projectId, itemId);
      if (item.kind === kind) return;
      await tx.update(budgetItems).set({ kind: kind as BudgetRowKind }).where(eq(budgetItems.id, itemId));
      await writeHistory(tx, { actorId: actor.id, projectId, entityType: "budget_item", entityId: itemId, action: "update", changes: { kind: { before: item.kind, after: kind } } });
    });
  } catch (e) {
    throw fromDbError(e);
  }
}

export async function markItemReviewed(db: Db, actor: SessionActor, projectId: string, itemId: string, note: string | null) {
  await db.transaction(async (tx) => {
    await requireProject(tx, actor, projectId, "material.manage");
    const { item } = await getItemForUpdate(tx, projectId, itemId);
    if (item.reviewedAt) return;
    await tx.update(budgetItems).set({ reviewedAt: new Date(), reviewedBy: actor.id, reviewNote: note?.trim() || null }).where(eq(budgetItems.id, itemId));
    await writeHistory(tx, { actorId: actor.id, projectId, entityType: "budget_item", entityId: itemId, action: "review", changes: { reviewReasons: { before: item.reviewReasons.join("; "), after: "zkontrolováno" } }, reason: note?.trim() || null });
  });
}

async function getItemForUpdate(tx: DbOrTx, projectId: string, itemId: string) {
  if (!isUuid(itemId)) throw new DomainError("not_found", "Položka nebyla nalezena.");
  const [row] = await tx
    .select({ item: budgetItems, imp: budgetImports })
    .from(budgetItems)
    .innerJoin(budgetImports, eq(budgetImports.id, budgetItems.importId))
    .where(and(eq(budgetItems.id, itemId), eq(budgetImports.projectId, projectId)));
  if (!row) throw new DomainError("not_found", "Položka nebyla nalezena.");
  if (row.imp.status !== "active") throw new DomainError("validation", "Položka patří ke zneplatněnému importu.");
  return row;
}
