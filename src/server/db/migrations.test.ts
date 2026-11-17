// Ověření návrhu migrace na DOČASNÉ databázi v paměti (po testu zaniká).
// Kontroluje, že migrace projde na prázdné databázi a že databáze sama vynutí schválená pravidla.
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import type { Db } from "./client.ts";
import { events, historyEntries, projectMembers, projects, users } from "./schema.ts";
import { createTestDb } from "./testDb.ts";

let db: Db;
let client: PGlite;
let adminId: string;
let deputyId: string;
let viewerId: string;

/** Chyba z PostgreSQL včetně důvodu (Drizzle ji obaluje do `cause`). */
async function pgError(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const err = e as { message?: string; cause?: { message?: string } };
    return `${err.message ?? ""} ${err.cause?.message ?? ""}`;
  }
  throw new Error("Očekávala se chyba databáze, ale operace prošla.");
}

async function addUser(email: string, globalRole: "admin" | "deputy" | "viewer") {
  const [u] = await db
    .insert(users)
    .values({ email, displayName: `Fiktivní ${globalRole}`, globalRole, isDevIdentity: true })
    .returning();
  return u!.id;
}

/** Zakázka + členství vedoucího v jedné transakci (vedoucí musí být členem s „edit“). */
async function addProject(name = "ČOV Fiktivní Lhota", leader = deputyId) {
  return db.transaction(async (tx) => {
    const [p] = await tx
      .insert(projects)
      .values({ name, projectType: "new_plant", leaderUserId: leader, createdBy: adminId, updatedBy: adminId })
      .returning();
    await tx.insert(projectMembers).values({ projectId: p!.id, userId: leader, access: "edit", addedBy: adminId });
    return p!.id;
  });
}

const eventValues = (projectId: string, title: string) => ({
  projectId,
  kind: "assembly_start" as const,
  title,
  createdBy: adminId,
  updatedBy: adminId,
});

beforeEach(async () => {
  ({ db, client } = await createTestDb());
  adminId = await addUser("spravce@example.test", "admin");
  deputyId = await addUser("zastupce@example.test", "deputy");
  viewerId = await addUser("sledujici1@example.test", "viewer");
});

afterEach(async () => {
  await client.close();
});

describe("migrace – vznik schématu", () => {
  it("na prázdné databázi vytvoří přesně 5 tabulek", async () => {
    const r = await db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    );
    expect(r.rows.map((x) => x.table_name)).toEqual(["events", "history_entries", "project_members", "projects", "users"]);
  });
});

describe("události – termíny jen v událostech", () => {
  it("více událostí stejného typu v jedné zakázce je povoleno, každá s vlastním id a termíny", async () => {
    const pid = await addProject();
    const [l1] = await db.insert(events).values({ ...eventValues(pid, "Zahájení montáže technologie – linka 1"), plannedDate: "2027-03-01" }).returning();
    const [l2] = await db.insert(events).values({ ...eventValues(pid, "Zahájení montáže technologie – linka 2"), plannedDate: "2027-05-10" }).returning();
    expect(l1!.id).not.toBe(l2!.id);
    expect([l1!.plannedDate, l2!.plannedDate]).toEqual(["2027-03-01", "2027-05-10"]);
  });

  it("všechny termíny smí být prázdné (zatím neznámé)", async () => {
    const pid = await addProject();
    const [e] = await db.insert(events).values(eventValues(pid, "Předání staveniště")).returning();
    expect([e!.contractDate, e!.plannedDate, e!.actualDate]).toEqual([null, null, null]);
  });

  it("skutečné datum bez údaje, kdo a kdy ho zapsal, databáze odmítne", async () => {
    const pid = await addProject();
    const msg = await pgError(db.insert(events).values({ ...eventValues(pid, "Montáž"), actualDate: "2026-11-10" }));
    expect(msg).toMatch(/events_actual_recorded/);
  });

  it("zrušení události bez důvodu databáze odmítne", async () => {
    const pid = await addProject();
    const msg = await pgError(
      db.insert(events).values({ ...eventValues(pid, "Montáž"), status: "cancelled", cancelledAt: new Date(), cancelledBy: adminId }),
    );
    expect(msg).toMatch(/events_cancel_consistent/);
  });

  it("prázdný název události databáze odmítne", async () => {
    const pid = await addProject();
    expect(await pgError(db.insert(events).values(eventValues(pid, "   ")))).toMatch(/events_title_not_blank/);
  });
});

describe("zakázky", () => {
  it("typ „jiná“ vyžaduje upřesnění", async () => {
    const msg = await pgError(
      db.transaction(async (tx) => {
        const [p] = await tx
          .insert(projects)
          .values({ name: "X", projectType: "other", leaderUserId: deputyId, createdBy: adminId, updatedBy: adminId })
          .returning();
        await tx.insert(projectMembers).values({ projectId: p!.id, userId: deputyId, access: "edit", addedBy: adminId });
      }),
    );
    expect(msg).toMatch(/projects_other_type_has_note/);
  });

  it("archivace bez důvodu se neuloží", async () => {
    const pid = await addProject();
    const msg = await pgError(
      db.update(projects).set({ status: "archived", archivedAt: new Date(), archivedBy: adminId }).where(sql`${projects.id} = ${pid}`),
    );
    expect(msg).toMatch(/projects_archive_consistent/);
  });

  it("zakázku s událostmi nelze fyzicky smazat (archivace místo mazání)", async () => {
    const pid = await addProject();
    await db.insert(events).values(eventValues(pid, "Montáž"));
    expect(await pgError(db.delete(projects).where(sql`${projects.id} = ${pid}`))).toMatch(/foreign key|violates/i);
  });
});

