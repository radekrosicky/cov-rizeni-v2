// Fiktivní data pro vývoj (R9: pouze smyšlené údaje). Zakládá se přes služby, aby vznikla i historie.
import type { Db } from "../db/client.ts";
import { users } from "../db/schema.ts";
import type { SessionActor } from "../services/common.ts";
import { createEvent, updateEvent } from "../services/events.ts";
import { addMember } from "../services/members.ts";
import { createProject, updateProject } from "../services/projects.ts";
import { writeHistory } from "../services/common.ts";
import { uploadDocumentRevision } from "../services/documents.ts";
import type { FileStorage } from "../storage/fileStorage.ts";
import { fictiveDocx, fictiveDxf, fictivePdf, fictivePng, fictiveXlsx } from "./fictiveFiles.ts";

export const DEV_USERS = [
  { email: "spravce@example.test", displayName: "Správce (fiktivní)", globalRole: "admin" },
  { email: "zastupce@example.test", displayName: "Zástupce (fiktivní)", globalRole: "deputy" },
  { email: "sledujici1@example.test", displayName: "Sledující 1 (fiktivní)", globalRole: "viewer" },
  { email: "sledujici2@example.test", displayName: "Sledující 2 (fiktivní)", globalRole: "viewer" },
] as const;

const asActor = (u: typeof users.$inferSelect): SessionActor => ({
  id: u.id,
  globalRole: u.globalRole,
  status: u.status,
  displayName: u.displayName,
  email: u.email,
  isDevIdentity: u.isDevIdentity,
});

const ev = (kind: string, title: string, dates: { contractDate?: string; plannedDate?: string; actualDate?: string } = {}, isMilestone = false) => ({
  kind,
  title,
  isMilestone,
  contractDate: dates.contractDate ?? null,
  plannedDate: dates.plannedDate ?? null,
  actualDate: dates.actualDate ?? null,
  note: null,
});

/** Fiktivní data. S úložištěm `storage` vzniknou i fiktivní dokumenty (jinak jen zakázky a události). */
export async function seedDevData(db: Db, storage?: FileStorage) {
  const [admin] = await db.insert(users).values({ ...DEV_USERS[0], isDevIdentity: true }).returning();
  const others = await db
    .insert(users)
    .values(DEV_USERS.slice(1).map((u) => ({ ...u, isDevIdentity: true, createdBy: admin!.id, updatedBy: admin!.id })))
    .returning();
  for (const u of [admin!, ...others]) {
    await writeHistory(db, { actorId: admin!.id, projectId: null, entityType: "user", entityId: u.id, action: "create", changes: { globalRole: { before: null, after: u.globalRole } }, reason: "Fiktivní vývojová data" });
  }
  const [deputy, viewer1, viewer2] = others.map(asActor) as [SessionActor, SessionActor, SessionActor];
  const sa = asActor(admin!);

  // 1) Zakázka v realizaci; vedoucí zástupce; sledující 1 jen čte. Dvě montáže stejného typu (linka 1 a 2).
  const p1 = await createProject(db, deputy, { name: "ČOV Fiktivín – intenzifikace", projectType: "intensification", projectTypeNote: null, leaderUserId: deputy.id, clientName: "Obec Fiktivín (smyšlený objednatel)" });
  await updateProject(db, deputy, p1.id, p1.version, { name: p1.name, projectType: p1.projectType, projectTypeNote: null, leaderUserId: deputy.id, clientName: p1.clientName, status: "realization" });
  await addMember(db, sa, p1.id, viewer1.id, "read");
  await createEvent(db, deputy, p1.id, ev("site_handover", "Předání staveniště", { contractDate: "2026-10-01", actualDate: "2026-10-05" }, true));
  const start = await createEvent(db, deputy, p1.id, ev("construction_start", "Zahájení stavebních prací", { plannedDate: "2026-10-12" }));
  await updateEvent(db, deputy, p1.id, start.id, start.version, { ...ev("construction_start", "Zahájení stavebních prací", { plannedDate: "2026-10-12", actualDate: "2026-10-14" }) }, null);
  await createEvent(db, deputy, p1.id, ev("assembly_start", "Zahájení montáže technologie – linka 1", { contractDate: "2027-03-31", plannedDate: "2027-03-01" }, true));
  await createEvent(db, deputy, p1.id, ev("assembly_start", "Zahájení montáže technologie – linka 2", { plannedDate: "2027-05-10" }));
  await createEvent(db, deputy, p1.id, ev("trial_operation", "Zkušební provoz / komplexní zkoušky"));

  // 2) Nová ČOV v přípravě; vedoucí správce; zástupce upravuje, sledující 2 čte.
  const p2 = await createProject(db, sa, { name: "ČOV Testovice – nová ČOV", projectType: "new_plant", projectTypeNote: null, leaderUserId: sa.id, clientName: "Svazek obcí Testovicko (smyšlený)" });
  await addMember(db, sa, p2.id, deputy.id, "edit");
  await addMember(db, sa, p2.id, viewer2.id, "read");
  await createEvent(db, sa, p2.id, ev("site_handover", "Předání staveniště", { contractDate: "2027-02-15" }, true));

  // 3) Rekonstrukce bez sledujících – sledující ji nesmí vidět.
  const p3 = await createProject(db, deputy, { name: "ČOV Vzorová – rekonstrukce", projectType: "reconstruction", projectTypeNote: null, leaderUserId: deputy.id, clientName: null });
  await createEvent(db, deputy, p3.id, ev("other", "Kontrolní den s objednatelem", { plannedDate: "2026-11-25" }));

  if (storage) await seedDocuments(db, storage, deputy, p1.id);

  return { users: [sa, deputy, viewer1, viewer2], projects: [p1.id, p2.id, p3.id] };
}

