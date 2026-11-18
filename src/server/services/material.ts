// Sledované dodávky materiálu a technologie (V2-3). Nejsou to objednávky ani skladové položky.
// Množství: v rozpočtu (položka – neměnné) · převzaté do dodávky (vazba) · plánované k zajištění (dodávka).
// Termín potřeby, dodací lhůta a rezerva (V2-4): ukládá se jen odkaz na událost + posun; termíny se počítají.
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { canProject, effectiveAccess } from "../../domain/access/permissions.ts";
import { allocationOf } from "../../domain/budget/allocation.ts";
import { parseNumber } from "../../domain/budget/numbers.ts";
import { formatDateCz, pragueToday, type IsoDate } from "../../domain/calendar/calendar.ts";
import { computeSchedule, dayCount, type Schedule } from "../../domain/material/schedule.ts";
import { parseScheduleForm, type ScheduleFormInput } from "../../domain/material/scheduleForm.ts";
import { suggestAssemblyEvent } from "../../domain/material/today.ts";
import { LEAD_TIME_STATUS_LABELS, TRACKING_REASONS, type TrackingReason } from "../../domain/values.ts";
import type { Db, DbOrTx } from "../db/client.ts";
import { budgetImports, budgetItems, documentRevisions, documents, events, materialNeeds, materialNeedSources, projectMembers, users } from "../db/schema.ts";
import { DomainError } from "../errors.ts";
import { conflictError, diff, fromDbError, isUuid, requireProject, requireReason, writeHistory, type SessionActor } from "./common.ts";

export interface NeedFields {
  name: string;
  trackingReason: string;
  trackingReasonNote: string | null;
  plannedQuantity: string | null;
  unit: string | null;
  responsibleUserId: string | null;
  note: string | null;
}

export interface SourceInput {
  budgetItemId: string;
  /** Převzaté množství (text z formuláře); u nečíselné položky prázdné. */
  quantityTaken: string | null;
  /** Důvod, pokud převzaté množství překročí rozpočet. */
  overAllocationReason: string | null;
}

