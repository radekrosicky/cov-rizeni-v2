// Dokumenty zakázky a jejich revize (V2-2).
//
// Nahrání (nový dokument i nová revize) jako JEDNA logická operace:
//   1) oprávnění + kontrola dokumentu/verze ještě PŘED přijetím dat,
//   2) průběžné přijetí do dočasného souboru s limitem velikosti (přerušení / překročení → dočasný soubor smazán),
//   3) ověření typu podle obsahu (XLSX/DOCX včetně struktury a skutečně rozbaleného obsahu),
//   4) přesun na nový klíč – nikdy nepřepíše existující soubor,
//   5) jedna transakce: revize + ukazatel aktuální revize + historie (znovu ověří oprávnění a verzi).
//   Selže-li 3–5, soubor se smaže a v databázi nic nevznikne → nikdy „poškozený dokument, který se tváří jako platný“.
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, max, sql } from "drizzle-orm";
import { canProject } from "../../domain/access/permissions.ts";
import { isIsoDate } from "../../domain/calendar/calendar.ts";
import { FILE_KIND_INFO, maxUploadBytes, sanitizeFilename, titleFromFilename, formatBytes } from "../../domain/documents/fileKinds.ts";
import { DOCUMENT_CATEGORIES, type DocumentCategory } from "../../domain/values.ts";
import type { Db, DbOrTx } from "../db/client.ts";
import { documentRevisions, documents, users } from "../db/schema.ts";
import { inspectUploadedFile } from "../documents/inspect.ts";
import { DomainError } from "../errors.ts";
import { revisionStorageKey, UploadTooLargeError, type FileStorage } from "../storage/fileStorage.ts";
import { conflictError, diff, isUuid, requireProject, requireReason, writeHistory, type SessionActor } from "./common.ts";

export interface UploadMeta {
  /** Prázdné = nový dokument; jinak nová revize existujícího dokumentu. */
  documentId: string | null;
  /** U nové revize: verze dokumentu, kterou uživatel viděl (ochrana před souběžným nahráním). */
  expectedVersion: number | null;
  category: string | null;
  title: string | null;
  documentDate: string | null;
  revisionLabel: string | null;
  note: string | null;
  filename: string;
}

const STALE_TEMP_MS = 60 * 60 * 1000;

