// Historie změn zakázky. Čtou ji všichni s přístupem k zakázce, včetně sledujících (Q7).
import { desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { documentRevisions, documents, events, historyEntries, users } from "../db/schema.ts";
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
              : "Zakázka",
  }));
}
