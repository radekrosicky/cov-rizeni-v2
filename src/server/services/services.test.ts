// Integrační testy služeb nad DOČASNOU databází v paměti s fiktivními daty.
// Ověřují, že oprávnění platí NA SERVERU (ne jen skrytím tlačítek), že změna a historie jdou spolu
// a že souběžná úprava nic tiše nepřepíše.
import { eq } from "drizzle-orm";
import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../db/client.ts";
import { historyEntries, projectMembers, projects, users } from "../db/schema.ts";
import { createTestDb } from "../db/testDb.ts";
import { DomainError } from "../errors.ts";
import { DEV_IDENTITY_COOKIE, devIdentitiesEnabled, listDevIdentities, resolveDevActor } from "../identity/devIdentity.ts";
import { seedDevData } from "../seed/devSeed.ts";
import type { SessionActor } from "./common.ts";
import { cancelEvent, createEvent, updateEvent } from "./events.ts";
import { listProjectHistory } from "./history.ts";
import { addMember, changeMemberAccess, removeMember } from "./members.ts";
import { archiveProject, createProject, getProjectDetail, listProjects, unarchiveProject, updateProject } from "./projects.ts";

let db: Db;
let client: PGlite;
let admin: SessionActor, deputy: SessionActor, viewer1: SessionActor, viewer2: SessionActor;
let p1: string, p2: string, p3: string;

async function expectError(p: Promise<unknown>, code: DomainError["code"], message?: RegExp) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(DomainError);
  expect((err as DomainError).code).toBe(code);
  if (message) expect((err as DomainError).message + JSON.stringify((err as DomainError).fieldErrors)).toMatch(message);
}

const newEvent = (title: string, dates: { contractDate?: string; plannedDate?: string; actualDate?: string } = {}) => ({
  kind: "assembly_start",
  title,
  isMilestone: false,
  contractDate: dates.contractDate ?? null,
  plannedDate: dates.plannedDate ?? null,
  actualDate: dates.actualDate ?? null,
  note: null,
});

beforeEach(async () => {
  ({ db, client } = await createTestDb());
  const seeded = await seedDevData(db);
  [admin, deputy, viewer1, viewer2] = seeded.users as [SessionActor, SessionActor, SessionActor, SessionActor];
  [p1, p2, p3] = seeded.projects as [string, string, string];
});

afterEach(async () => {
  await client.close();
});

describe("založení zakázky a vedoucí (upřesnění ke schválení migrace)", () => {
  it("zástupce založí zakázku; vedoucí je automaticky členem s úpravami a vznikne historie", async () => {
    const p = await createProject(db, deputy, { name: "ČOV Nová Fikce", projectType: "new_plant", projectTypeNote: null, leaderUserId: deputy.id, clientName: null });
    const members = await db.select().from(projectMembers).where(eq(projectMembers.projectId, p.id));
    expect(members).toMatchObject([{ userId: deputy.id, access: "edit" }]);
    const hist = await db.select().from(historyEntries).where(eq(historyEntries.projectId, p.id));
    expect(hist.map((h) => h.action).sort()).toEqual(["create", "member_add"]);
  });

  it("zástupce, který zakládá zakázku pro jiného vedoucího, k ní sám dostane přístup pro úpravy", async () => {
    const p = await createProject(db, deputy, { name: "ČOV Pro Správce", projectType: "reconstruction", projectTypeNote: null, leaderUserId: admin.id, clientName: null });
    const members = await db.select().from(projectMembers).where(eq(projectMembers.projectId, p.id));
    expect(members.map((m) => [m.userId, m.access]).sort()).toEqual([[admin.id, "edit"], [deputy.id, "edit"]].sort());
  });

  it("vedoucím nesmí být sledující – nic se neuloží", async () => {
    const before = await db.$count(projects);
    await expectError(
      createProject(db, admin, { name: "ČOV Chyba", projectType: "new_plant", projectTypeNote: null, leaderUserId: viewer1.id, clientName: null }),
      "validation",
      /správce nebo zástupce/,
    );
    expect(await db.$count(projects)).toBe(before);
  });

  it("sledující zakázku nezaloží (kontrola na serveru)", async () => {
    await expectError(
      createProject(db, viewer1, { name: "ČOV X", projectType: "new_plant", projectTypeNote: null, leaderUserId: deputy.id, clientName: null }),
      "forbidden",
    );
  });

  it("typ „jiná“ vyžaduje upřesnění", async () => {
    await expectError(
      createProject(db, admin, { name: "ČOV Y", projectType: "other", projectTypeNote: " ", leaderUserId: admin.id, clientName: null }),
      "validation",
      /upřesněte/,
    );
  });

  it("změna vedoucího na sledujícího je odmítnuta", async () => {
    const [p] = await db.select().from(projects).where(eq(projects.id, p1));
    await expectError(
      updateProject(db, deputy, p1, p!.version, { name: p!.name, projectType: p!.projectType, projectTypeNote: null, leaderUserId: viewer1.id, clientName: null, status: "realization" }),
      "validation",
    );
  });
});

