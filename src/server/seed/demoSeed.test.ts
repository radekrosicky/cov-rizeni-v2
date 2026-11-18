// DEMO pro vedení: data dávají smysl v KTERÝKOLI den (termíny se odvozují od dneška), vše je propojené.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";
import { addDays } from "../../domain/calendar/calendar.ts";
import type { Db } from "../db/client.ts";
import { events } from "../db/schema.ts";
import { createTestDb } from "../db/testDb.ts";
import { listDocuments } from "../services/documents.ts";
import { updateEvent } from "../services/events.ts";
import { getNeed, listNeeds } from "../services/material.ts";
import { listTodayMaterial } from "../services/today.ts";
import { LocalFileStorage } from "../storage/localFileStorage.ts";
import { seedDemoData } from "./demoSeed.ts";

const T = { timeout: 120_000 };
let db: Db;
let client: PGlite;
let dir: string;

async function seed(today: string) {
  ({ db, client } = await createTestDb());
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cov-demo-"));
  return seedDemoData(db, new LocalFileStorage(dir), today);
}
afterEach(async () => {
  await client?.close();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

describe("DEMO data", () => {
  // Běžný den, pátek, pondělí po víkendu a den po Novém roce (víkendy a svátky kolem cílových termínů).
  // (dny nesmí být v budoucnu: skutečná data proběhlých událostí aplikace do budoucna nepovolí)
  it.each(["2026-11-18", "2026-06-05", "2026-03-30", "2026-01-02"])(
    "dnes %s: „Co dnes řešit“ ukáže 4 jasné akce ve správném pořadí a s rozumnými odpočty",
    T,
    async (today) => {
      const { users } = await seed(today);
      const deputy = users[1]!;
      const d = await listTodayMaterial(db, deputy, today);
      expect(d.items.map((i) => `${i.action}: ${i.needName}`)).toEqual([
        "Ověřit objednání: Česle strojně stírané",
        "Objednat: Dmychadla D1–D2",
        "Doplnit termín montáže: Dávkovací stanice srážedla",
        "Ověřit dodací lhůtu: Rozvaděč RM1",
      ]);
      const [cesle, dmych, , rozv] = d.items;
      // Cíl: po termínu ~3 dny / objednat za ~9 dní (posun na předchozí pracovní den kvůli víkendu či svátku).
      expect(cesle!.schedule.daysToOrder!).toBeLessThanOrEqual(-1);
      expect(cesle!.schedule.daysToOrder!).toBeGreaterThanOrEqual(-5);
      expect(cesle!.when).toMatch(/^Po termínu o \d+ (den|dny|dní)$/);
      expect(dmych!.schedule.daysToOrder!).toBeGreaterThanOrEqual(7);
      expect(dmych!.schedule.daysToOrder!).toBeLessThanOrEqual(11);
      expect(dmych!.when).toMatch(/^Nejpozději za \d+ (dny|dní)$/);
      expect(rozv!.when).toBe("Termín neznámý");
      expect(rozv!.responsibleName).toBeNull(); // dodávka bez odpovědného
      expect(d.items.every((i) => i.projectName.startsWith("ČOV Javorová") || i.projectName.startsWith("ČOV Lipová"))).toBe(true);
      expect(JSON.stringify(d.items)).not.toMatch(/neobjedn/i);
    },
  );

  it("dokumenty, rozpočet a dodávky jsou propojené; posun montáže přepočte doporučení", T, async () => {
    const today = "2026-11-18";
    const { users, projects, dates } = await seed(today);
    const deputy = users[1]!;
    const docs = await listDocuments(db, deputy, projects[0]!);
    expect(docs.documents.map((x) => x.title).sort()).toEqual([
      "D.1.3 Technologie – dispozice ČOV (FIKTIVNÍ)",
      "Harmonogram realizace (FIKTIVNÍ)",
      "Položkový rozpočet – ČOV Javorová (FIKTIVNÍ)",
      "Smlouva o dílo – ČOV Javorová (FIKTIVNÍ)",
      "Staveniště – stav prací (FIKTIVNÍ FOTO)",
    ]);
    const needs = (await listNeeds(db, deputy, projects[0]!)).needs;
    expect(needs).toHaveLength(5);
    const dmych = needs.find((n) => n.name === "Dmychadla D1–D2")!;
    expect(dmych.sources.map((s) => [s.item.code, s.item.sheetName, Number(s.quantityTaken)])).toEqual([["TECH-201", "SO 01 Technologie", 2]]);
    const detail = await getNeed(db, deputy, projects[0]!, dmych.id);
    expect(detail.sources[0]!.documentTitle).toBe("Položkový rozpočet – ČOV Javorová (FIKTIVNÍ)");
    expect(detail.schedule.basis).toBe("planned");
    const before = detail.schedule.orderBy!;
    // Posun montáže biologické linky o 14 dní → doporučené objednání o 14 dní později, karta z přehledu zmizí.
    const [bio] = await db.select().from(events).where(eq(events.title, "Zahájení montáže technologie – biologická linka"));
    await updateEvent(db, deputy, projects[0]!, bio!.id, bio!.version, { kind: "assembly_start", title: bio!.title, isMilestone: true, contractDate: bio!.contractDate, plannedDate: addDays(dates.bio, 14), actualDate: null, note: null }, null);
    expect((await getNeed(db, deputy, projects[0]!, dmych.id)).schedule.orderBy).toBe(addDays(before, 14));
    expect((await listTodayMaterial(db, deputy, today)).items.map((i) => i.needName)).not.toContain("Dmychadla D1–D2");
  });

  it("oprávnění: sledující 1 vidí jen Javorovou, sledující 2 jen Lipovou", T, async () => {
    const today = "2026-11-18";
    const { users } = await seed(today);
    const names = async (i: number) => [...new Set((await listTodayMaterial(db, users[i]!, today)).items.map((x) => x.projectName))];
    expect(await names(2)).toEqual(["ČOV Javorová – intenzifikace technologie"]);
    expect(await names(3)).toEqual(["ČOV Lipová – nová ČOV"]);
  });
});