async function seedDocuments(db: Db, storage: FileStorage, actor: SessionActor, projectId: string) {
  const up = (meta: Partial<Parameters<typeof uploadDocumentRevision>[4]> & { filename: string }, data: Uint8Array) =>
    uploadDocumentRevision(db, storage, actor, projectId, { documentId: null, expectedVersion: null, category: null, title: null, documentDate: null, revisionLabel: null, note: null, ...meta }, [data]);
  await up({ category: "contract", title: "Smlouva o dílo (FIKTIVNÍ)", documentDate: "2026-09-15", filename: "smlouva-o-dilo-fiktivni.pdf" }, fictivePdf(["Smlouva o dilo c. FIKT-2026-001", "Objednatel: Obec Fiktivin (smysleny)"]));
  await up({ category: "contract", title: "Dodatek č. 1 ke smlouvě (FIKTIVNÍ)", documentDate: "2026-10-20", filename: "dodatek-1-fiktivni.pdf" }, fictivePdf(["Dodatek c. 1 - zmena terminu montaze (fiktivni)"]));
  const drawing = await up({ category: "design", title: "D.1.3 Technologie – dispozice (FIKTIVNÍ)", revisionLabel: "A", documentDate: "2026-08-01", filename: "D13-dispozice-revA.pdf" }, fictivePdf(["Vykres D.1.3 - revize A (fiktivni)"]));
  await uploadDocumentRevision(db, storage, actor, projectId, { documentId: drawing.documentId, expectedVersion: null, category: null, title: null, documentDate: "2026-10-02", revisionLabel: "B", note: "Posun dmychadla o 1,2 m (fiktivní změna)", filename: "D13-dispozice-revB.pdf" }, [fictivePdf(["Vykres D.1.3 - revize B (fiktivni)"])]);
  await up({ category: "budget", title: "Položkový rozpočet (FIKTIVNÍ)", documentDate: "2026-09-10", filename: "rozpocet-fiktivni.xlsx" }, fictiveXlsx());
  await up({ category: "site_meeting", title: "Zápis z KD č. 1 (FIKTIVNÍ)", documentDate: "2026-10-21", filename: "zapis-kd-1-fiktivni.docx" }, fictiveDocx());
  await up({ category: "photo", title: "Staveniště – výkop (FIKTIVNÍ FOTO)", documentDate: "2026-10-14", filename: "foto-staveniste.png" }, fictivePng());
  await up({ category: "design", title: "Situace (FIKTIVNÍ DXF)", filename: "situace-fiktivni.dxf" }, fictiveDxf());
}
