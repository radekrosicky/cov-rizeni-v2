// V2-4: termín potřeby a doporučené objednání – služby nad DOČASNOU databází (jen fiktivní data).
import { eq } from "drizzle-orm";
import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../db/client.ts";
import { events, materialNeeds } from "../db/schema.ts";
import { createTestDb } from "../db/testDb.ts";
import { DomainError } from "../errors.ts";
import { seedDevData } from "../seed/devSeed.ts";
import { seedDevMaterial } from "../seed/devSeedMaterial.ts";
import type { SessionActor } from "./common.ts";
import { cancelEvent, createEvent, updateEvent } from "./events.ts";
import { listProjectHistory } from "./history.ts";
import { archiveNeed, createManualNeed, getNeed, listNeeds, listNeedsForEvent, updateNeedSchedule } from "./material.ts";
import { archiveProject } from "./projects.ts";
import { listTodayMaterial } from "./today.ts";
import type { ScheduleFormInput } from "../../domain/material/scheduleForm.ts";

let db: Db;
let client: PGlite;
let admin: SessionActor, deputy: SessionActor, viewer1: SessionActor, viewer2: SessionActor;
let p1: string, p2: string, p3: string;
let line1: typeof events.$inferSelect;

async function expectError(p: Promise<unknown>, code: DomainError["code"], message?: RegExp) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err, String(err)).toBeInstanceOf(DomainError);
  expect((err as DomainError).code).toBe(code);
  if (message) expect((err as DomainError).message + " " + JSON.stringify((err as DomainError).fieldErrors)).toMatch(message);
}

const form = (over: Partial<ScheduleFormInput> = {}): ScheduleFormInput => ({
  needEventId: line1.id,
  needOffsetDays: "-7",
  needDateOverride: null,
  needDateOverrideReason: null,
  leadTimeState: "confirmed",
  leadTimeDays: "42",
  leadTimeUnit: "calendar",
  reserveDays: "14",
  ...over,
});
const newNeed = (pid = p1, name = "Dmychadla – test (fiktivní)") =>
  createManualNeed(db, deputy, pid, { name, trackingReason: "critical_technology", trackingReasonNote: null, plannedQuantity: null, unit: null, responsibleUserId: deputy.id, note: null });
const version = async (id: string) => (await db.select().from(materialNeeds).where(eq(materialNeeds.id, id)))[0]!.version;

beforeEach(async () => {
  ({ db, client } = await createTestDb());
  const seeded = await seedDevData(db);
  [admin, deputy, viewer1, viewer2] = seeded.users as [SessionActor, SessionActor, SessionActor, SessionActor];
  [p1, p2, p3] = seeded.projects as [string, string, string];
  line1 = (await db.select().from(events).where(eq(events.title, "Zahájení montáže technologie – linka 1")))[0]!;
});
afterEach(async () => {
  await client.close();
});