describe("viditelnost zakázek (S16)", () => {
  it("správce vidí vše, zástupce přidělené, sledující jen své", async () => {
    expect((await listProjects(db, admin)).length).toBe(3);
    expect((await listProjects(db, deputy)).length).toBe(3);
    expect((await listProjects(db, viewer1)).map((p) => p.id)).toEqual([p1]);
    expect((await listProjects(db, viewer2)).map((p) => p.id)).toEqual([p2]);
  });

  it("nepřidělená zakázka se chová, jako by neexistovala", async () => {
    await expectError(getProjectDetail(db, viewer1, p3), "not_found");
    await expectError(getProjectDetail(db, viewer1, "nesmysl"), "not_found");
  });

  it("sledující čte zakázku i historii, ale nesmí nic upravit", async () => {
    const d = await getProjectDetail(db, viewer1, p1);
    expect(d.can).toMatchObject({ edit: false, editEvents: false, manageMembers: false, archive: false, viewHistory: true });
    expect((await listProjectHistory(db, viewer1, p1)).length).toBeGreaterThan(0);
    await expectError(createEvent(db, viewer1, p1, newEvent("Pokus")), "forbidden");
    const e = d.events[0]!;
    await expectError(updateEvent(db, viewer1, p1, e.id, e.version, newEvent("Pokus"), null), "forbidden");
    await expectError(
      updateProject(db, viewer1, p1, d.project.version, { name: "X", projectType: "new_plant", projectTypeNote: null, leaderUserId: deputy.id, clientName: null, status: "realization" }),
      "forbidden",
    );
  });

  it("sledujícímu nelze přidělit přístup pro úpravy", async () => {
    await expectError(changeMemberAccess(db, admin, p1, viewer1.id, "edit"), "validation", /jen přístup pro čtení/);
    await expectError(addMember(db, admin, p3, viewer2.id, "edit"), "validation");
  });
});

describe("členové a archivace – jen správce (Q11)", () => {
  it("zástupce nepřiděluje přístupy ani nearchivuje", async () => {
    await expectError(addMember(db, deputy, p1, viewer2.id, "read"), "forbidden");
    const [p] = await db.select().from(projects).where(eq(projects.id, p1));
    await expectError(archiveProject(db, deputy, p1, p!.version, "Konec"), "forbidden");
  });

  it("vedoucího nelze odebrat ani mu snížit přístup", async () => {
    await expectError(removeMember(db, admin, p1, deputy.id), "validation", /Vedoucího/);
    await expectError(changeMemberAccess(db, admin, p1, deputy.id, "read"), "validation", /Vedoucí/);
  });

  it("správce přidá a odebere sledujícího – vše v historii", async () => {
    await addMember(db, admin, p3, viewer1.id, "read");
    expect((await listProjects(db, viewer1)).length).toBe(2);
    await removeMember(db, admin, p3, viewer1.id);
    expect((await listProjects(db, viewer1)).length).toBe(1);
    const actions = (await listProjectHistory(db, admin, p3)).map((h) => h.action);
    expect(actions).toContain("member_add");
    expect(actions).toContain("member_remove");
  });

  it("archivace vyžaduje důvod; archivovaná zakázka je jen pro čtení, správce ji obnoví", async () => {
    let [p] = await db.select().from(projects).where(eq(projects.id, p3));
    await expectError(archiveProject(db, admin, p3, p!.version, "  "), "validation");
    await archiveProject(db, admin, p3, p!.version, "Fiktivní zakázka ukončena");
    await expectError(createEvent(db, deputy, p3, newEvent("Po archivaci")), "forbidden", /archivovaná/);
    [p] = await db.select().from(projects).where(eq(projects.id, p3));
    await unarchiveProject(db, admin, p3, p!.version, "Omyl");
    await createEvent(db, deputy, p3, newEvent("Po obnovení"));
  });
});

