// Návrh migrace 0002 (dokumenty) – ověření na DOČASNÝCH databázích v paměti.
// 1) Přechod z existující databáze V2-1: data z V2-1 se nezmění.
// 2) Ochrany dokumentů a revizí vynucené přímo databází.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { seedDevData } from "../seed/devSeed.ts";
import { openDb, type Db } from "./client.ts";
import { MIGRATIONS_FOLDER } from "./migrate.ts";
import { documentRevisions, documents, historyEntries, projects, users } from "./schema.ts";
import { createTestDb } from "./testDb.ts";

/** Složka jen s migracemi V2-1 (0000, 0001) – simuluje stávající databázi před V2-2. */
function v21OnlyMigrationsFolder(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cov-migrace-v21-"));
  fs.mkdirSync(path.join(dir, "meta"));
  const journal = JSON.parse(fs.readFileSync(path.join(MIGRATIONS_FOLDER, "meta/_journal.json"), "utf8"));
  journal.entries = journal.entries.filter((e: { tag: string }) => e.tag.startsWith("0000_") || e.tag.startsWith("0001_"));
  fs.writeFileSync(path.join(dir, "meta/_journal.json"), JSON.stringify(journal));
  for (const e of journal.entries as { tag: string }[]) fs.copyFileSync(path.join(MIGRATIONS_FOLDER, `${e.tag}.sql`), path.join(dir, `${e.tag}.sql`));
  return dir;
}

async function snapshotV21(db: Db) {
  const out: Record<string, unknown> = {};
  for (const t of ["users", "projects", "project_members", "events", "history_entries"]) {
    const r = await db.execute(sql.raw(`select md5(coalesce(string_agg(t::text, '|' order by t::text), '')) as h, count(*) as n from ${t} t`));
    out[t] = r.rows[0];
  }
  return out;
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

describe("migrace 0002 – přechod ze stávající databáze V2-1", () => {
  it("projde na databázi s daty V2-1 a žádná existující data nezmění", async () => {
    const { db, client } = openDb();
    try {
      await migrate(db, { migrationsFolder: v21OnlyMigrationsFolder() });
      await seedDevData(db);
      const before = await snapshotV21(db);
      await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER }); // doplní jen 0002
      expect(await snapshotV21(db)).toEqual(before);
      const t = await db.execute<{ n: number }>(sql`select count(*)::int as n from information_schema.tables where table_schema = 'public'`);
      expect(t.rows[0]!.n).toBe(11); // 0002 + 0003 (v testu se aplikují všechny migrace ve složce)
      // Staré druhy záznamů historie zůstávají platné.
      expect(await db.$count(historyEntries)).toBeGreaterThan(0);
    } finally {
      await client.close();
    }
  });
});

