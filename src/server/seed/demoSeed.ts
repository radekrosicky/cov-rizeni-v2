// DEMO pro předvedení vedení: jedna hlavní FIKTIVNÍ zakázka (ČOV Javorová) + jedna menší (ČOV Lipová).
// Vše smyšlené (R9). Termíny se odvozují od DNEŠNÍHO dne (Europe/Prague), aby ukázka dávala smysl v kterýkoli den:
//   - česle: doporučený termín objednání uplynul před ~3 dny  → „Ověřit objednání“,
//   - dmychadla: doporučené objednání za ~9 dní              → „Objednat“,
//   - rozvaděč: dodací lhůta neznámá, bez odpovědného         → „Ověřit dodací lhůtu“,
//   - čerpadla, difuzory: v pořádku (na přehledu nejsou).
// Vše se zakládá přes běžné služby aplikace (oprávnění, historie, import Excelu v samostatném procesu).
import { and, eq } from "drizzle-orm";
import { addDays, diffDays, isWorkingDay, pragueToday, weekday, type IsoDate } from "../../domain/calendar/calendar.ts";
import { previousWorkingDay } from "../../domain/material/schedule.ts";
import type { Db } from "../db/client.ts";
import { budgetImports, budgetItems } from "../db/schema.ts";
import { confirmImport } from "../services/budget.ts";
import type { SessionActor } from "../services/common.ts";
import { uploadDocumentRevision } from "../services/documents.ts";
import { createEvent } from "../services/events.ts";
import { createManualNeed, createNeedsFromItems, updateNeedSchedule } from "../services/material.ts";
import { addMember } from "../services/members.ts";
import { createProject, updateProject } from "../services/projects.ts";
import type { FileStorage } from "../storage/fileStorage.ts";
import { seedDevUsers } from "./devSeed.ts";
import { buildXlsx, type FictiveSheet } from "./fictiveBudget.ts";
import { fictivePdf, fictivePng } from "./fictiveFiles.ts";

export const DEMO_PROJECT_NAME = "ČOV Javorová – intenzifikace technologie";
export const DEMO_SECOND_PROJECT_NAME = "ČOV Lipová – nová ČOV";

/** Pracovní den co nejblíže `today + preferred` (zkouší ±1, ±2 dny), aby odpočet na přehledu odpovídal záměru. */
function nearWorkingDay(today: IsoDate, preferred: number): IsoDate {
  for (const delta of [0, -1, 1, -2, 2]) {
    const d = addDays(today, preferred + delta);
    if (isWorkingDay(d)) return d;
  }
  return previousWorkingDay(addDays(today, preferred));
}

/** První pondělí v den `d` nebo po něm (montáže začínají v pondělí). */
const mondayFrom = (d: IsoDate) => addDays(d, (8 - weekday(d)) % 7);
const fmt = (d: IsoDate) => d.split("-").reverse().map(Number).join(". ");