describe("vedoucí zakázky je vždy členem s úpravami", () => {
  it("zakázku bez členství vedoucího nelze uložit", async () => {
    const msg = await pgError(
      db.insert(projects).values({ name: "Bez vedoucího", projectType: "reconstruction", leaderUserId: deputyId, createdBy: adminId, updatedBy: adminId }),
    );
    expect(msg).toMatch(/Vedoucí zakázky musí být jejím členem/);
  });

  it("vedoucímu nelze odebrat členství ani snížit přístup na čtení", async () => {
    const pid = await addProject();
    expect(await pgError(db.delete(projectMembers).where(sql`${projectMembers.projectId} = ${pid}`))).toMatch(/Vedoucí zakázky/);
    expect(await pgError(db.update(projectMembers).set({ access: "read" }).where(sql`${projectMembers.projectId} = ${pid}`))).toMatch(
      /Vedoucí zakázky/,
    );
  });

  it("změna vedoucího projde jen spolu s jeho členstvím „edit“", async () => {
    const pid = await addProject();
    const where = sql`${projects.id} = ${pid}`;
    expect(await pgError(db.update(projects).set({ leaderUserId: adminId }).where(where))).toMatch(/Vedoucí zakázky/);
    await db.transaction(async (tx) => {
      await tx.insert(projectMembers).values({ projectId: pid, userId: adminId, access: "edit", addedBy: adminId });
      await tx.update(projects).set({ leaderUserId: adminId }).where(where);
    });
  });

  // Upřesnění ke schválení migrace, bod 1.
  it("zakázku lze založit a v téže transakci zapsat vedoucího jako člena s úpravami", async () => {
    const pid = await addProject("ČOV Fiktivní Ves", deputyId);
    const members = await db.select().from(projectMembers).where(sql`${projectMembers.projectId} = ${pid}`);
    expect(members).toMatchObject([{ userId: deputyId, access: "edit" }]);
    const adminLed = await addProject("ČOV Fiktivní Brod", adminId);
    expect(adminLed).toBeTruthy();
  });

  it("vedoucím nesmí být sledující – ani s členstvím „edit“", async () => {
    const msg = await pgError(addProject("ČOV Fiktivní Pole", viewerId));
    expect(msg).toMatch(/Vedoucím zakázky nemůže být uživatel s rolí jen pro čtení/);
    expect(await db.$count(projects)).toBe(0); // nic se neuložilo ani částečně
  });

  it("vedoucího nelze převést na sledujícího a nelze ho předat sledujícímu", async () => {
    const pid = await addProject("ČOV Fiktivní Les", deputyId);
    expect(await pgError(db.update(users).set({ globalRole: "viewer" }).where(sql`${users.id} = ${deputyId}`))).toMatch(
      /Vedoucím zakázky nemůže být/,
    );
    const msg = await pgError(
      db.transaction(async (tx) => {
        await tx.insert(projectMembers).values({ projectId: pid, userId: viewerId, access: "edit", addedBy: adminId });
        await tx.update(projects).set({ leaderUserId: viewerId }).where(sql`${projects.id} = ${pid}`);
      }),
    );
    expect(msg).toMatch(/Vedoucím zakázky nemůže být/);
  });

  it("změna role uživatele, který nic nevede, projde", async () => {
    await addProject("ČOV Fiktivní Mlýn", deputyId);
    await db.update(users).set({ globalRole: "deputy" }).where(sql`${users.id} = ${viewerId}`);
    await db.update(users).set({ globalRole: "viewer" }).where(sql`${users.id} = ${viewerId}`);
  });

  it("sledujícího lze přidat jen pro čtení, aniž by to vadilo", async () => {
    const pid = await addProject();
    await db.insert(projectMembers).values({ projectId: pid, userId: viewerId, access: "read", addedBy: adminId });
  });
});

describe("historie změn – jen přidávání", () => {
  it("záznam lze přidat, ale ne upravit, smazat ani vyprázdnit tabulku", async () => {
    const pid = await addProject();
    await db.insert(historyEntries).values({
      actorUserId: adminId,
      projectId: pid,
      entityType: "project",
      entityId: pid,
      action: "create",
      changes: { name: { before: null, after: "ČOV Fiktivní Lhota" } },
    });
    expect(await pgError(db.update(historyEntries).set({ reason: "pokus" }))).toMatch(/jen pro přidávání/);
    expect(await pgError(db.delete(historyEntries))).toMatch(/jen pro přidávání/);
    expect(await pgError(db.execute(sql`truncate history_entries`))).toMatch(/jen pro přidávání/);
    const count = await db.$count(historyEntries);
    expect(count).toBe(1);
  });
});

describe("uživatelé", () => {
  it("e-mail je jedinečný a malými písmeny", async () => {
    expect(await pgError(addUser("spravce@example.test", "viewer"))).toMatch(/users_email_unique/);
    expect(await pgError(addUser("Velka@example.test", "viewer"))).toMatch(/users_email_lowercase/);
  });
  it("neznámou roli databáze odmítne", async () => {
    const msg = await pgError(db.execute(sql`insert into users (email, display_name, global_role) values ('x@example.test', 'X', 'superuser')`));
    expect(msg).toMatch(/users_global_role_valid/);
  });
  it("výchozí role je nejmenší oprávnění (sledující)", async () => {
    const [u] = await db.insert(users).values({ email: "novy@example.test", displayName: "Nový Fiktivní" }).returning();
    expect(u!.globalRole).toBe("viewer");
  });
});