describe("migrace 0002 – ochrany dokumentů a revizí", () => {
  let db: Db;
  let client: PGlite;
  let userId: string;
  let projectId: string;
  let otherProjectId: string;

  /** Dokument + revize 1 v jedné transakci (tak to bude dělat služba). */
  async function addDocument(title = "Smlouva o dílo (FIKTIVNÍ)", pid = projectId, key = `projects/${pid}/r-${Math.random().toString(16).slice(2)}`) {
    return db.transaction(async (tx) => {
      const [d] = await tx.insert(documents).values({ projectId: pid, category: "contract", title, createdBy: userId, updatedBy: userId }).returning();
      const [r] = await tx
        .insert(documentRevisions)
        .values({ documentId: d!.id, revisionNo: 1, originalFilename: "smlouva-fiktivni.pdf", fileKind: "pdf", sizeBytes: 1234, sha256: sha("a"), storageKey: key, uploadedBy: userId })
        .returning();
      await tx.update(documents).set({ currentRevisionId: r!.id }).where(eq(documents.id, d!.id));
      return { doc: d!, rev: r! };
    });
  }

  const revisionValues = (documentId: string, over: Partial<typeof documentRevisions.$inferInsert> = {}) => ({
    documentId,
    revisionNo: 2,
    originalFilename: "vykres-rev-b.pdf",
    fileKind: "pdf" as const,
    sizeBytes: 2048,
    sha256: sha("b"),
    storageKey: `projects/${projectId}/r-${Math.random().toString(16).slice(2)}`,
    uploadedBy: userId,
    ...over,
  });

  beforeEach(async () => {
    ({ db, client } = await createTestDb());
    const seeded = await seedDevData(db);
    userId = seeded.users[0]!.id;
    [projectId, otherProjectId] = seeded.projects as [string, string];
  });
  afterEach(async () => {
    await client.close();
  });

  it("dokument s první revizí jde založit v jedné transakci", async () => {
    const { doc, rev } = await addDocument();
    const [d] = await db.select().from(documents).where(eq(documents.id, doc.id));
    expect(d!.currentRevisionId).toBe(rev.id);
  });

  it("dokument bez aktuální revize nelze uložit", async () => {
    const msg = await pgError(db.insert(documents).values({ projectId, category: "other", title: "Bez souboru", createdBy: userId, updatedBy: userId }));
    expect(msg).toMatch(/musí mít aktuální revizi/);
  });

  it("nová revize: předchozí zůstane dostupná, aktuální je právě jedna a jednoznačná", async () => {
    const { doc, rev } = await addDocument();
    await db.transaction(async (tx) => {
      const [r2] = await tx.insert(documentRevisions).values(revisionValues(doc.id)).returning();
      await tx.update(documents).set({ currentRevisionId: r2!.id, version: 2 }).where(eq(documents.id, doc.id));
    });
    const revs = await db.select().from(documentRevisions).where(eq(documentRevisions.documentId, doc.id));
    expect(revs.map((r) => r.revisionNo).sort()).toEqual([1, 2]);
    const [d] = await db.select().from(documents).where(eq(documents.id, doc.id));
    expect(d!.currentRevisionId).not.toBe(rev.id);
    // Návrat ke starší revizi (oprava omylu) je možný – stále jen jeden ukazatel.
    await db.update(documents).set({ currentRevisionId: rev.id }).where(eq(documents.id, doc.id));
  });

  it("aktuální revize nesmí patřit jinému dokumentu", async () => {
    const a = await addDocument("Dokument A");
    const b = await addDocument("Dokument B");
    const msg = await pgError(db.update(documents).set({ currentRevisionId: b.rev.id }).where(eq(documents.id, a.doc.id)));
    expect(msg).toMatch(/documents_current_revision_same_document_fk/);
  });

  it("revizi nelze upravit, smazat ani vyprázdnit tabulku – stará verze vždy zůstane", async () => {
    const { rev } = await addDocument();
    const where = eq(documentRevisions.id, rev.id);
    expect(await pgError(db.update(documentRevisions).set({ note: "přepis" }).where(where))).toMatch(/neměnná/);
    expect(await pgError(db.update(documentRevisions).set({ storageKey: "projects/x/jiny" }).where(where))).toMatch(/neměnná/);
    expect(await pgError(db.delete(documentRevisions).where(where))).toMatch(/neměnná/);
    expect(await pgError(db.execute(sql`truncate document_revisions cascade`))).toMatch(/neměnná|truncate/i);
    expect(await db.$count(documentRevisions)).toBe(1);
  });

  it("existující soubor nelze přepsat jinou revizí (jedinečný klíč) ani zdvojit číslo revize", async () => {
    const { doc, rev } = await addDocument();
    expect(await pgError(db.insert(documentRevisions).values(revisionValues(doc.id, { storageKey: rev.storageKey })))).toMatch(/storage_key_unique/);
    expect(await pgError(db.insert(documentRevisions).values(revisionValues(doc.id, { revisionNo: 1 })))).toMatch(/document_revisions_no_unique/);
  });

  it("nebezpečné nebo neplatné údaje revize databáze odmítne", async () => {
    const { doc } = await addDocument();
    const cases: [Partial<typeof documentRevisions.$inferInsert>, RegExp][] = [
      [{ storageKey: `projects/${projectId}/../jina-zakazka` }, /storage_key_safe/],
      [{ storageKey: "/etc/passwd" }, /storage_key_safe/],
      [{ originalFilename: "../../tajne.pdf" }, /filename_valid/],
      [{ originalFilename: "c:\\windows\\x.pdf" }, /filename_valid/],
      [{ originalFilename: "radek\nnovy.pdf" }, /filename_valid/],
      [{ fileKind: "zip" as never }, /file_kind_valid/],
      [{ sizeBytes: 0 }, /size_valid/],
      [{ sha256: "ABC" }, /sha256_format/],
      [{ revisionLabel: "  " }, /label_not_blank/],
    ];
    for (const [over, re] of cases) expect(await pgError(db.insert(documentRevisions).values(revisionValues(doc.id, over)))).toMatch(re);
  });

  it("dokument nelze přesunout do jiné zakázky ani archivovat bez důvodu", async () => {
    const { doc } = await addDocument();
    expect(await pgError(db.update(documents).set({ projectId: otherProjectId }).where(eq(documents.id, doc.id)))).toMatch(/přesunout/);
    expect(await pgError(db.update(documents).set({ status: "archived", archivedAt: new Date(), archivedBy: userId }).where(eq(documents.id, doc.id)))).toMatch(
      /documents_archive_consistent/,
    );
    await db.update(documents).set({ status: "archived", archivedAt: new Date(), archivedBy: userId, archiveReason: "Duplicitní (fiktivní)" }).where(eq(documents.id, doc.id));
  });

  it("dokument ani zakázku s dokumenty nelze fyzicky smazat", async () => {
    const { doc } = await addDocument();
    expect(await pgError(db.delete(documents).where(eq(documents.id, doc.id)))).toMatch(/foreign key|violates/i);
    expect(await pgError(db.delete(projects).where(eq(projects.id, projectId)))).toMatch(/foreign key|violates/i);
  });

  it("historie přijme nové druhy záznamů dokumentů a dál odmítá neznámé", async () => {
    const { doc, rev } = await addDocument();
    await db.insert(historyEntries).values([
      { actorUserId: userId, projectId, entityType: "document", entityId: doc.id, action: "create" },
      { actorUserId: userId, projectId, entityType: "document_revision", entityId: rev.id, action: "upload_revision" },
      { actorUserId: userId, projectId, entityType: "document", entityId: doc.id, action: "set_current_revision", reason: "Omylem nahraná revize" },
    ]);
    const msg = await pgError(db.execute(sql`insert into history_entries (actor_user_id, entity_type, entity_id, action) values (${userId}, 'document', 'x', 'delete_file')`));
    expect(msg).toMatch(/history_action_valid/);
    const [u] = await db.select().from(users).where(and(eq(users.id, userId)));
    expect(u).toBeTruthy();
  });
});

describe("pojistka schvalování migrací", () => {
  it("všechny migrace ve složce drizzle/ jsou schválené (0000–0003)", async () => {
    const { pendingApproval } = await import("./migrate.ts");
    expect(pendingApproval()).toEqual([]);
  });
});
