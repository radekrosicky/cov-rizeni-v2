// Dokumenty – serverová logika nad DOČASNOU databází a DOČASNOU složkou souborů (jen fiktivní soubory).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../db/client.ts";
import { documentRevisions, documents, historyEntries, projects } from "../db/schema.ts";
import { createTestDb } from "../db/testDb.ts";
import { DomainError } from "../errors.ts";
import { seedDevData } from "../seed/devSeed.ts";
import { fictiveDocx, fictivePdf, fictivePng, fictiveXlsx } from "../seed/fictiveFiles.ts";
import { LocalFileStorage } from "../storage/localFileStorage.ts";
import type { SessionActor } from "./common.ts";
import {
  archiveDocument,
  getDocumentDetail,
  listDocuments,
  openRevisionFile,
  setCurrentRevision,
  unarchiveDocument,
  updateDocumentInfo,
  uploadDocumentRevision,
  type UploadMeta,
} from "./documents.ts";
import { listProjectHistory } from "./history.ts";
import { archiveProject } from "./projects.ts";

let db: Db;
let client: PGlite;
let root: string;
let storage: LocalFileStorage;
let admin: SessionActor, deputy: SessionActor, viewer1: SessionActor, viewer2: SessionActor;
let p1: string, p3: string;

const MB = 1024 * 1024;
const meta = (over: Partial<UploadMeta> = {}): UploadMeta => ({
  documentId: null,
  expectedVersion: null,
  category: "contract",
  title: null,
  documentDate: null,
  revisionLabel: null,
  note: null,
  filename: "smlouva-fiktivni.pdf",
  ...over,
});
const pdf = (t = "x") => [fictivePdf([t])];
/** Otevře soubor revize a hned ho zavře (testy, které jen ověřují přístup). */
async function openAndClose(...args: Parameters<typeof openRevisionFile>) {
  const f = await openRevisionFile(...args);
  f.stream.destroy();
  return f;
}

async function expectError(p: Promise<unknown>, code: DomainError["code"], message?: RegExp) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err, String(err)).toBeInstanceOf(DomainError);
  expect((err as DomainError).code).toBe(code);
  if (message) expect((err as DomainError).message).toMatch(message);
}

/** Všechny soubory v úložišti (mimo .tmp) a dočasné soubory. */
function filesOnDisk() {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else out.push(path.relative(root, f));
    }
  };
  if (fs.existsSync(root)) walk(root);
  return { stored: out.filter((f) => !f.startsWith(".tmp")), temp: out.filter((f) => f.startsWith(".tmp")) };
}

/** Velký „PDF“ soubor po 1 MB (nikdy celý v paměti). */
function* bigPdf(totalBytes: number) {
  const head = new TextEncoder().encode("%PDF-1.4\n% FIKTIVNI velky soubor\n");
  let sent = 0;
  const chunk = new Uint8Array(MB);
  while (sent < totalBytes) {
    const n = Math.min(MB, totalBytes - sent);
    if (sent === 0) {
      const first = new Uint8Array(n);
      first.set(head);
      yield first;
    } else yield chunk.subarray(0, n);
    sent += n;
  }
}

async function readAll(stream: NodeJS.ReadableStream) {
  const parts: Buffer[] = [];
  for await (const c of stream) parts.push(c as Buffer);
  return Buffer.concat(parts);
}