describe("události – jeden zdroj termínů", () => {
  it("více událostí stejného typu, každá s vlastními termíny; prázdné termíny povoleny", async () => {
    const a = await createEvent(db, deputy, p3, newEvent("Montáž – linka 1", { plannedDate: "2027-04-01" }));
    const b = await createEvent(db, deputy, p3, newEvent("Montáž – linka 2"));
    expect(a.id).not.toBe(b.id);
    expect([a.plannedDate, b.plannedDate]).toEqual(["2027-04-01", null]);
  });

  it("skutečné datum nesmí být v budoucnosti", async () => {
    await expectError(createEvent(db, deputy, p3, newEvent("Budoucí", { actualDate: "2999-01-01" })), "validation", /budoucnosti/);
  });

  it("zápis skutečného data uloží kdo/kdy; oprava vyžaduje důvod", async () => {
    const e = await createEvent(db, deputy, p3, newEvent("Montáž", { plannedDate: "2026-11-01" }));
    const recorded = await updateEvent(db, deputy, p3, e.id, e.version, newEvent("Montáž", { plannedDate: "2026-11-01", actualDate: "2026-11-03" }), null);
    expect(recorded.actualRecordedBy).toBe(deputy.id);
    expect(recorded.actualRecordedAt).toBeInstanceOf(Date);
    await expectError(
      updateEvent(db, deputy, p3, e.id, recorded.version, newEvent("Montáž", { plannedDate: "2026-11-01", actualDate: "2026-11-04" }), null),
      "validation",
      /důvod/,
    );
    await updateEvent(db, deputy, p3, e.id, recorded.version, newEvent("Montáž", { plannedDate: "2026-11-01", actualDate: "2026-11-04" }), "Překlep v datu");
    const hist = (await listProjectHistory(db, deputy, p3)).filter((h) => h.entityId === e.id);
    expect(hist.map((h) => h.action)).toEqual(["update", "record_actual", "create"]);
    expect(hist[0]!.reason).toBe("Překlep v datu");
  });

  it("zrušení události jen s důvodem", async () => {
    const e = await createEvent(db, deputy, p3, newEvent("Zrušit"));
    await expectError(cancelEvent(db, deputy, p3, e.id, e.version, ""), "validation");
    await cancelEvent(db, deputy, p3, e.id, e.version, "Duplicitně zadáno");
    const d = await getProjectDetail(db, deputy, p3);
    expect(d.cancelledEvents.map((x) => x.id)).toContain(e.id);
  });

  it("událost jiné zakázky nelze upravit přes cizí adresu", async () => {
    const e = await createEvent(db, admin, p2, newEvent("Cizí"));
    await expectError(updateEvent(db, deputy, p3, e.id, e.version, newEvent("X"), null), "not_found");
  });
});

describe("souběžné úpravy (Q8) – nic se tiše nepřepíše", () => {
  it("druhé uložení se starou verzí zakázky skončí konfliktem a první změna zůstane", async () => {
    const [p] = await db.select().from(projects).where(eq(projects.id, p3));
    const base = { projectType: p!.projectType, projectTypeNote: null, leaderUserId: p!.leaderUserId, clientName: null, status: "preparation" };
    await updateProject(db, deputy, p3, p!.version, { ...base, name: "Změna A" });
    await expectError(updateProject(db, admin, p3, p!.version, { ...base, name: "Změna B" }), "conflict", /NEBYLY uloženy/);
    const [after] = await db.select().from(projects).where(eq(projects.id, p3));
    expect(after!.name).toBe("Změna A");
  });

  it("totéž u události", async () => {
    const e = await createEvent(db, deputy, p3, newEvent("Souběh", { plannedDate: "2027-01-01" }));
    await updateEvent(db, deputy, p3, e.id, e.version, newEvent("Souběh", { plannedDate: "2027-01-02" }), null);
    await expectError(updateEvent(db, admin, p3, e.id, e.version, newEvent("Souběh", { plannedDate: "2027-01-03" }), null), "conflict");
  });
});

describe("vývojová identita – jen ve vývojovém režimu", () => {
  const dev = { NODE_ENV: "development", DEV_IDENTITIES: "enabled" };

  it("zapne se jen při splnění obou podmínek", () => {
    expect(devIdentitiesEnabled(dev)).toBe(true);
    expect(devIdentitiesEnabled({ ...dev, NODE_ENV: "production" })).toBe(false);
    expect(devIdentitiesEnabled({ ...dev, NODE_ENV: "test" })).toBe(false);
    expect(devIdentitiesEnabled({ NODE_ENV: "development" })).toBe(false);
    expect(devIdentitiesEnabled({ NODE_ENV: "development", DEV_IDENTITIES: "true" })).toBe(false);
  });

  it("ve vývoji vrátí fiktivního uživatele podle cookie", async () => {
    expect((await resolveDevActor(db, dev, admin.id))?.globalRole).toBe("admin");
    expect((await listDevIdentities(db, dev)).length).toBe(4);
  });

  it("v produkčním režimu je technicky vypnutá – i s platnou cookie", async () => {
    const prod = { NODE_ENV: "production", DEV_IDENTITIES: "enabled" };
    expect(await resolveDevActor(db, prod, admin.id)).toBeNull();
    expect(await listDevIdentities(db, prod)).toEqual([]);
  });

  it("nepřijme skutečného (ne-fiktivního) ani deaktivovaného uživatele ani nesmysl", async () => {
    const [real] = await db.insert(users).values({ email: "skutecny@example.test", displayName: "Ne-vývojový účet", globalRole: "admin" }).returning();
    expect(await resolveDevActor(db, dev, real!.id)).toBeNull();
    await db.update(users).set({ status: "deactivated" }).where(eq(users.id, viewer2.id));
    expect(await resolveDevActor(db, dev, viewer2.id)).toBeNull();
    expect(await resolveDevActor(db, dev, "'; drop table users; --")).toBeNull();
    expect(DEV_IDENTITY_COOKIE).toBe("cov_dev_identity");
  });
});
