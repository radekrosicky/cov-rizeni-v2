// Návrh migrace 0004 (termín potřeby, dodací lhůta, rezerva) – ověření na DOČASNÝCH databázích v paměti.
// 1) Přechod z databáze V2-3: existující data se nezmění, nové sloupce dostanou bezpečné výchozí hodnoty.
// 2) Pravidla, která hlídá přímo databáze.
// 3) Datum montáže zůstává jen v události: změna události nezmění řádek dodávky, jen vypočtený výsledek.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computeSchedule } from "../../domain/material/schedule.ts";
import { seedDevData } from "../seed/devSeed.ts";
import { openDb, type Db } from "./client.ts";
import { MIGRATIONS_FOLDER } from "./migrate.ts";
import { events, materialNeeds } from "./schema.ts";
import { createTestDb } from "./testDb.ts";

/** Složka jen s migracemi do zadané (včetně) – simuluje databázi před V2-4. */
function migrationsUpTo(lastTag: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cov-migrace-"));
  fs.mkdirSync(path.join(dir, "meta"));
  const journal = JSON.parse(fs.readFileSync(path.join(MIGRATIONS_FOLDER, "meta/_journal.json"), "utf8"));
  const idx = journal.entries.findIndex((e: { tag: string }) => e.tag === lastTag);
  journal.entries = journal.entries.slice(0, idx + 1);
  fs.writeFileSync(path.join(dir, "meta/_journal.json"), JSON.stringify(journal));
  for (const e of journal.entries as { tag: string }[]) fs.copyFileSync(path.join(MIGRATIONS_FOLDER, `${e.tag}.sql`), path.join(dir, `${e.tag}.sql`));
  return dir;
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

const OLD_NEED_COLUMNS =
  "id, project_id, name, tracking_reason, tracking_reason_note, planned_quantity, unit, responsible_user_id, note, status, archived_at, archived_by, archive_reason, version, created_at, created_by, updated_at, updated_by";

describe("migrace 0004 – přechod z databáze V2-3", () => {
  it("projde na databázi s daty V2-1 až V2-3, nic nezmění a doplní výchozí hodnoty", async () => {
    const { db, client } = openDb();
    try {
      await migrate(db, { migrationsFolder: migrationsUpTo("0003_v2_3_rozpocet_material") });
      const seeded = await seedDevData(db);
      const [uid, pid] = [seeded.users[0]!.id, seeded.projects[0]!];
      // Sledované dodávky ve tvaru V2-3 (přímým SQL – nové sloupce ještě neexistují).
      await db.execute(sql`insert into material_needs (project_id, name, tracking_reason, planned_quantity, unit, created_by, updated_by)
        values (${pid}, 'Dmychadla D1–D2 (fiktivní)', 'critical_technology', 2, 'ks', ${uid}, ${uid}),
               (${pid}, 'Česle (fiktivní)', 'long_lead_time', null, null, ${uid}, ${uid})`);
      const tables = ["users", "projects", "project_members", "events", "history_entries", "documents", "document_revisions", "budget_imports", "budget_items", "material_need_sources"];
      const snap = async () => {
        const out: Record<string, unknown> = {};
        for (const t of tables) out[t] = (await db.execute(sql.raw(`select md5(coalesce(string_agg(t::text, '|' order by t::text), '')) h, count(*) n from ${t} t`))).rows[0];
        out.material_needs = (await db.execute(sql.raw(`select md5(string_agg(t::text, '|' order by t::text)) h, count(*) n from (select ${OLD_NEED_COLUMNS} from material_needs) t`))).rows[0];
        return out;
      };
      const before = await snap();
      await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER }); // doplní jen 0004
      expect(await snap()).toEqual(before);
      const rows = await db.select().from(materialNeeds);
      expect(rows).toHaveLength(2);
      for (const r of rows) {
        expect([r.needEventId, r.needOffsetDays, r.needDateOverride, r.needDateOverrideReason]).toEqual([null, 0, null, null]);
        expect([r.leadTimeDays, r.leadTimeUnit, r.leadTimeStatus, r.reserveDays]).toEqual([null, null, null, 14]);
      }
    } finally {
      await client.close();
    }
  });
});