beforeEach(async () => {
  ({ db, client } = await createTestDb());
  root = fs.mkdtempSync(path.join(os.tmpdir(), "cov-docs-"));
  storage = new LocalFileStorage(root);
  const seeded = await seedDevData(db);
  [admin, deputy, viewer1, viewer2] = seeded.users as [SessionActor, SessionActor, SessionActor, SessionActor];
  [p1, , p3] = seeded.projects as [string, string, string];
});
afterEach(async () => {
  await client.close();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("nový dokument = jedna logická operace (pravidlo 1)", () => {
  it("vznikne dokument, revize 1 jako aktuální, soubor v úložišti a historie – vše najednou", async () => {
    const r = await uploadDocumentRevision(db, storage, deputy, p1, meta({ documentDate: "2026-09-15" }), pdf());
    const [d] = await db.select().from(documents).where(eq(documents.id, r.documentId));
    const revs = await db.select().from(documentRevisions).where(eq(documentRevisions.documentId, r.documentId));
    expect(d!.currentRevisionId).toBe(r.revisionId);
    expect(revs).toHaveLength(1);
    expect(revs[0]).toMatchObject({ revisionNo: 1, fileKind: "pdf", documentDate: "2026-09-15", originalFilename: "smlouva-fiktivni.pdf" });
    expect(d!.title).toBe("smlouva-fiktivni");
    expect(filesOnDisk()).toEqual({ stored: [`projects/${p1}/${r.revisionId}`], temp: [] });
    const hist = await db.select().from(historyEntries).where(eq(historyEntries.projectId, p1));
    expect(hist.filter((h) => h.entityType.startsWith("document")).map((h) => h.action).sort()).toEqual(["create", "upload_revision"]);
  });

  it("selže-li zápis do databáze po uložení souboru, soubor se smaže a dokument nevznikne", async () => {
    // Během přenosu někdo zakázku archivuje → transakce odmítne zápis.
    async function* bodyThatArchives() {
      yield fictivePdf(["x"]);
      const [p] = await db.select().from(projects).where(eq(projects.id, p3));
      await archiveProject(db, admin, p3, p!.version, "Test souběhu (fiktivní)");
    }
    await expectError(uploadDocumentRevision(db, storage, deputy, p3, meta(), bodyThatArchives()), "forbidden");
    expect(await db.$count(documents)).toBe(0);
    expect(await db.$count(documentRevisions)).toBe(0);
    expect(filesOnDisk()).toEqual({ stored: [], temp: [] });
  });
});

describe("neúspěšné a přerušené nahrání nic nezanechá (pravidlo 2)", () => {
  it("přerušený přenos: žádný dokument, žádný soubor, žádný dočasný soubor", async () => {
    async function* broken() {
      yield fictivePdf(["zacatek"]);
      yield new Uint8Array(3 * MB);
      throw new Error("ECONNRESET");
    }
    await expectError(uploadDocumentRevision(db, storage, deputy, p1, meta(), broken()), "validation", /přerušeno/);
    expect(await db.$count(documents)).toBe(0);
    expect(filesOnDisk()).toEqual({ stored: [], temp: [] });
  });

  it("nepovolený typ: odmítnuto a uklizeno", async () => {
    await expectError(uploadDocumentRevision(db, storage, deputy, p1, meta({ filename: "faktura.pdf" }), [new TextEncoder().encode("<html>x</html>")]), "validation", /není povolený/);
    expect(filesOnDisk()).toEqual({ stored: [], temp: [] });
    expect(await db.$count(documents)).toBe(0);
  });
});

describe("skutečný limit 50 MB (pravidlo 5)", () => {
  it("soubor přesně 50 MB projde, o 1 bajt větší je odmítnut a uklizen", { timeout: 60_000 }, async () => {
    const ok = await uploadDocumentRevision(db, storage, deputy, p1, meta({ filename: "velky-fiktivni.pdf" }), bigPdf(50 * MB), {});
    const [rev] = await db.select().from(documentRevisions).where(eq(documentRevisions.id, ok.revisionId));
    expect(rev!.sizeBytes).toBe(50 * MB);
    await expectError(uploadDocumentRevision(db, storage, deputy, p1, meta({ filename: "prilis-velky.pdf" }), bigPdf(50 * MB + 1), {}), "too_large", /50,0 MB/);
    expect(filesOnDisk().temp).toEqual([]);
    expect(filesOnDisk().stored).toHaveLength(1);
    expect(await db.$count(documents)).toBe(1);
  });

  it("limit je nastavitelný (MAX_UPLOAD_MB)", async () => {
    await expectError(uploadDocumentRevision(db, storage, deputy, p1, meta(), bigPdf(2 * MB), { MAX_UPLOAD_MB: "1" }), "too_large", /1,0 MB/);
  });
});

describe("revize – stará vždy zůstane, aktuální je jednoznačná (pravidlo 5)", () => {
  it("nová revize se stane aktuální; předchozí zůstane jako nahrazená a jde dál stáhnout", async () => {
    const first = await uploadDocumentRevision(db, storage, deputy, p1, meta({ category: "design", title: "Výkres D.1.3", filename: "d13-a.pdf", revisionLabel: "A" }), pdf("rev A"));
    const second = await uploadDocumentRevision(db, storage, deputy, p1, meta({ documentId: first.documentId, expectedVersion: 1, filename: "d13-b.pdf", revisionLabel: "B", note: "Posun dmychadla" }), pdf("rev B"));
    expect(second.revisionNo).toBe(2);
    const detail = await getDocumentDetail(db, viewer1, p1, first.documentId);
    expect(detail.revisions.map((r) => [r.revisionNo, r.revisionLabel, r.isCurrent])).toEqual([
      [2, "B", true],
      [1, "A", false],
    ]);
    const old = await openRevisionFile(db, storage, viewer1, p1, first.revisionId);
    expect((await readAll(old.stream)).toString()).toContain("rev A");
    expect(filesOnDisk().stored).toHaveLength(2);
  });

  it("souběžné nahrání se starou verzí skončí konfliktem a nic nepřidá", async () => {
    const first = await uploadDocumentRevision(db, storage, deputy, p1, meta({ filename: "v.pdf" }), pdf());
    await uploadDocumentRevision(db, storage, deputy, p1, meta({ documentId: first.documentId, expectedVersion: 1, filename: "v2.pdf" }), pdf());
    await expectError(uploadDocumentRevision(db, storage, admin, p1, meta({ documentId: first.documentId, expectedVersion: 1, filename: "v2b.pdf" }), pdf()), "conflict");
    expect(await db.$count(documentRevisions)).toBe(2);
    expect(filesOnDisk()).toMatchObject({ temp: [] });
    expect(filesOnDisk().stored).toHaveLength(2);
  });

  it("označení starší revize jako aktuální jen s důvodem a do historie", async () => {
    const first = await uploadDocumentRevision(db, storage, deputy, p1, meta({ filename: "a.pdf" }), pdf());
    await uploadDocumentRevision(db, storage, deputy, p1, meta({ documentId: first.documentId, expectedVersion: 1, filename: "b.pdf" }), pdf());
    await expectError(setCurrentRevision(db, deputy, p1, first.documentId, first.revisionId, 2, " "), "validation");
    await setCurrentRevision(db, deputy, p1, first.documentId, first.revisionId, 2, "Revize B nahrána omylem (fiktivní)");
    const detail = await getDocumentDetail(db, admin, p1, first.documentId);
    expect(detail.revisions.find((r) => r.isCurrent)!.revisionNo).toBe(1);
    expect(detail.revisions).toHaveLength(2);
    const h = (await listProjectHistory(db, viewer1, p1)).find((x) => x.action === "set_current_revision");
    expect(h?.reason).toBe("Revize B nahrána omylem (fiktivní)");
  });

  it("XLSX, DOCX a fotografie se uloží se správným druhem", async () => {
    const x = await uploadDocumentRevision(db, storage, deputy, p1, meta({ category: "budget", filename: "rozpocet.xlsx" }), [fictiveXlsx()]);
    const w = await uploadDocumentRevision(db, storage, deputy, p1, meta({ category: "site_meeting", filename: "zapis.docx" }), [fictiveDocx()]);
    const f = await uploadDocumentRevision(db, storage, deputy, p1, meta({ category: "photo", filename: "foto.png" }), [fictivePng()]);
    const kinds = await Promise.all([x, w, f].map(async (r) => (await openAndClose(db, storage, deputy, p1, r.revisionId)).revision.fileKind));
    expect(kinds).toEqual(["xlsx", "docx", "png"]);
  });
});

describe("oprávnění vždy na serveru podle konkrétní zakázky (pravidlo 4)", () => {
  it("sledující: prohlíží a stahuje, ale nenahraje, nezmění aktuální revizi, nearchivuje, neupraví", async () => {
    const d = await uploadDocumentRevision(db, storage, deputy, p1, meta(), pdf());
    expect((await listDocuments(db, viewer1, p1)).manage).toBe(false);
    expect((await openAndClose(db, storage, viewer1, p1, d.revisionId)).sizeBytes).toBeGreaterThan(0);
    await expectError(uploadDocumentRevision(db, storage, viewer1, p1, meta(), pdf()), "forbidden");
    await expectError(uploadDocumentRevision(db, storage, viewer1, p1, meta({ documentId: d.documentId, expectedVersion: 1 }), pdf()), "forbidden");
    await expectError(setCurrentRevision(db, viewer1, p1, d.documentId, d.revisionId, 1, "x"), "forbidden");
    await expectError(archiveDocument(db, viewer1, p1, d.documentId, 1, "x"), "forbidden");
    await expectError(updateDocumentInfo(db, viewer1, p1, d.documentId, 1, { title: "x", category: "other", note: null }), "forbidden");
    expect(filesOnDisk().stored).toHaveLength(1);
  });

  it("uživatel bez přístupu k zakázce soubor nestáhne ani nevidí (404)", async () => {
    const d = await uploadDocumentRevision(db, storage, deputy, p1, meta(), pdf());
    await expectError(openRevisionFile(db, storage, viewer2, p1, d.revisionId), "not_found");
    await expectError(listDocuments(db, viewer2, p1), "not_found");
  });

  it("revizi nelze stáhnout přes adresu cizí zakázky (podvržené id)", async () => {
    const d = await uploadDocumentRevision(db, storage, deputy, p1, meta(), pdf());
    await expectError(openRevisionFile(db, storage, deputy, p3, d.revisionId), "not_found");
    await expectError(openRevisionFile(db, storage, deputy, p1, "../../etc/passwd"), "not_found");
  });

  it("archivovaná zakázka: stahovat lze, nahrávat nikdo (ani správce)", async () => {
    const d = await uploadDocumentRevision(db, storage, deputy, p3, meta(), pdf());
    const [p] = await db.select().from(projects).where(eq(projects.id, p3));
    await archiveProject(db, admin, p3, p!.version, "Konec (fiktivní)");
    expect((await openAndClose(db, storage, deputy, p3, d.revisionId)).sizeBytes).toBeGreaterThan(0);
    await expectError(uploadDocumentRevision(db, storage, admin, p3, meta(), pdf()), "forbidden", /archivovaná/);
  });

  it("zástupce smí archivovat dokument a změnit údaje – s důvodem a historií", async () => {
    const d = await uploadDocumentRevision(db, storage, deputy, p1, meta(), pdf());
    await updateDocumentInfo(db, deputy, p1, d.documentId, 1, { title: "Smlouva o dílo", category: "contract", note: "Podepsaná verze" });
    await archiveDocument(db, deputy, p1, d.documentId, 2, "Nahrazeno jiným dokumentem (fiktivní)");
    await expectError(uploadDocumentRevision(db, storage, deputy, p1, meta({ documentId: d.documentId, expectedVersion: 3 }), pdf()), "validation", /archivovaného/);
    await unarchiveDocument(db, deputy, p1, d.documentId, 3, "Omyl");
    const actions = (await listProjectHistory(db, viewer1, p1)).filter((h) => h.subject.startsWith("Dokument")).map((h) => h.action);
    expect(actions).toEqual(expect.arrayContaining(["create", "upload_revision", "update", "archive", "unarchive"]));
  });
});

describe("fiktivní data seedu", () => {
  it("seed s úložištěm vytvoří fiktivní dokumenty včetně výkresu ve dvou revizích", async () => {
    const fresh = await createTestDb();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cov-seed-"));
    try {
      const s = await seedDevData(fresh.db, new LocalFileStorage(dir));
      const list = await listDocuments(fresh.db, s.users[0]!, s.projects[0]!);
      expect(list.documents.length).toBe(7);
      expect(list.documents.find((d) => d.title.startsWith("D.1.3"))?.revisionCount).toBe(2);
    } finally {
      await fresh.client.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