const clean = (v: string | null | undefined, max = 2000) => {
  const t = (v ?? "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
};

/** Číslo z formuláře (česky i s mezerami). Prázdné = null; jiné než kladné číslo = chyba pole. */
function quantityFromForm(raw: string | null, field: string, errors: Record<string, string>): string | null {
  const p = parseNumber(raw, 4);
  if (p.status === "missing") return null;
  if (p.status !== "numeric" || Number(p.value) <= 0) {
    errors[field] = "Zadejte kladné číslo (např. 2 nebo 48,5).";
    return null;
  }
  return p.value;
}

function validateFields(f: NeedFields, errors: Record<string, string>) {
  const name = clean(f.name, 200);
  if (!name) errors.name = "Vyplňte název dodávky.";
  if (!(TRACKING_REASONS as readonly string[]).includes(f.trackingReason)) errors.trackingReason = "Vyberte důvod sledování.";
  const note = clean(f.trackingReasonNote, 500);
  if (f.trackingReason === "other" && !note) errors.trackingReasonNote = "Napište vlastní důvod sledování.";
  return {
    name: name ?? "",
    trackingReason: f.trackingReason as TrackingReason,
    trackingReasonNote: note,
    plannedQuantity: quantityFromForm(f.plannedQuantity, "plannedQuantity", errors),
    unit: clean(f.unit, 20),
    responsibleUserId: f.responsibleUserId && isUuid(f.responsibleUserId) ? f.responsibleUserId : null,
    note: clean(f.note),
  };
}

/** Odpovědný musí mít k zakázce přístup pro úpravy (správce nebo člen s úpravami). */
async function requireResponsible(tx: DbOrTx, projectId: string, userId: string | null) {
  if (!userId) return;
  const [u] = await tx.select().from(users).where(eq(users.id, userId));
  const [m] = await tx.select().from(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
  const access = u ? effectiveAccess({ id: u.id, globalRole: u.globalRole, status: u.status }, m?.access ?? null) : null;
  if (access !== "admin" && access !== "edit") {
    throw new DomainError("validation", "Odpovědným může být jen správce nebo člen zakázky s právem úprav.", { responsibleUserId: "Vyberte člověka s přístupem k zakázce." });
  }
}

/** Načte položky rozpočtu této zakázky (jen z platných importů) a ověří, že je lze sledovat. */
async function loadItems(tx: DbOrTx, projectId: string, ids: string[]) {
  if (!ids.length || ids.some((id) => !isUuid(id))) throw new DomainError("validation", "Vyberte položky rozpočtu.");
  const rows = await tx
    .select({ it: budgetItems, imp: budgetImports })
    .from(budgetItems)
    .innerJoin(budgetImports, eq(budgetImports.id, budgetItems.importId))
    .where(and(inArray(budgetItems.id, ids), eq(budgetImports.projectId, projectId)));
  if (rows.length !== new Set(ids).size) throw new DomainError("not_found", "Některá položka rozpočtu nebyla nalezena.");
  for (const r of rows) {
    if (r.imp.status !== "active") throw new DomainError("validation", "Položka patří ke zneplatněnému importu.");
    if (r.it.kind === "heading" || r.it.kind === "subtotal") throw new DomainError("validation", `„${r.it.description ?? "řádek"}“ je nadpis nebo mezisoučet – nelze ho sledovat.`);
  }
  return new Map(rows.map((r) => [r.it.id, r.it]));
}

/** Již převzatá množství z položek (jen nearchivované dodávky). */
async function takenByItem(tx: DbOrTx, itemIds: string[]) {
  if (!itemIds.length) return new Map<string, { needId: string; needName: string; quantityTaken: string | null }[]>();
  const rows = await tx
    .select({ s: materialNeedSources, name: materialNeeds.name, status: materialNeeds.status })
    .from(materialNeedSources)
    .innerJoin(materialNeeds, eq(materialNeeds.id, materialNeedSources.materialNeedId))
    .where(inArray(materialNeedSources.budgetItemId, itemIds));
  const map = new Map<string, { needId: string; needName: string; quantityTaken: string | null }[]>();
  for (const r of rows) {
    if (r.status === "archived") continue;
    const list = map.get(r.s.budgetItemId) ?? [];
    list.push({ needId: r.s.materialNeedId, needName: r.name, quantityTaken: r.s.quantityTaken });
    map.set(r.s.budgetItemId, list);
  }
  return map;
}

/**
 * Kontrola vazeb před uložením (srozumitelné chyby do formuláře; databáze totéž hlídá i sama):
 * převzaté množství u číselné položky povinné, u nečíselné zakázané; překročení rozpočtu jen s důvodem.
 */
function checkSources(
  sources: SourceInput[],
  items: Map<string, typeof budgetItems.$inferSelect>,
  taken: Map<string, { quantityTaken: string | null }[]>,
  errors: Record<string, string>,
) {
  return sources.map((s, i) => {
    const it = items.get(s.budgetItemId)!;
    const key = `source.${i}`;
    let q: string | null = null;
    if (it.quantityStatus === "numeric") {
      q = quantityFromForm(s.quantityTaken, `${key}.quantityTaken`, errors);
      if (q === null && !errors[`${key}.quantityTaken`]) errors[`${key}.quantityTaken`] = "Zadejte převzaté množství.";
    } else if (clean(s.quantityTaken)) {
      errors[`${key}.quantityTaken`] = "Položka nemá v rozpočtu jednoznačné množství – převzaté množství nelze určit. Množství uveďte u dodávky.";
    }
    const reason = clean(s.overAllocationReason, 500);
    if (q !== null) {
      const a = allocationOf(it.quantity, [...(taken.get(it.id) ?? []).map((t) => t.quantityTaken), q]);
      if (a.over && !reason) {
        errors[`${key}.overAllocationReason`] = `Převzetím ${q} ${it.unit ?? ""} se překročí množství v rozpočtu (${a.budget} ${it.unit ?? ""}, už převzato ${a.taken - Number(q)}). Uveďte důvod.`;
      }
    }
    return { budgetItemId: it.id, quantityTaken: q, overAllocationReason: q !== null && allocationOf(it.quantity, [...(taken.get(it.id) ?? []).map((t) => t.quantityTaken), q]).over ? reason : null };
  });
}

// ---------- Vytvoření dodávek ----------

export interface CreateFromItemsInput {
  /** „one“ = sloučit vybrané položky do jedné dodávky; „each“ = každá položka zvlášť. */
  mode: "one" | "each";
  fields: NeedFields;
  sources: SourceInput[];
  /** Uživatel výslovně potvrdil, že některá položka už je sledována (rozdělení). */
  acknowledgeTracked: boolean;
}

export async function createNeedsFromItems(db: Db, actor: SessionActor, projectId: string, input: CreateFromItemsInput) {
  await requireProject(db, actor, projectId, "material.manage");
  const errors: Record<string, string> = {};
  try {
    return await db.transaction(async (tx) => {
      await requireProject(tx, actor, projectId, "material.manage");
      const items = await loadItems(tx, projectId, input.sources.map((s) => s.budgetItemId));
      const taken = await takenByItem(tx, [...items.keys()]);
      const tracked = [...items.values()].filter((it) => (taken.get(it.id) ?? []).length > 0);
      if (tracked.length && !input.acknowledgeTracked) {
        errors.acknowledgeTracked = `Už sledováno: ${tracked.map((t) => `„${t.description}“ v ${(taken.get(t.id) ?? []).map((x) => `„${x.needName}“`).join(", ")}`).join("; ")}. Potvrďte vytvoření další dodávky (rozdělení položky).`;
      }
      const sources = checkSources(input.sources, items, taken, errors);
      const fieldsList =
        input.mode === "one"
          ? [{ fields: input.fields, sources }]
          : sources.map((s) => {
              const it = items.get(s.budgetItemId)!;
              // „Každou zvlášť“: název a množství z položky; důvod, odpovědný a poznámka společné.
              return { fields: { ...input.fields, name: it.description ?? input.fields.name, plannedQuantity: s.quantityTaken, unit: it.unit ?? it.unitRaw }, sources: [s] };
            });
      const validated = fieldsList.map((x) => ({ v: validateFields(x.fields, errors), sources: x.sources }));
      if (Object.keys(errors).length) throw new DomainError("validation", errors.acknowledgeTracked ?? "Formulář obsahuje chyby.", errors);
      await requireResponsible(tx, projectId, validated[0]!.v.responsibleUserId);

      const created: string[] = [];
      for (const { v, sources: src } of validated) {
        const [need] = await tx.insert(materialNeeds).values({ projectId, ...v, createdBy: actor.id, updatedBy: actor.id }).returning();
        created.push(need!.id);
        await writeHistory(tx, {
          actorId: actor.id,
          projectId,
          entityType: "material_need",
          entityId: need!.id,
          action: "create",
          changes: { name: { before: null, after: v.name }, plannedQuantity: { before: null, after: v.plannedQuantity ? `${v.plannedQuantity} ${v.unit ?? ""}`.trim() : null } },
        });
        for (const s of src) await linkSource(tx, actor, projectId, need!.id, s, items.get(s.budgetItemId)!);
      }
      return created;
    });
  } catch (e) {
    throw fromDbError(e, { material_need_sources_unique: "Položka už je v této dodávce." });
  }
}

async function linkSource(
  tx: DbOrTx,
  actor: SessionActor,
  projectId: string,
  needId: string,
  s: { budgetItemId: string; quantityTaken: string | null; overAllocationReason: string | null },
  it: typeof budgetItems.$inferSelect,
) {
  const [row] = await tx
    .insert(materialNeedSources)
    .values({ materialNeedId: needId, budgetItemId: s.budgetItemId, quantityTaken: s.quantityTaken, overAllocationReason: s.overAllocationReason, createdBy: actor.id })
    .returning();
  await writeHistory(tx, {
    actorId: actor.id,
    projectId,
    entityType: "material_need_source",
    entityId: row!.id,
    action: "link_source",
    changes: {
      need: { before: null, after: needId },
      item: { before: null, after: `${it.sheetName} ř. ${it.rowNumber}${it.code ? ` ${it.code}` : ""} – ${it.description ?? ""}` },
      quantityTaken: { before: null, after: s.quantityTaken ? `${s.quantityTaken} ${it.unit ?? ""}`.trim() : "neurčeno" },
    },
    reason: s.overAllocationReason,
  });
}

export async function createManualNeed(db: Db, actor: SessionActor, projectId: string, fields: NeedFields) {
  const errors: Record<string, string> = {};
  const v = validateFields(fields, errors);
  if (Object.keys(errors).length) throw new DomainError("validation", "Formulář obsahuje chyby.", errors);
  return db.transaction(async (tx) => {
    await requireProject(tx, actor, projectId, "material.manage");
    await requireResponsible(tx, projectId, v.responsibleUserId);
    const [need] = await tx.insert(materialNeeds).values({ projectId, ...v, createdBy: actor.id, updatedBy: actor.id }).returning();
    await writeHistory(tx, { actorId: actor.id, projectId, entityType: "material_need", entityId: need!.id, action: "create", changes: { name: { before: null, after: v.name }, source: { before: null, after: "ruční záznam (bez rozpočtu)" } } });
    return need!.id;
  });
}

// ---------- Úpravy dodávky a vazeb ----------

async function loadNeed(tx: DbOrTx, projectId: string, needId: string, forUpdate = false) {
  if (!isUuid(needId)) throw new DomainError("not_found", "Dodávka nebyla nalezena.");
  const q = tx.select().from(materialNeeds).where(and(eq(materialNeeds.id, needId), eq(materialNeeds.projectId, projectId)));
  const [n] = forUpdate ? await q.for("update") : await q;
  if (!n) throw new DomainError("not_found", "Dodávka nebyla nalezena.");
  return n;
}

export async function updateNeed(db: Db, actor: SessionActor, projectId: string, needId: string, version: number, fields: NeedFields) {
  const errors: Record<string, string> = {};
  const v = validateFields(fields, errors);
  if (Object.keys(errors).length) throw new DomainError("validation", "Formulář obsahuje chyby.", errors);
  try {
    await db.transaction(async (tx) => {
      await requireProject(tx, actor, projectId, "material.manage");
      const before = await loadNeed(tx, projectId, needId);
      if (before.status === "archived") throw new DomainError("validation", "Archivovanou dodávku nelze upravit.");
      await requireResponsible(tx, projectId, v.responsibleUserId);
      const [after] = await tx
        .update(materialNeeds)
        .set({ ...v, version: before.version + 1, updatedBy: actor.id, updatedAt: new Date() })
        .where(and(eq(materialNeeds.id, needId), eq(materialNeeds.version, version)))
        .returning();
      if (!after) throw conflictError();
      const changes = diff(before, after, ["name", "trackingReason", "trackingReasonNote", "plannedQuantity", "unit", "responsibleUserId", "note"]);
      if (Object.keys(changes).length) await writeHistory(tx, { actorId: actor.id, projectId, entityType: "material_need", entityId: needId, action: "update", changes });
    });
  } catch (e) {
    throw fromDbError(e);
  }
}

/** Přidá položky do EXISTUJÍCÍ dodávky (sloučení dodatečně). */
export async function addSourcesToNeed(db: Db, actor: SessionActor, projectId: string, needId: string, version: number, sources: SourceInput[], acknowledgeTracked: boolean) {
  const errors: Record<string, string> = {};
  try {
    await db.transaction(async (tx) => {
      await requireProject(tx, actor, projectId, "material.manage");
      const need = await loadNeed(tx, projectId, needId, true);
      if (need.status === "archived") throw new DomainError("validation", "Archivovanou dodávku nelze měnit.");
      if (need.version !== version) throw conflictError();
      const items = await loadItems(tx, projectId, sources.map((s) => s.budgetItemId));
      const taken = await takenByItem(tx, [...items.keys()]);
      for (const it of items.values()) if ((taken.get(it.id) ?? []).some((t) => t.needId === needId)) throw new DomainError("validation", `„${it.description}“ už je v této dodávce.`);
      const tracked = [...items.values()].filter((it) => (taken.get(it.id) ?? []).length > 0);
      if (tracked.length && !acknowledgeTracked) errors.acknowledgeTracked = "Některá položka už je sledována v jiné dodávce. Potvrďte rozdělení.";
      const checked = checkSources(sources, items, taken, errors);
      if (Object.keys(errors).length) throw new DomainError("validation", errors.acknowledgeTracked ?? "Formulář obsahuje chyby.", errors);
      for (const s of checked) await linkSource(tx, actor, projectId, needId, s, items.get(s.budgetItemId)!);
      await tx.update(materialNeeds).set({ version: need.version + 1, updatedBy: actor.id, updatedAt: new Date() }).where(eq(materialNeeds.id, needId));
    });
  } catch (e) {
    throw fromDbError(e, { material_need_sources_unique: "Položka už je v této dodávce." });
  }
}

export async function updateSourceQuantity(db: Db, actor: SessionActor, projectId: string, sourceId: string, quantityTaken: string | null, overAllocationReason: string | null) {
  const errors: Record<string, string> = {};
  try {
    await db.transaction(async (tx) => {
      await requireProject(tx, actor, projectId, "material.manage");
      const src = await loadSource(tx, projectId, sourceId);
      const items = await loadItems(tx, projectId, [src.s.budgetItemId]);
      const taken = await takenByItem(tx, [src.s.budgetItemId]);
      // Vlastní dosavadní hodnota se do součtu nepočítá.
      const others = new Map([[src.s.budgetItemId, (taken.get(src.s.budgetItemId) ?? []).filter((t) => t.needId !== src.s.materialNeedId)]]);
      const [checked] = checkSources([{ budgetItemId: src.s.budgetItemId, quantityTaken, overAllocationReason }], items, others, errors);
      if (Object.keys(errors).length) {
        const remapped = Object.fromEntries(Object.entries(errors).map(([k, v]) => [k.replace(/^source\.0\./, ""), v]));
        throw new DomainError("validation", "Formulář obsahuje chyby.", remapped);
      }
      await tx.update(materialNeedSources).set({ quantityTaken: checked!.quantityTaken, overAllocationReason: checked!.overAllocationReason }).where(eq(materialNeedSources.id, sourceId));
      await writeHistory(tx, {
        actorId: actor.id,
        projectId,
        entityType: "material_need_source",
        entityId: sourceId,
        action: "update",
        changes: { quantityTaken: { before: src.s.quantityTaken, after: checked!.quantityTaken } },
        reason: checked!.overAllocationReason,
      });
    });
  } catch (e) {
    throw fromDbError(e);
  }
}

export async function removeSource(db: Db, actor: SessionActor, projectId: string, sourceId: string) {
  await db.transaction(async (tx) => {
    await requireProject(tx, actor, projectId, "material.manage");
    const src = await loadSource(tx, projectId, sourceId);
    await tx.delete(materialNeedSources).where(eq(materialNeedSources.id, sourceId));
    await writeHistory(tx, {
      actorId: actor.id,
      projectId,
      entityType: "material_need_source",
      entityId: sourceId,
      action: "unlink_source",
      changes: { item: { before: `${src.it.sheetName} ř. ${src.it.rowNumber} – ${src.it.description ?? ""}`, after: null }, quantityTaken: { before: src.s.quantityTaken, after: null } },
    });
  });
}

async function loadSource(tx: DbOrTx, projectId: string, sourceId: string) {
  if (!isUuid(sourceId)) throw new DomainError("not_found", "Vazba nebyla nalezena.");
  const [row] = await tx
    .select({ s: materialNeedSources, need: materialNeeds, it: budgetItems })
    .from(materialNeedSources)
    .innerJoin(materialNeeds, eq(materialNeeds.id, materialNeedSources.materialNeedId))
    .innerJoin(budgetItems, eq(budgetItems.id, materialNeedSources.budgetItemId))
    .where(and(eq(materialNeedSources.id, sourceId), eq(materialNeeds.projectId, projectId)));
  if (!row) throw new DomainError("not_found", "Vazba nebyla nalezena.");
  if (row.need.status === "archived") throw new DomainError("validation", "Archivovanou dodávku nelze měnit.");
  return row;
}

export async function archiveNeed(db: Db, actor: SessionActor, projectId: string, needId: string, version: number, reason: string) {
  const why = requireReason(reason);
  await db.transaction(async (tx) => {
    await requireProject(tx, actor, projectId, "material.manage");
    const n = await loadNeed(tx, projectId, needId);
    if (n.status === "archived") throw new DomainError("validation", "Dodávka už je archivovaná.");
    const u = await tx
      .update(materialNeeds)
      .set({ status: "archived", archivedAt: new Date(), archivedBy: actor.id, archiveReason: why, version: n.version + 1, updatedBy: actor.id, updatedAt: new Date() })
      .where(and(eq(materialNeeds.id, needId), eq(materialNeeds.version, version)))
      .returning({ id: materialNeeds.id });
    if (!u.length) throw conflictError();
    await writeHistory(tx, { actorId: actor.id, projectId, entityType: "material_need", entityId: needId, action: "archive", changes: { status: { before: n.status, after: "archived" } }, reason: why });
  });
}

export async function unarchiveNeed(db: Db, actor: SessionActor, projectId: string, needId: string, version: number, reason: string) {
  const why = requireReason(reason);
  try {
    await db.transaction(async (tx) => {
      await requireProject(tx, actor, projectId, "material.manage");
      const n = await loadNeed(tx, projectId, needId);
      if (n.status !== "archived") throw new DomainError("validation", "Dodávka není archivovaná.");
      const u = await tx
        .update(materialNeeds)
        .set({ status: "to_confirm", archivedAt: null, archivedBy: null, archiveReason: null, version: n.version + 1, updatedBy: actor.id, updatedAt: new Date() })
        .where(and(eq(materialNeeds.id, needId), eq(materialNeeds.version, version)))
        .returning({ id: materialNeeds.id });
      if (!u.length) throw conflictError();
      await writeHistory(tx, { actorId: actor.id, projectId, entityType: "material_need", entityId: needId, action: "unarchive", changes: { status: { before: "archived", after: "to_confirm" } }, reason: why });
    });
  } catch (e) {
    throw fromDbError(e);
  }
}

// ---------- Termín potřeby a dodací lhůta (V2-4) ----------

type NeedRow = typeof materialNeeds.$inferSelect;
type EventRow = typeof events.$inferSelect;

/** Vypočtený termín dodávky z AKTUÁLNÍCH údajů (nic se neukládá). */
export function scheduleOf(n: NeedRow, event: EventRow | null, today: IsoDate): Schedule {
  return computeSchedule(
    {
      event: event ? { name: event.title, status: event.status, contractDate: event.contractDate, plannedDate: event.plannedDate, actualDate: event.actualDate } : null,
      offsetDays: n.needOffsetDays,
      dateOverride: n.needDateOverride,
      dateOverrideReason: n.needDateOverrideReason,
      leadTimeDays: n.leadTimeDays,
      leadTimeUnit: n.leadTimeUnit,
      leadTimeStatus: n.leadTimeStatus,
      reserveDays: n.reserveDays,
      responsibleAssigned: n.responsibleUserId !== null,
      archived: n.status === "archived",
    },
    today,
  );
}

/** Dodací lhůta slovy pro historii a přehledy. */
export function leadTimeText(n: Pick<NeedRow, "leadTimeDays" | "leadTimeUnit" | "leadTimeStatus">): string {
  if (n.leadTimeDays === null || !n.leadTimeUnit || !n.leadTimeStatus) return "neznámá";
  return `${dayCount(n.leadTimeDays, n.leadTimeUnit)}${n.leadTimeDays === 0 ? " (skladem)" : ""} – ${LEAD_TIME_STATUS_LABELS[n.leadTimeStatus]}`;
}

const eventText = (e: EventRow | null | undefined) => (e ? e.title : "neurčeno");

export async function updateNeedSchedule(db: Db, actor: SessionActor, projectId: string, needId: string, version: number, input: ScheduleFormInput) {
  const { fields, errors } = parseScheduleForm(input);
  if (fields.needEventId && !isUuid(fields.needEventId)) errors.needEventId = "Vyberte událost ze seznamu.";
  if (Object.keys(errors).length) throw new DomainError("validation", "Formulář obsahuje chyby.", errors);
  try {
    await db.transaction(async (tx) => {
      await requireProject(tx, actor, projectId, "material.manage");
      const before = await loadNeed(tx, projectId, needId);
      if (before.status === "archived") throw new DomainError("validation", "Archivovanou dodávku nelze upravit.");
      const ids = [before.needEventId, fields.needEventId].filter(Boolean) as string[];
      const evs = ids.length ? await tx.select().from(events).where(and(inArray(events.id, ids), eq(events.projectId, projectId))) : [];
      const byId = new Map(evs.map((e) => [e.id, e]));
      if (fields.needEventId) {
        const ev = byId.get(fields.needEventId);
        if (!ev) throw new DomainError("validation", "Formulář obsahuje chyby.", { needEventId: "Událost nebyla v této zakázce nalezena." });
        if (ev.status === "cancelled" && ev.id !== before.needEventId) {
          throw new DomainError("validation", "Formulář obsahuje chyby.", { needEventId: "Zrušenou událost nelze vybrat. Vyberte jinou." });
        }
      }
      const [after] = await tx
        .update(materialNeeds)
        .set({ ...fields, version: before.version + 1, updatedBy: actor.id, updatedAt: new Date() })
        .where(and(eq(materialNeeds.id, needId), eq(materialNeeds.version, version)))
        .returning();
      if (!after) throw conflictError();
      const changes: Record<string, { before: unknown; after: unknown }> = {};
      const add = (k: string, b: unknown, a: unknown) => {
        if (b !== a) changes[k] = { before: b, after: a };
      };
      add("needEvent", eventText(byId.get(before.needEventId ?? "")), eventText(byId.get(after.needEventId ?? "")));
      add("needOffsetDays", before.needOffsetDays, after.needOffsetDays);
      add("needDateOverride", before.needDateOverride ? formatDateCz(before.needDateOverride) : null, after.needDateOverride ? formatDateCz(after.needDateOverride) : null);
      add("leadTime", leadTimeText(before), leadTimeText(after));
      add("reserveDays", before.reserveDays, after.reserveDays);
      if (Object.keys(changes).length) {
        await writeHistory(tx, { actorId: actor.id, projectId, entityType: "material_need", entityId: needId, action: "update", changes, reason: after.needDateOverride ? after.needDateOverrideReason : null });
      }
    });
  } catch (e) {
    throw fromDbError(e);
  }
}

// ---------- Čtení ----------

export async function listNeeds(db: Db, actor: SessionActor, projectId: string) {
  const { project, membership } = await requireProject(db, actor, projectId, "material.view");
  const needs = await db.select().from(materialNeeds).where(eq(materialNeeds.projectId, projectId)).orderBy(desc(materialNeeds.createdAt));
  const ids = needs.map((n) => n.id);
  const sources = ids.length
    ? await db
        .select({ s: materialNeedSources, it: budgetItems })
        .from(materialNeedSources)
        .innerJoin(budgetItems, eq(budgetItems.id, materialNeedSources.budgetItemId))
        .where(inArray(materialNeedSources.materialNeedId, ids))
    : [];
  const respIds = [...new Set(needs.map((n) => n.responsibleUserId).filter(Boolean))] as string[];
  const names = new Map((respIds.length ? await db.select({ id: users.id, n: users.displayName }).from(users).where(inArray(users.id, respIds)) : []).map((u) => [u.id, u.n]));
  const evs = new Map((await db.select().from(events).where(eq(events.projectId, projectId))).map((e) => [e.id, e]));
  const today = pragueToday();
  return {
    manage: canProject(actor, "material.manage", { status: project.status, membership }).allowed,
    needs: needs.map((n) => ({
      ...n,
      eventTitle: n.needEventId ? evs.get(n.needEventId)?.title ?? null : null,
      schedule: scheduleOf(n, n.needEventId ? evs.get(n.needEventId) ?? null : null, today),
      responsibleName: n.responsibleUserId ? names.get(n.responsibleUserId) ?? "?" : null,
      sources: sources.filter((x) => x.s.materialNeedId === n.id).map((x) => ({ ...x.s, item: x.it })),
    })),
  };
}

export async function getNeed(db: Db, actor: SessionActor, projectId: string, needId: string) {
  const { project, membership } = await requireProject(db, actor, projectId, "material.view");
  const need = await loadNeed(db, projectId, needId);
  const sources = await db
    .select({ s: materialNeedSources, it: budgetItems, imp: budgetImports, rev: documentRevisions, doc: documents })
    .from(materialNeedSources)
    .innerJoin(budgetItems, eq(budgetItems.id, materialNeedSources.budgetItemId))
    .innerJoin(budgetImports, eq(budgetImports.id, budgetItems.importId))
    .innerJoin(documentRevisions, eq(documentRevisions.id, budgetImports.documentRevisionId))
    .innerJoin(documents, eq(documents.id, documentRevisions.documentId))
    .where(eq(materialNeedSources.materialNeedId, needId));
  const allTaken = await takenByItem(db, sources.map((x) => x.it.id));
  const [resp] = need.responsibleUserId ? await db.select({ n: users.displayName }).from(users).where(eq(users.id, need.responsibleUserId)) : [];
  // Novější revize stejného rozpočtového dokumentu (jen upozornění – nic se nepřepisuje).
  const newer = sources.filter((x) => x.doc.currentRevisionId !== x.rev.id).map((x) => x.doc.title);
  // Termíny (V2-4): události zakázky pro výběr + výpočet z aktuálních údajů.
  const projectEvents = await db.select().from(events).where(eq(events.projectId, projectId)).orderBy(asc(events.plannedDate), asc(events.contractDate), asc(events.title));
  const event = need.needEventId ? projectEvents.find((e) => e.id === need.needEventId) ?? null : null;
  const today = pragueToday();
  const suggested = !need.needEventId && !need.needDateOverride ? suggestAssemblyEvent(projectEvents, today) : null;
  return {
    today,
    schedule: scheduleOf(need, event, today),
    leadTime: leadTimeText(need),
    event,
    // Ve výběru jen platné události (+ právě navázaná, i když byla mezitím zrušena).
    eventOptions: projectEvents.filter((e) => e.status === "active" || e.id === need.needEventId),
    suggestedEvent: suggested,
    manage: canProject(actor, "material.manage", { status: project.status, membership }).allowed && need.status !== "archived",
    canUnarchive: canProject(actor, "material.manage", { status: project.status, membership }).allowed && need.status === "archived",
    need,
    responsibleName: resp?.n ?? null,
    newerBudgetRevision: [...new Set(newer)],
    sources: sources.map((x) => ({
      ...x.s,
      item: x.it,
      importId: x.imp.id,
      documentTitle: x.doc.title,
      revisionNo: x.rev.revisionNo,
      allocation: allocationOf(x.it.quantity, (allTaken.get(x.it.id) ?? []).map((t) => t.quantityTaken)),
    })),
  };
}

/** Kdo může být odpovědný: správci + členové zakázky s právem úprav (aktivní). */
export async function listResponsibleCandidates(db: Db, actor: SessionActor, projectId: string) {
  await requireProject(db, actor, projectId, "material.view");
  const all = await db.select().from(users).where(eq(users.status, "active"));
  const members = await db.select().from(projectMembers).where(eq(projectMembers.projectId, projectId));
  return all
    .filter((u) => {
      const a = effectiveAccess({ id: u.id, globalRole: u.globalRole, status: u.status }, members.find((m) => m.userId === u.id)?.access ?? null);
      return a === "admin" || a === "edit";
    })
    .map((u) => ({ id: u.id, displayName: u.displayName }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "cs"));
}

/** Položky pro formulář „Sledovat“ (s informací, zda a kolik už je převzato). */
export async function getItemsForTracking(db: Db, actor: SessionActor, projectId: string, itemIds: string[]) {
  await requireProject(db, actor, projectId, "material.manage");
  const items = await loadItems(db, projectId, itemIds);
  const taken = await takenByItem(db, itemIds);
  return itemIds.map((id) => {
    const it = items.get(id)!;
    const t = taken.get(id) ?? [];
    return { item: it, tracking: t, allocation: allocationOf(it.quantity, t.map((x) => x.quantityTaken)) };
  });
}

/** Dodávky navázané na událost – pro detail události („co se přepočítá při posunu montáže“). */
export async function listNeedsForEvent(db: Db, actor: SessionActor, projectId: string, eventId: string) {
  await requireProject(db, actor, projectId, "material.view");
  if (!isUuid(eventId)) return [];
  const [ev] = await db.select().from(events).where(and(eq(events.id, eventId), eq(events.projectId, projectId)));
  if (!ev) return [];
  const rows = await db.select().from(materialNeeds).where(and(eq(materialNeeds.needEventId, eventId), eq(materialNeeds.projectId, projectId)));
  const today = pragueToday();
  return rows
    .filter((n) => n.status !== "archived")
    .map((n) => ({ id: n.id, name: n.name, needOffsetDays: n.needOffsetDays, schedule: scheduleOf(n, ev, today) }))
    .sort((a, b) => (a.schedule.orderBy ?? "9999").localeCompare(b.schedule.orderBy ?? "9999") || a.name.localeCompare(b.name, "cs"));
}