function cleanText(v: string | null, maxLen: number): string | null {
  const t = (v ?? "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, maxLen) : null;
}

function validateMeta(meta: UploadMeta) {
  const fieldErrors: Record<string, string> = {};
  const filename = sanitizeFilename(meta.filename);
  const isNew = !meta.documentId;
  const category = meta.category as DocumentCategory | null;
  if (isNew && !(DOCUMENT_CATEGORIES as readonly string[]).includes(meta.category ?? "")) fieldErrors.category = "Vyberte druh dokumentu.";
  const documentDate = cleanText(meta.documentDate, 10);
  if (documentDate && !isIsoDate(documentDate)) fieldErrors.documentDate = "Neplatné datum.";
  if (Object.keys(fieldErrors).length) throw new DomainError("validation", "Formulář obsahuje chyby.", fieldErrors);
  return {
    isNew,
    filename,
    category,
    title: cleanText(meta.title, 200) ?? titleFromFilename(filename),
    documentDate,
    revisionLabel: cleanText(meta.revisionLabel, 40),
    note: cleanText(meta.note, 2000),
  };
}

async function loadDocument(db: DbOrTx, projectId: string, documentId: string) {
  if (!isUuid(documentId)) throw new DomainError("not_found", "Dokument nebyl nalezen.");
  const [d] = await db.select().from(documents).where(and(eq(documents.id, documentId), eq(documents.projectId, projectId)));
  if (!d) throw new DomainError("not_found", "Dokument nebyl nalezen.");
  return d;
}

export async function uploadDocumentRevision(
  db: Db,
  storage: FileStorage,
  actor: SessionActor,
  projectId: string,
  meta: UploadMeta,
  body: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
  env: Record<string, string | undefined> = process.env,
) {
  const v = validateMeta(meta);
  // 1) Oprávnění a stav dokumentu ještě před přijetím dat.
  await requireProject(db, actor, projectId, "document.manage");
  if (!v.isNew) {
    const d = await loadDocument(db, projectId, meta.documentId!);
    if (d.status !== "active") throw new DomainError("validation", "Do archivovaného dokumentu nelze nahrát revizi.");
    if (meta.expectedVersion !== null && d.version !== meta.expectedVersion) throw conflictError();
  }
  void storage.cleanupStaleTemp(STALE_TEMP_MS).catch(() => {});

  // 2) Průběžné přijetí s limitem.
  const limit = maxUploadBytes(env);
  let received;
  try {
    received = await storage.receive(body, limit);
  } catch (e) {
    if (e instanceof UploadTooLargeError) {
      throw new DomainError("too_large", `Soubor je větší než povolený limit ${formatBytes(limit)}. Nic nebylo uloženo.`);
    }
    throw new DomainError("validation", "Nahrávání bylo přerušeno. Nic nebylo uloženo – zkuste to znovu.");
  }

  let committedKey: string | null = null;
  try {
    // 3) Ověření typu podle obsahu.
    const inspected = await inspectUploadedFile(storage, received, v.filename);
    if (!inspected.ok) throw new DomainError("validation", inspected.message, { file: inspected.message });

    // 4) Uložení na nový klíč (nikdy nepřepíše existující soubor).
    const revisionId = randomUUID();
    const key = revisionStorageKey(projectId, revisionId);
    await storage.commit(received.tempId, key);
    committedKey = key;

    // 5) Jedna transakce: dokument / revize / aktuální revize / historie.
    const result = await db.transaction(async (tx) => {
      await requireProject(tx, actor, projectId, "document.manage");
      let documentId: string;
      let revisionNo: number;
      if (v.isNew) {
        const [d] = await tx
          .insert(documents)
          .values({ projectId, category: v.category!, title: v.title, note: v.note, createdBy: actor.id, updatedBy: actor.id })
          .returning();
        documentId = d!.id;
        revisionNo = 1;
        await writeHistory(tx, {
          actorId: actor.id,
          projectId,
          entityType: "document",
          entityId: documentId,
          action: "create",
          changes: { title: { before: null, after: v.title }, category: { before: null, after: v.category } },
        });
      } else {
        // Zámek řádku dokumentu: dvě souběžná nahrání se seřadí; druhé uvidí novou verzi → konflikt.
        const [d] = await tx
          .select()
          .from(documents)
          .where(and(eq(documents.id, meta.documentId!), eq(documents.projectId, projectId)))
          .for("update");
        if (!d) throw new DomainError("not_found", "Dokument nebyl nalezen.");
        if (d.status !== "active") throw new DomainError("validation", "Do archivovaného dokumentu nelze nahrát revizi.");
        if (meta.expectedVersion !== null && d.version !== meta.expectedVersion) throw conflictError();
        documentId = d.id;
        const [m] = await tx.select({ n: max(documentRevisions.revisionNo) }).from(documentRevisions).where(eq(documentRevisions.documentId, d.id));
        revisionNo = (m?.n ?? 0) + 1;
      }
      await tx.insert(documentRevisions).values({
        id: revisionId,
        documentId,
        revisionNo,
        revisionLabel: v.revisionLabel,
        documentDate: v.documentDate,
        originalFilename: v.filename,
        fileKind: inspected.kind,
        sizeBytes: received.sizeBytes,
        sha256: received.sha256,
        storageKey: key,
        // Poznámka nového dokumentu patří dokumentu; u další revize popisuje tuto revizi.
        note: v.isNew ? null : v.note,
        uploadedBy: actor.id,
      });
      const updated = await tx
        .update(documents)
        .set({ currentRevisionId: revisionId, ...(v.isNew ? {} : { version: sql`${documents.version} + 1` }), updatedBy: actor.id, updatedAt: new Date() })
        .where(eq(documents.id, documentId))
        .returning({ id: documents.id });
      if (!updated.length) throw conflictError();
      await writeHistory(tx, {
        actorId: actor.id,
        projectId,
        entityType: "document_revision",
        entityId: revisionId,
        action: "upload_revision",
        changes: {
          revisionNo: { before: null, after: revisionNo },
          file: { before: null, after: `${v.filename} (${formatBytes(received.sizeBytes)})` },
        },
      });
      return { documentId, revisionId, revisionNo };
    });
    return result;
  } catch (e) {
    // Nic nesmí zůstat napůl: uložený soubor bez záznamu smazat, dočasný soubor uklidit.
    if (committedKey) await storage.rollbackCommitted(committedKey).catch(() => {});
    throw e;
  } finally {
    await storage.discard(received.tempId).catch(() => {});
  }
}

// ---------- Změny bez souboru (malé formuláře) ----------

export async function setCurrentRevision(db: Db, actor: SessionActor, projectId: string, documentId: string, revisionId: string, version: number, reason: string) {
  const r = requireReason(reason);
  await db.transaction(async (tx) => {
    await requireProject(tx, actor, projectId, "document.manage");
    const d = await loadDocument(tx, projectId, documentId);
    if (d.status !== "active") throw new DomainError("validation", "Archivovaný dokument nelze měnit.");
    if (!isUuid(revisionId)) throw new DomainError("not_found", "Revize nebyla nalezena.");
    const [rev] = await tx.select().from(documentRevisions).where(and(eq(documentRevisions.id, revisionId), eq(documentRevisions.documentId, d.id)));
    if (!rev) throw new DomainError("not_found", "Revize nebyla nalezena.");
    if (d.currentRevisionId === rev.id) return;
    const [prev] = d.currentRevisionId
      ? await tx.select({ n: documentRevisions.revisionNo }).from(documentRevisions).where(eq(documentRevisions.id, d.currentRevisionId))
      : [];
    const updated = await tx
      .update(documents)
      .set({ currentRevisionId: rev.id, version: d.version + 1, updatedBy: actor.id, updatedAt: new Date() })
      .where(and(eq(documents.id, d.id), eq(documents.version, version)))
      .returning({ id: documents.id });
    if (!updated.length) throw conflictError();
    await writeHistory(tx, {
      actorId: actor.id,
      projectId,
      entityType: "document",
      entityId: d.id,
      action: "set_current_revision",
      changes: { currentRevision: { before: prev ? `rev. ${prev.n}` : null, after: `rev. ${rev.revisionNo}` } },
      reason: r,
    });
  });
}

export async function updateDocumentInfo(
  db: Db,
  actor: SessionActor,
  projectId: string,
  documentId: string,
  version: number,
  input: { title: string; category: string; note: string | null },
) {
  const title = cleanText(input.title, 200);
  const fieldErrors: Record<string, string> = {};
  if (!title) fieldErrors.title = "Vyplňte název.";
  if (!(DOCUMENT_CATEGORIES as readonly string[]).includes(input.category)) fieldErrors.category = "Vyberte druh dokumentu.";
  if (Object.keys(fieldErrors).length) throw new DomainError("validation", "Formulář obsahuje chyby.", fieldErrors);
  await db.transaction(async (tx) => {
    await requireProject(tx, actor, projectId, "document.manage");
    const before = await loadDocument(tx, projectId, documentId);
    if (before.status !== "active") throw new DomainError("validation", "Archivovaný dokument nelze měnit.");
    const [after] = await tx
      .update(documents)
      .set({ title: title!, category: input.category as DocumentCategory, note: cleanText(input.note, 2000), version: before.version + 1, updatedBy: actor.id, updatedAt: new Date() })
      .where(and(eq(documents.id, documentId), eq(documents.version, version)))
      .returning();
    if (!after) throw conflictError();
    const changes = diff(before, after, ["title", "category", "note"]);
    if (Object.keys(changes).length) {
      await writeHistory(tx, { actorId: actor.id, projectId, entityType: "document", entityId: documentId, action: "update", changes });
    }
  });
}

export async function archiveDocument(db: Db, actor: SessionActor, projectId: string, documentId: string, version: number, reason: string) {
  const r = requireReason(reason);
  await db.transaction(async (tx) => {
    await requireProject(tx, actor, projectId, "document.manage");
    const d = await loadDocument(tx, projectId, documentId);
    if (d.status === "archived") throw new DomainError("validation", "Dokument už je archivovaný.");
    const updated = await tx
      .update(documents)
      .set({ status: "archived", archivedAt: new Date(), archivedBy: actor.id, archiveReason: r, version: d.version + 1, updatedBy: actor.id, updatedAt: new Date() })
      .where(and(eq(documents.id, documentId), eq(documents.version, version)))
      .returning({ id: documents.id });
    if (!updated.length) throw conflictError();
    await writeHistory(tx, { actorId: actor.id, projectId, entityType: "document", entityId: documentId, action: "archive", changes: { status: { before: "active", after: "archived" } }, reason: r });
  });
}

export async function unarchiveDocument(db: Db, actor: SessionActor, projectId: string, documentId: string, version: number, reason: string) {
  const r = requireReason(reason);
  await db.transaction(async (tx) => {
    await requireProject(tx, actor, projectId, "document.manage");
    const d = await loadDocument(tx, projectId, documentId);
    if (d.status !== "archived") throw new DomainError("validation", "Dokument není archivovaný.");
    const updated = await tx
      .update(documents)
      .set({ status: "active", archivedAt: null, archivedBy: null, archiveReason: null, version: d.version + 1, updatedBy: actor.id, updatedAt: new Date() })
      .where(and(eq(documents.id, documentId), eq(documents.version, version)))
      .returning({ id: documents.id });
    if (!updated.length) throw conflictError();
    await writeHistory(tx, { actorId: actor.id, projectId, entityType: "document", entityId: documentId, action: "unarchive", changes: { status: { before: "archived", after: "active" } }, reason: r });
  });
}

// ---------- Čtení ----------

async function projectCan(db: Db, actor: SessionActor, projectId: string) {
  const { project, membership } = await requireProject(db, actor, projectId, "document.view");
  return { project, manage: canProject(actor, "document.manage", { status: project.status, membership }).allowed };
}

export async function listDocuments(db: Db, actor: SessionActor, projectId: string) {
  const { manage } = await projectCan(db, actor, projectId);
  const docs = await db.select().from(documents).where(eq(documents.projectId, projectId));
  if (!docs.length) return { manage, documents: [] };
  const revs = await db
    .select({
      id: documentRevisions.id,
      documentId: documentRevisions.documentId,
      revisionNo: documentRevisions.revisionNo,
      revisionLabel: documentRevisions.revisionLabel,
      documentDate: documentRevisions.documentDate,
      originalFilename: documentRevisions.originalFilename,
      fileKind: documentRevisions.fileKind,
      sizeBytes: documentRevisions.sizeBytes,
      uploadedAt: documentRevisions.uploadedAt,
      uploadedByName: users.displayName,
    })
    .from(documentRevisions)
    .innerJoin(users, eq(users.id, documentRevisions.uploadedBy))
    .where(inArray(documentRevisions.documentId, docs.map((d) => d.id)));
  return {
    manage,
    documents: docs
      .map((d) => {
        const own = revs.filter((r) => r.documentId === d.id);
        return { ...d, revisionCount: own.length, current: own.find((r) => r.id === d.currentRevisionId) ?? null };
      })
      .sort((a, b) => (b.current?.uploadedAt.getTime() ?? 0) - (a.current?.uploadedAt.getTime() ?? 0)),
  };
}

export async function getDocumentDetail(db: Db, actor: SessionActor, projectId: string, documentId: string) {
  const { manage } = await projectCan(db, actor, projectId);
  const document = await loadDocument(db, projectId, documentId);
  const revisions = await db
    .select({ r: documentRevisions, uploadedByName: users.displayName })
    .from(documentRevisions)
    .innerJoin(users, eq(users.id, documentRevisions.uploadedBy))
    .where(eq(documentRevisions.documentId, documentId))
    .orderBy(desc(documentRevisions.revisionNo));
  return {
    manage: manage && document.status === "active",
    /** Obnovit archivovaný dokument smí stejný okruh lidí, který ho smí spravovat. */
    canUnarchive: manage && document.status === "archived",
    document,
    revisions: revisions.map((x) => ({ ...x.r, uploadedByName: x.uploadedByName, isCurrent: x.r.id === document.currentRevisionId })),
  };
}

/** Soubor revize ke stažení / otevření – oprávnění podle KONKRÉTNÍ zakázky, revize musí patřit jejímu dokumentu. */
export async function openRevisionFile(db: Db, storage: FileStorage, actor: SessionActor, projectId: string, revisionId: string) {
  await requireProject(db, actor, projectId, "document.view");
  if (!isUuid(revisionId)) throw new DomainError("not_found", "Soubor nebyl nalezen.");
  const [row] = await db
    .select({ r: documentRevisions })
    .from(documentRevisions)
    .innerJoin(documents, eq(documents.id, documentRevisions.documentId))
    .where(and(eq(documentRevisions.id, revisionId), eq(documents.projectId, projectId)));
  if (!row) throw new DomainError("not_found", "Soubor nebyl nalezen.");
  const file = await storage.openRead(row.r.storageKey).catch(() => {
    throw new DomainError("not_found", "Soubor v úložišti chybí. Kontaktujte správce.");
  });
  return { revision: row.r, info: FILE_KIND_INFO[row.r.fileKind], ...file };
}