describe("updateNeedSchedule", () => {
  it("uloží událost, posun, lhůtu a rezervu; detail ukáže vypočtené termíny; historie s čitelnými hodnotami", async () => {
    const id = await newNeed();
    await updateNeedSchedule(db, deputy, p1, id, 1, form());
    const d = await getNeed(db, deputy, p1, id);
    expect([d.schedule.needDate, d.schedule.deliverBy, d.schedule.orderBy]).toEqual(["2027-02-22", "2027-02-08", "2026-12-28"]);
    expect(d.leadTime).toBe("42 kalendářních dní – potvrzeno dodavatelem");
    expect(d.event?.id).toBe(line1.id);
    const h = (await listProjectHistory(db, deputy, p1)).find((r) => r.entityId === id && r.action === "update")!;
    expect(h.changes).toMatchObject({
      needEvent: { before: "neurčeno", after: "Zahájení montáže technologie – linka 1" },
      needOffsetDays: { before: 0, after: -7 },
      leadTime: { before: "neznámá", after: "42 kalendářních dní – potvrzeno dodavatelem" },
    });
  });

  it("dodací lhůta 0 dní se uloží jako 0, neznámá jako prázdná", async () => {
    const id = await newNeed();
    await updateNeedSchedule(db, deputy, p1, id, 1, form({ leadTimeDays: "0" }));
    let [row] = await db.select().from(materialNeeds).where(eq(materialNeeds.id, id));
    expect([row!.leadTimeDays, row!.leadTimeUnit, row!.leadTimeStatus]).toEqual([0, "calendar", "confirmed"]);
    await updateNeedSchedule(db, deputy, p1, id, 2, form({ leadTimeState: "unknown", leadTimeDays: null }));
    [row] = await db.select().from(materialNeeds).where(eq(materialNeeds.id, id));
    expect([row!.leadTimeDays, row!.leadTimeUnit, row!.leadTimeStatus]).toEqual([null, null, null]);
  });

  it("posun montáže v události přepočte doporučení bez zápisu do dodávky", async () => {
    const id = await newNeed();
    await updateNeedSchedule(db, deputy, p1, id, 1, form());
    const before = await version(id);
    await updateEvent(db, deputy, p1, line1.id, line1.version, { kind: "assembly_start", title: line1.title, isMilestone: true, contractDate: "2027-03-31", plannedDate: "2027-03-15", actualDate: null, note: null }, null);
    const d = await getNeed(db, deputy, p1, id);
    expect(d.schedule.orderBy).toBe("2027-01-11");
    expect(await version(id)).toBe(before);
    expect((await listNeedsForEvent(db, deputy, p1, line1.id)).map((n) => n.schedule.orderBy)).toEqual(["2027-01-11"]);
  });

  it("sledující nesmí měnit; cizí zakázka = nenalezeno", async () => {
    const id = await newNeed();
    await expectError(updateNeedSchedule(db, viewer1, p1, id, 1, form()), "forbidden");
    await expectError(updateNeedSchedule(db, viewer2, p1, id, 1, form()), "not_found");
    expect((await getNeed(db, viewer1, p1, id)).manage).toBe(false); // vidí, ale jen čte
  });

  it("událost jiné zakázky ani zrušenou událost nelze vybrat", async () => {
    const id = await newNeed();
    const foreign = await createEvent(db, admin, p2, { kind: "assembly_start", title: "Montáž Testovice (fiktivní)", isMilestone: false, contractDate: null, plannedDate: "2027-06-01", actualDate: null, note: null });
    await expectError(updateNeedSchedule(db, deputy, p1, id, 1, form({ needEventId: foreign.id })), "validation", /nebyla v této zakázce nalezena/);
    const extra = await createEvent(db, deputy, p1, { kind: "assembly_start", title: "Montáž linka 3 (fiktivní)", isMilestone: false, contractDate: null, plannedDate: "2027-07-01", actualDate: null, note: null });
    await cancelEvent(db, deputy, p1, extra.id, extra.version, "Linka zrušena (fiktivní)");
    await expectError(updateNeedSchedule(db, deputy, p1, id, 1, form({ needEventId: extra.id })), "validation", /Zrušenou událost/);
  });

  it("chybný formulář nic neuloží; souběžná úprava se odmítne", async () => {
    const id = await newNeed();
    await expectError(updateNeedSchedule(db, deputy, p1, id, 1, form({ leadTimeDays: "" })), "validation", /0 = skladem/);
    expect(await version(id)).toBe(1);
    await updateNeedSchedule(db, deputy, p1, id, 1, form());
    await expectError(updateNeedSchedule(db, deputy, p1, id, 1, form({ reserveDays: "21" })), "conflict");
  });

  it("archivovanou dodávku nelze upravit a nepočítá se", async () => {
    const id = await newNeed();
    await archiveNeed(db, deputy, p1, id, 1, "Zrušeno (fiktivní)");
    await expectError(updateNeedSchedule(db, deputy, p1, id, 2, form()), "validation", /Archivovanou/);
    expect((await listNeeds(db, deputy, p1)).needs.find((n) => n.id === id)!.schedule.state).toBe("archived");
  });

  it("návrh montážní události se nabídne, ale sám se nepřiřadí", async () => {
    const id = await newNeed();
    const d = await getNeed(db, deputy, p1, id);
    expect(d.suggestedEvent?.title).toBe("Zahájení montáže technologie – linka 1");
    expect(d.need.needEventId).toBeNull();
    expect(d.schedule.state).toBe("no_need_date");
  });
});