describe("migrace 0004 – pravidla v databázi", () => {
  let db: Db;
  let client: PGlite;
  let userId: string;
  let projectId: string;
  let otherProjectId: string;

  async function addEvent(pid: string, over: Partial<typeof events.$inferInsert> = {}) {
    const [e] = await db
      .insert(events)
      .values({ projectId: pid, kind: "assembly_start", title: "Zahájení montáže technologie – linka 3 (fiktivní)", plannedDate: "2027-03-01", createdBy: userId, updatedBy: userId, ...over })
      .returning();
    return e!;
  }
  async function addNeed(over: Partial<typeof materialNeeds.$inferInsert> = {}) {
    const [n] = await db
      .insert(materialNeeds)
      .values({ projectId, name: "Dmychadla D1–D2 (fiktivní)", trackingReason: "critical_technology", createdBy: userId, updatedBy: userId, ...over })
      .returning();
    return n!;
  }
  const setNeed = (id: string, change: Partial<typeof materialNeeds.$inferInsert>) => db.update(materialNeeds).set(change).where(eq(materialNeeds.id, id));

  beforeEach(async () => {
    ({ db, client } = await createTestDb());
    const seeded = await seedDevData(db);
    userId = seeded.users[0]!.id;
    [projectId, otherProjectId] = seeded.projects as [string, string];
  });
  afterEach(async () => {
    await client.close();
  });

  it("nová dodávka: bez termínu, neznámá dodací lhůta, rezerva 14 kalendářních dní", async () => {
    const n = await addNeed();
    expect([n.needEventId, n.needOffsetDays, n.leadTimeDays, n.leadTimeUnit, n.leadTimeStatus, n.reserveDays]).toEqual([null, 0, null, null, null, 14]);
  });

  it("posun vůči události: záporný i kladný, nejvýše ±365 dní", async () => {
    const ev = await addEvent(projectId);
    await addNeed({ needEventId: ev.id, needOffsetDays: -365 });
    await addNeed({ needEventId: ev.id, needOffsetDays: 365 });
    expect(await pgError(addNeed({ needEventId: ev.id, needOffsetDays: -366 }))).toMatch(/offset_range/);
    expect(await pgError(addNeed({ needEventId: ev.id, needOffsetDays: 366 }))).toMatch(/offset_range/);
  });

  it("dodací lhůta: buď celá (počet + jednotka + stav), nebo žádná (= neznámá); 1–730 dní", async () => {
    const n = await addNeed();
    await setNeed(n.id, { leadTimeDays: 42, leadTimeUnit: "calendar", leadTimeStatus: "estimate" });
    await setNeed(n.id, { leadTimeDays: 30, leadTimeUnit: "working", leadTimeStatus: "confirmed" });
    await setNeed(n.id, { leadTimeDays: null, leadTimeUnit: null, leadTimeStatus: null }); // zpět na neznámou
    for (const bad of [
      { leadTimeDays: 42 },
      { leadTimeDays: 42, leadTimeUnit: "calendar" as const },
      { leadTimeUnit: "working" as const, leadTimeStatus: "estimate" as const },
      { leadTimeStatus: "confirmed" as const },
    ]) {
      expect(await pgError(setNeed(n.id, bad))).toMatch(/lead_time_complete/);
    }
    expect(await pgError(setNeed(n.id, { leadTimeDays: 0, leadTimeUnit: "calendar", leadTimeStatus: "estimate" }))).toMatch(/lead_time_range/);
    expect(await pgError(setNeed(n.id, { leadTimeDays: 731, leadTimeUnit: "calendar", leadTimeStatus: "estimate" }))).toMatch(/lead_time_range/);
    expect(await pgError(setNeed(n.id, { leadTimeDays: 5, leadTimeUnit: "tydny" as never, leadTimeStatus: "estimate" }))).toMatch(/lead_unit_valid/);
    expect(await pgError(setNeed(n.id, { leadTimeDays: 5, leadTimeUnit: "calendar", leadTimeStatus: "unknown" as never }))).toMatch(/lead_status_valid/);
  });

  it("rezerva 0–365 kalendářních dní", async () => {
    await addNeed({ reserveDays: 0 });
    await addNeed({ reserveDays: 365 });
    expect(await pgError(addNeed({ reserveDays: -1 }))).toMatch(/reserve_range/);
    expect(await pgError(addNeed({ reserveDays: 366 }))).toMatch(/reserve_range/);
  });

  it("vlastní datum potřeby jen s důvodem, nikdy zároveň s událostí ani s posunem", async () => {
    const ev = await addEvent(projectId);
    await addNeed({ needDateOverride: "2027-06-01", needDateOverrideReason: "Dodávka mimo montáž (fiktivní)" });
    expect(await pgError(addNeed({ needDateOverride: "2027-06-01" }))).toMatch(/override_has_reason/);
    expect(await pgError(addNeed({ needDateOverride: "2027-06-01", needDateOverrideReason: "   " }))).toMatch(/override_has_reason/);
    expect(await pgError(addNeed({ needDateOverrideReason: "důvod bez data" }))).toMatch(/override_has_reason/);
    expect(await pgError(addNeed({ needEventId: ev.id, needDateOverride: "2027-06-01", needDateOverrideReason: "x" }))).toMatch(/event_or_override/);
    expect(await pgError(addNeed({ needOffsetDays: -7, needDateOverride: "2027-06-01", needDateOverrideReason: "x" }))).toMatch(/override_no_offset/);
  });

  it("událost musí patřit k téže zakázce", async () => {
    const foreign = await addEvent(otherProjectId);
    expect(await pgError(addNeed({ needEventId: foreign.id }))).toMatch(/jiné zakázce/);
    const n = await addNeed();
    expect(await pgError(setNeed(n.id, { needEventId: foreign.id }))).toMatch(/jiné zakázce/);
  });

  it("zrušenou událost nelze vybrat; dříve navázaná dodávka po zrušení události zůstane (aplikace vyzve k výběru jiné)", async () => {
    const ev = await addEvent(projectId);
    const n = await addNeed({ needEventId: ev.id, needOffsetDays: -7 });
    await db.update(events).set({ status: "cancelled", cancelledAt: new Date(), cancelledBy: userId, cancelReason: "Změna harmonogramu (fiktivní)" }).where(eq(events.id, ev.id));
    expect(await pgError(addNeed({ needEventId: ev.id }))).toMatch(/Zrušenou událost/);
    await setNeed(n.id, { note: "jiná úprava dodávky projde" });
    const [after] = await db.select().from(materialNeeds).where(eq(materialNeeds.id, n.id));
    expect(after!.needEventId).toBe(ev.id);
  });

  it("událost s navázanou dodávkou nelze smazat", async () => {
    const ev = await addEvent(projectId);
    await addNeed({ needEventId: ev.id });
    expect(await pgError(db.delete(events).where(eq(events.id, ev.id)))).toMatch(/foreign key|smazat|nelze/i);
  });

  it("posun montáže změní jen událost: řádek dodávky zůstane beze změny, doporučení se přepočte", async () => {
    const ev = await addEvent(projectId, { plannedDate: "2027-03-01", contractDate: "2027-03-31" });
    const n = await addNeed({ needEventId: ev.id, needOffsetDays: -7, leadTimeDays: 42, leadTimeUnit: "calendar", leadTimeStatus: "confirmed", responsibleUserId: userId });
    const load = async () => {
      const [row] = await db.select().from(materialNeeds).where(eq(materialNeeds.id, n.id));
      const [e] = await db.select().from(events).where(and(eq(events.id, ev.id)));
      const s = computeSchedule(
        {
          event: { name: e!.title, status: e!.status, contractDate: e!.contractDate, plannedDate: e!.plannedDate, actualDate: e!.actualDate },
          offsetDays: row!.needOffsetDays,
          dateOverride: row!.needDateOverride,
          dateOverrideReason: row!.needDateOverrideReason,
          leadTimeDays: row!.leadTimeDays,
          leadTimeUnit: row!.leadTimeUnit,
          leadTimeStatus: row!.leadTimeStatus,
          reserveDays: row!.reserveDays,
          responsibleAssigned: row!.responsibleUserId !== null,
          archived: row!.status === "archived",
        },
        "2026-11-18",
      );
      return { row, s };
    };
    const before = await load();
    expect(before.s.orderBy).toBe("2026-12-28");
    await db.update(events).set({ plannedDate: "2027-03-15", version: sql`${events.version} + 1` }).where(eq(events.id, ev.id));
    const after = await load();
    expect(after.row).toEqual(before.row); // žádná kopie data montáže, nic se nepřepsalo
    expect(after.s.orderBy).toBe("2027-01-11");
  });
});