/** Fiktivní položkový rozpočet ČOV Javorová (2 stavební objekty, díly, mezisoučty). */
export function demoBudgetSheets(budgetDate: IsoDate): FictiveSheet[] {
  return [
    {
      name: "SO 01 Technologie",
      rows: [
        ["FIKTIVNÍ POLOŽKOVÝ ROZPOČET – ČOV Javorová (smyšlená stavba)"],
        ["Stavba: ČOV Javorová – intenzifikace technologie"],
        ["Datum rozpočtu:", { date: budgetDate }],
        ["Č.", "Kód položky", "Popis položky", "MJ", "Množství", "Jedn. cena", "Cena celkem"],
        [null, null, "Díl 1 – Mechanické předčištění"],
        [1, "TECH-101", "Česle strojně stírané, průlina 6 mm", "ks", 1, 685000, { formula: "E6*F6", result: 685000 }],
        [2, "TECH-102", "Lis shrabků s pračkou", "ks", 1, 310000, { formula: "E7*F7", result: 310000 }],
        [null, null, "Díl 2 – Biologická linka"],
        [3, "TECH-201", "Dmychadlo rotační 30 kW s frekvenčním měničem", "ks", 2, 412000, { formula: "E9*F9", result: 824000 }],
        [4, "TECH-202", "Membránové difuzory talířové D 270", "ks", 320, 1450, { formula: "E10*F10", result: 464000 }],
        [5, "TECH-203", "Kalové čerpadlo ponorné 4 kW", "ks", 3, 96000, { formula: "E11*F11", result: 288000 }],
        [6, "TECH-204", "Potrubí nerez DN 150", "m", 85, 3200, { formula: "E12*F12", result: 272000 }],
        [7, "TECH-205", "Montáž technologie", "kpl", 1, 380000, { formula: "E13*F13", result: 380000 }],
        [null, null, "Mezisoučet SO 01", null, null, null, { formula: "SUM(G6:G13)", result: 3223000 }],
      ],
      merges: ["A1:G1"],
    },
    {
      name: "SO 02 Elektro a MaR",
      rows: [
        ["FIKTIVNÍ POLOŽKOVÝ ROZPOČET – elektročást (smyšlený dodavatel)"],
        ["Stavba: ČOV Javorová – intenzifikace technologie"],
        ["Datum rozpočtu:", { date: budgetDate }],
        ["Č.", "Kód položky", "Popis položky", "MJ", "Množství", "Jedn. cena", "Cena celkem"],
        [1, "ELE-01", "Rozvaděč RM1 – technologie ČOV", "ks", 1, 540000, { formula: "E5*F5", result: 540000 }],
        [2, "ELE-02", "Řídicí systém MaR s vizualizací", "kpl", 1, 420000, { formula: "E6*F6", result: 420000 }],
        [3, "ELE-03", "Kabel CYKY 5x6", "m", 650, 180, { formula: "E7*F7", result: 117000 }],
        [null, null, "Mezisoučet SO 02", null, null, null, { formula: "SUM(G5:G7)", result: 1077000 }],
      ],
      merges: ["A1:G1"],
    },
  ];
}

const MAPPING = (sheetName: string) => ({
  sheetName,
  headerRow: 4,
  firstDataRow: 5,
  columns: { code: "B", description: "C", unit: "D", quantity: "E", unitPrice: "F", totalPrice: "G" },
});