describe("listTodayMaterial – „Co dnes řešit“ napříč přidělenými zakázkami", () => {
  beforeEach(async () => {
    await seedDevMaterial(db, { users: [admin, deputy, viewer1, viewer2], projects: [p1, p2, p3] });
  });

  const names = (d: Awaited<ReturnType<typeof listTodayMaterial>>) => {
    const out: Record<string, string[]> = { verify_order: [], order_soon: [], missing_date: [], lead_time: [] };
    for (const i of d.items) out[i.group]!.push(i.needName);
    for (const k of Object.keys(out)) out[k]!.sort();
    return out;
  };

  it("fiktivní data k 18. 11. 2026: skupiny podle vypočtených termínů", async () => {
    const d = await listTodayMaterial(db, deputy, "2026-11-18");
    expect(names(d)).toEqual({
      verify_order: ["Česle strojně stírané (fiktivní)"],
      order_soon: ["Náhradní díly kalových čerpadel (fiktivní)"],
      missing_date: ["Dmychadla – strojovna (fiktivní)", "Membránové difuzory (fiktivní)"],
      lead_time: ["Rozvaděč RM1 (fiktivní)"],
    });
    const soon = d.items.find((i) => i.group === "order_soon")!;
    expect(soon.schedule.orderBy).toBe("2026-12-02");
    expect(soon.projectName).toMatch(/Fiktivín/);
    // Karty: konkrétní akce + krátký časový údaj, seřazeno podle naléhavosti, každá dodávka jednou.
    expect(d.items.map((i) => `${i.action}: ${i.needName} · ${i.when}`)).toEqual([
      "Ověřit objednání: Česle strojně stírané (fiktivní) · Po termínu o 61 dní",
      "Objednat: Náhradní díly kalových čerpadel (fiktivní) · Nejpozději za 14 dní",
      "Doplnit termín montáže: Dmychadla – strojovna (fiktivní) · Termín neznámý",
      "Doplnit termín montáže: Membránové difuzory (fiktivní) · Termín neznámý",
      "Ověřit dodací lhůtu: Rozvaděč RM1 (fiktivní) · Termín neznámý",
    ]);
    expect(new Set(d.items.map((i) => i.needId)).size).toBe(d.items.length);
    // Denní odpočet se mění s datem.
    const next = await listTodayMaterial(db, deputy, "2026-11-19");
    expect(next.items.find((i) => i.group === "order_soon")!.when).toBe("Nejpozději za 13 dní");
    // Dmychadla (objednat do 28. 12.) a spojovací materiál (skladem) dnes řešit nemusíme.
  });

  it("s posunem času se dodávka přesune do „Objednat do 14 dní“ a pak do „Ověřte stav objednávky“", async () => {
    expect(names(await listTodayMaterial(db, deputy, "2026-12-14")).order_soon).toContain("Dmychadla D1–D2 (fiktivní)");
    expect(names(await listTodayMaterial(db, deputy, "2026-12-29")).verify_order).toContain("Dmychadla D1–D2 (fiktivní)");
  });

  it("oprávnění: sledující 1 jen Fiktivín, sledující 2 jen Testovice, správce vše", async () => {
    const all = (d: Awaited<ReturnType<typeof listTodayMaterial>>) => new Set(d.items.map((i) => i.projectName));
    expect([...all(await listTodayMaterial(db, viewer1, "2026-11-18"))]).toEqual(["ČOV Fiktivín – intenzifikace"]);
    expect([...all(await listTodayMaterial(db, viewer2, "2026-11-18"))]).toEqual(["ČOV Testovice – nová ČOV"]);
    expect(all(await listTodayMaterial(db, admin, "2026-11-18")).size).toBe(2);
  });

  it("archivovaná zakázka ani dodávka se nezobrazí; nic se neukládá", async () => {
    const [needRow] = await db.select().from(materialNeeds).where(eq(materialNeeds.name, "Rozvaděč RM1 (fiktivní)"));
    await archiveNeed(db, deputy, p1, needRow!.id, needRow!.version, "Nahrazeno (fiktivní)");
    expect(names(await listTodayMaterial(db, deputy, "2026-11-18")).lead_time).toEqual([]);
    const before = await db.select().from(materialNeeds);
    const p2row = (await db.execute<{ version: number }>(`select version from projects where id = '${p2}'`)).rows[0]!;
    await archiveProject(db, admin, p2, p2row.version, "Ukončeno (fiktivní)");
    expect(names(await listTodayMaterial(db, admin, "2026-11-18")).missing_date).toEqual(["Membránové difuzory (fiktivní)"]);
    expect((await db.select().from(materialNeeds)).length).toBe(before.length);
  });

  it("žádný text v přehledu netvrdí „neobjednáno“", async () => {
    for (const today of ["2026-11-18", "2027-01-15", "2027-06-01"]) {
      const d = await listTodayMaterial(db, admin, today);
      const texts = d.items.flatMap((i) => [i.action, i.when, i.schedule.headline, ...i.schedule.warnings.map((w) => w.text)]);
      expect(texts.join(" ")).not.toMatch(/neobjedn/i);
    }
  });
});
