// Historie změn zakázky. Čtou ji všichni s přístupem k zakázce, včetně sledujících (Q7).
import { desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { budgetItems, documentRevisions, documents, events, historyEntries, materialNeeds, materialNeedSources, users } from "../db/schema.ts";
import { requireProject, type SessionActor } from "./common.ts";

export async function listProjectHistory(db: Db, actor: SessionActor, projectId: string, limit = 200) {
  await requireProject(db, actor, projectId, "history.view");
  const rows = await db
    .select({
      id: historyEntries.id,
      at: historyEntries.at,
      action: historyEntries.action,
      entityType: historyEntries.entityType,
      entityId: historyEntries.entityId,
      changes: historyEntries.changes,
      reason: historyEntries.reason,
      actorName: users.displayName,
    })
    .from(historyEntries)
    .innerJoin(users, eq(users.id, historyEntries.actorUserId))
    .where(eq(historyEntries.projectId, projectId))
    .orderBy(desc(historyEntries.at))
    .limit(limit);
  // Názvy událostí a uživatelů pro srozumitelný popis.
  const eventIds = rows.filter((r) => r.entityType === "event").map((r) => r.entityId);
  const memberIds = rows.filter((r) => r.entityType === "project_member").map((r) => r.entityId.split(":")[1] ?? "");
  const docIds = rows.filter((r) => r.entityType === "document").map((r) => r.entityId);
  const revIds = rows.filter((r) => r.entityType === "document_revision").map((r) => r.entityId);
  const revs = revIds.length
    ? await db
        .select({ id: documentRevisions.id, documentId: documentRevisions.documentId, revisionNo: documentRevisions.revisionNo })
        .from(documentRevisions)
        .where(inArray(documentRevisions.id, revIds))
    : [];
  const allDocIds = [...new Set([...docIds, ...revs.map((r) => r.documentId)])];
  const docTitles = new Map(
    (allDocIds.length ? await db.select({ id: documents.id, title: documents.title }).from(documents).where(inArray(documents.id, allDocIds)) : []).map((d) => [d.id, d.title]),
  );
  const revInfo = new Map(revs.map((r) => [r.id, r]));
  const [evs, us] = await Promise.all([
    eventIds.length ? db.select({ id: events.id, title: events.title }).from(events).where(inArray(events.id, eventIds)) : Promise.resolve([]),
    memberIds.length ? db.select({ id: users.id, displayName: users.displayName }).from(users).where(inArray(users.id, memberIds)) : Promise.resolve([]),
  ]);
  const evTitle = new Map(evs.map((e) => [e.id, e.title]));
  // Dodávky a položky rozpočtu (V2-3).
  const needIds = rows.filter((r) => r.entityType === "material_need").map((r) => r.entityId);
  const srcIds = rows.filter((r) => r.entityType === "material_need_source").map((r) => r.entityId).filter((id) => /^[0-9a-f-]{36}$/.test(id));
  const itemIds = rows.filter((r) => r.entityType === "budget_item").map((r) => r.entityId).filter((id) => /^[0-9a-f-]{36}$/.test(id));
  const srcRows = srcIds.length ? await db.select({ id: materialNeedSources.id, needId: materialNeedSources.materialNeedId }).from(materialNeedSources).where(inArray(materialNeedSources.id, srcIds)) : [];
  const allNeedIds = [...new Set([...needIds, ...srcRows.map((s) => s.needId)])].filter((id) => /^[0-9a-f-]{36}$/.test(id));
  const needName = new Map((allNeedIds.length ? await db.select({ id: materialNeeds.id, name: materialNeeds.name }).from(materialNeeds).where(inArray(materialNeeds.id, allNeedIds)) : []).map((n) => [n.id, n.name]));
  const srcNeed = new Map(srcRows.map((s) => [s.id, s.needId]));
  const itemName = new Map(
    (itemIds.length ? await db.select({ id: budgetItems.id, d: budgetItems.description, sheet: budgetItems.sheetName, row: budgetItems.rowNumber }).from(budgetItems).where(inArray(budgetItems.id, itemIds)) : []).map((i) => [
      i.id,
      `${i.sheet} ř. ${i.row} – ${i.d ?? ""}`,
    ]),
  );
  const userName = new Map(us.map((u) => [u.id, u.displayName]));
  return rows.map((r) => ({
    ...r,
    subject:
      r.entityType === "event"
        ? `Událost „${evTitle.get(r.entityId) ?? "?"}“`
        : r.entityType === "project_member"
          ? `Člen ${userName.get(r.entityId.split(":")[1] ?? "") ?? "?"}`
          : r.entityType === "document"
            ? `Dokument „${docTitles.get(r.entityId) ?? "?"}“`
            : r.entityType === "document_revision"
              ? `Dokument „${docTitles.get(revInfo.get(r.entityId)?.documentId ?? "") ?? "?"}“ – revize ${revInfo.get(r.entityId)?.revisionNo ?? "?"}`
              : r.entityType === "material_need"
                ? `Dodávka „${needName.get(r.entityId) ?? "?"}“`
                : r.entityType === "material_need_source"
                  ? `Dodávka „${needName.get(srcNeed.get(r.entityId) ?? "") ?? "?"}“ – položka rozpočtu`
                  : r.entityType === "budget_item"
                    ? `Položka rozpočtu ${itemName.get(r.entityId) ?? ""}`
                    : r.entityType === "budget_import"
                      ? "Import rozpočtu"
                      : "Zakázka",
  }));
}