/** Založí DEMO data do PRÁZDNÉ databáze. `today` jen pro testy; jinak dnešek v Praze. */
export async function seedDemoData(db: Db, storage: FileStorage, today: IsoDate = pragueToday()) {
  const [sa, deputy, viewer1, viewer2] = await seedDevUsers(db);

  // ---------- Hlavní zakázka: ČOV Javorová ----------
  const p = await createProject(db, deputy, {
    name: DEMO_PROJECT_NAME,
    projectType: "intensification",
    projectTypeNote: null,
    leaderUserId: deputy.id,
    clientName: "Město Javorová (smyšlený objednatel)",
  });
  await updateProject(db, deputy, p.id, p.version, { name: p.name, projectType: p.projectType, projectTypeNote: null, leaderUserId: deputy.id, clientName: p.clientName, status: "realization" });
  await addMember(db, sa, p.id, viewer1.id, "read");

  const ev = (kind: string, title: string, d: { contractDate?: IsoDate; plannedDate?: IsoDate; actualDate?: IsoDate }, isMilestone = false) =>
    createEvent(db, deputy, p.id, { kind, title, isMilestone, contractDate: d.contractDate ?? null, plannedDate: d.plannedDate ?? null, actualDate: d.actualDate ?? null, note: null });
  const mech = mondayFrom(addDays(today, 80));
  const bio = mondayFrom(addDays(mech, 14));
  const elektro = mondayFrom(addDays(bio, 14));
  await ev("site_handover", "Předání staveniště", { contractDate: addDays(today, -70), actualDate: addDays(today, -66) }, true);
  await ev("construction_start", "Zahájení stavebních prací", { plannedDate: addDays(today, -60), actualDate: addDays(today, -58) });
  const eMech = await ev("assembly_start", "Zahájení montáže technologie – mechanické předčištění", { plannedDate: mech, contractDate: addDays(mech, 7) }, true);
  const eBio = await ev("assembly_start", "Zahájení montáže technologie – biologická linka", { plannedDate: bio, contractDate: addDays(bio, 14) }, true);
  const eEle = await ev("assembly_start", "Zahájení montáže elektročásti a MaR", { plannedDate: elektro });
  await ev("trial_operation", "Komplexní zkoušky a zkušební provoz", { contractDate: mondayFrom(addDays(elektro, 49)) }, true);
  await ev("completion_handover", "Předání díla", { contractDate: mondayFrom(addDays(elektro, 120)) }, true);

  // Dokumenty (fiktivní soubory)
  const up = (meta: { category: string; title: string; documentDate: IsoDate | null; filename: string; revisionLabel?: string }, data: Uint8Array) =>
    uploadDocumentRevision(db, storage, deputy, p.id, { documentId: null, expectedVersion: null, note: null, revisionLabel: meta.revisionLabel ?? null, category: meta.category, title: meta.title, documentDate: meta.documentDate, filename: meta.filename }, [data]);
  await up(
    { category: "contract", title: "Smlouva o dílo – ČOV Javorová (FIKTIVNÍ)", documentDate: addDays(today, -95), filename: "smlouva-o-dilo-javorova-fiktivni.pdf" },
    fictivePdf([
      "Smlouva o dilo c. JAV-FIKT-01 (smyslena)",
      "Objednatel: Mesto Javorova (smysleny)",
      "Predmet: intenzifikace technologie COV Javorova",
      `Zahajeni montaze mech. predcisteni nejpozdeji ${fmt(addDays(mech, 7))}`,
      `Zahajeni montaze biologicke linky nejpozdeji ${fmt(addDays(bio, 14))}`,
      "Vsechny udaje jsou fiktivni - pouze pro predvedeni.",
    ]),
  );
  await up(
    { category: "design", title: "D.1.3 Technologie – dispozice ČOV (FIKTIVNÍ)", documentDate: addDays(today, -120), filename: "D13-technologie-javorova.pdf", revisionLabel: "A" },
    fictivePdf(["Projektova dokumentace D.1.3 Technologie (fiktivni)", "Cesle, lis shrabku, dmychadla D1-D2, difuzory, kalova cerpadla", "Revize A"]),
  );
  await up(
    { category: "other", title: "Harmonogram realizace (FIKTIVNÍ)", documentDate: addDays(today, -90), filename: "harmonogram-javorova-fiktivni.pdf" },
    fictivePdf(["Harmonogram realizace COV Javorova (fiktivni)", `Montaz mech. predcisteni: ${fmt(mech)}`, `Montaz biologicke linky: ${fmt(bio)}`, `Montaz elektro a MaR: ${fmt(elektro)}`]),
  );
  const budget = await up(
    { category: "budget", title: "Položkový rozpočet – ČOV Javorová (FIKTIVNÍ)", documentDate: addDays(today, -100), filename: "rozpocet-javorova-fiktivni.xlsx" },
    buildXlsx(demoBudgetSheets(addDays(today, -100))),
  );
  await up({ category: "photo", title: "Staveniště – stav prací (FIKTIVNÍ FOTO)", documentDate: addDays(today, -7), filename: "foto-staveniste-javorova.png" }, fictivePng());

  // Import rozpočtu (stejná cesta jako v aplikaci: čtení Excelu v samostatném procesu s limity)
  await confirmImport(db, storage, deputy, p.id, budget.revisionId, {
    mappings: [MAPPING("SO 01 Technologie"), MAPPING("SO 02 Elektro a MaR")],
    currency: "CZK",
    vatBasis: "without_vat",
    reviewAcknowledged: true,
    sameFileAcknowledged: false,
  });
  const [imp] = await db.select().from(budgetImports).where(eq(budgetImports.projectId, p.id));
  const item = async (code: string) => {
    const [it] = await db.select().from(budgetItems).where(and(eq(budgetItems.importId, imp!.id), eq(budgetItems.code, code)));
    if (!it) throw new Error(`DEMO: položka ${code} nenalezena`);
    return it;
  };

  // Sledované dodávky z rozpočtu + termíny
  type Lead = [number, "calendar" | "working", "estimate" | "confirmed"] | null;
  const fromBudget = async (
    code: string,
    name: string,
    o: { reason: "critical_technology" | "long_lead_time" | "may_block_assembly"; responsible: SessionActor | null; eventId: string; eventDate: IsoDate; offset: number; lead: Lead | { orderBy: IsoDate } },
  ) => {
    const it = await item(code);
    const qty = it.quantity === null ? null : String(Number(it.quantity));
    const [id] = await createNeedsFromItems(db, deputy, p.id, {
      mode: "one",
      fields: { name, trackingReason: o.reason, trackingReasonNote: null, plannedQuantity: qty, unit: it.unit, responsibleUserId: o.responsible?.id ?? null, note: null },
      sources: [{ budgetItemId: it.id, quantityTaken: qty, overAllocationReason: null }],
      acknowledgeTracked: false,
    });
    // Dodací lhůta tak, aby doporučené objednání vyšlo na zvolený (pracovní) den vůči dnešku.
    let lead: Lead;
    if (o.lead && "orderBy" in o.lead) {
      const deliverBy = addDays(addDays(o.eventDate, o.offset), -14);
      lead = [diffDays(o.lead.orderBy, deliverBy), "calendar", "confirmed"];
    } else lead = o.lead;
    await updateNeedSchedule(db, deputy, p.id, id!, 1, {
      needEventId: o.eventId,
      needOffsetDays: String(o.offset),
      needDateOverride: null,
      needDateOverrideReason: null,
      leadTimeState: lead ? lead[2] : "unknown",
      leadTimeDays: lead ? String(lead[0]) : null,
      leadTimeUnit: lead ? lead[1] : null,
      reserveDays: "14",
    });
    return id!;
  };
  await fromBudget("TECH-101", "Česle strojně stírané", { reason: "long_lead_time", responsible: deputy, eventId: eMech.id, eventDate: mech, offset: -7, lead: { orderBy: nearWorkingDay(today, -3) } });
  await fromBudget("TECH-201", "Dmychadla D1–D2", { reason: "critical_technology", responsible: deputy, eventId: eBio.id, eventDate: bio, offset: -7, lead: { orderBy: nearWorkingDay(today, 9) } });
  await fromBudget("ELE-01", "Rozvaděč RM1", { reason: "may_block_assembly", responsible: null, eventId: eEle.id, eventDate: elektro, offset: -14, lead: null });
  await fromBudget("TECH-203", "Kalová čerpadla", { reason: "critical_technology", responsible: deputy, eventId: eBio.id, eventDate: bio, offset: -14, lead: [25, "working", "confirmed"] });
  await fromBudget("TECH-202", "Membránové difuzory", { reason: "may_block_assembly", responsible: deputy, eventId: eBio.id, eventDate: bio, offset: -7, lead: [28, "calendar", "confirmed"] });

  // ---------- Druhá zakázka (napříč zakázkami): ČOV Lipová ----------
  const p2 = await createProject(db, sa, { name: DEMO_SECOND_PROJECT_NAME, projectType: "new_plant", projectTypeNote: null, leaderUserId: sa.id, clientName: "Obec Lipová (smyšlený objednatel)" });
  await addMember(db, sa, p2.id, deputy.id, "edit");
  await addMember(db, sa, p2.id, viewer2.id, "read");
  await createEvent(db, sa, p2.id, { kind: "site_handover", title: "Předání staveniště", isMilestone: true, contractDate: addDays(today, 40), plannedDate: null, actualDate: null, note: null });
  await createEvent(db, sa, p2.id, { kind: "assembly_start", title: "Zahájení montáže technologie", isMilestone: true, contractDate: null, plannedDate: null, actualDate: null, note: null });
  await createManualNeed(db, deputy, p2.id, {
    name: "Dávkovací stanice srážedla",
    trackingReason: "long_lead_time",
    trackingReasonNote: null,
    plannedQuantity: "1",
    unit: "ks",
    responsibleUserId: deputy.id,
    note: null,
  });

  return { users: [sa, deputy, viewer1, viewer2], projects: [p.id, p2.id], dates: { mech, bio, elektro } };
}
