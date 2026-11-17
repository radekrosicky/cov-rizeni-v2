// Zakázky: seznam, detail, založení, úprava, archivace a obnova.
import { and, desc, eq, inArray } from "drizzle-orm";
import { canBeLeader, canGlobal, canProject } from "../../domain/access/permissions.ts";
import { nearestOpenEvent, sortEvents } from "../../domain/events/eventDates.ts";
import { PROJECT_TYPES, type ProjectStatus, type ProjectType } from "../../domain/values.ts";
import type { Db, DbOrTx } from "../db/client.ts";
import { events, historyEntries, projectMembers, projects, users, type Project } from "../db/schema.ts";
import { DomainError } from "../errors.ts";
import { conflictError, diff, requireProject, requireReason, writeHistory, type SessionActor } from "./common.ts";

export interface ProjectInput {
  name: string;
  projectType: string;
  projectTypeNote: string | null;
  leaderUserId: string;
  clientName: string | null;
}

const EDITABLE_FIELDS = ["name", "projectType", "projectTypeNote", "leaderUserId", "clientName", "status"] as const;

function validateInput(input: ProjectInput): {
  name: string;
  projectType: ProjectType;
  projectTypeNote: string | null;
  clientName: string | null;
} {
  const fieldErrors: Record<string, string> = {};
  const name = input.name.trim();
  if (!name) fieldErrors.name = "Vyplňte název zakázky.";
  if (!(PROJECT_TYPES as readonly string[]).includes(input.projectType)) fieldErrors.projectType = "Vyberte typ zakázky.";
  const note = input.projectTypeNote?.trim() || null;
  if (input.projectType === "other" && !note) fieldErrors.projectTypeNote = "U typu „jiná“ upřesněte, o jakou zakázku jde.";
  if (Object.keys(fieldErrors).length) throw new DomainError("validation", "Formulář obsahuje chyby.", fieldErrors);
  return {
    name,
    projectType: input.projectType as ProjectType,
    projectTypeNote: input.projectType === "other" ? note : null,
    clientName: input.clientName?.trim() || null,
  };
}

async function requireEligibleLeader(db: DbOrTx, userId: string) {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u || !canBeLeader(u.globalRole, u.status)) {
    throw new DomainError("validation", "Vedoucím může být jen aktivní správce nebo zástupce.", {
      leaderUserId: "Vedoucím může být jen aktivní správce nebo zástupce (ne sledující).",
    });
  }
  return u;
}

/** Zajistí členství „edit“ (vedoucí, zakladatel). Existující „read“ povýší – se záznamem v historii. */
async function ensureEditMembership(tx: DbOrTx, actor: SessionActor, projectId: string, userId: string) {
  const [m] = await tx
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
  const entityId = `${projectId}:${userId}`;
  if (!m) {
    await tx.insert(projectMembers).values({ projectId, userId, access: "edit", addedBy: actor.id });
    await writeHistory(tx, { actorId: actor.id, projectId, entityType: "project_member", entityId, action: "member_add", changes: { access: { before: null, after: "edit" } } });
  } else if (m.access !== "edit") {
    await tx
      .update(projectMembers)
      .set({ access: "edit" })
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
    await writeHistory(tx, { actorId: actor.id, projectId, entityType: "project_member", entityId, action: "member_change", changes: { access: { before: m.access, after: "edit" } }, reason: "Vedoucí zakázky má vždy přístup pro úpravy." });
  }
}

export async function createProject(db: Db, actor: SessionActor, input: ProjectInput): Promise<Project> {
  const decision = canGlobal(actor, "project.create");
  if (!decision.allowed) throw new DomainError("forbidden", "Zakládat zakázky smí jen správce nebo zástupce.");
  const v = validateInput(input);
  return db.transaction(async (tx) => {
    await requireEligibleLeader(tx, input.leaderUserId);
    const [p] = await tx
      .insert(projects)
      .values({ ...v, leaderUserId: input.leaderUserId, createdBy: actor.id, updatedBy: actor.id })
      .returning();
    const project = p!;
    await writeHistory(tx, {
      actorId: actor.id,
      projectId: project.id,
      entityType: "project",
      entityId: project.id,
      action: "create",
      changes: diff(null, project, EDITABLE_FIELDS),
    });
    await ensureEditMembership(tx, actor, project.id, project.leaderUserId);
    // Zástupce, který zakázku založil, k ní automaticky získá přístup pro úpravy (rozhodnutí k plánu V2-1).
    if (actor.globalRole === "deputy" && actor.id !== project.leaderUserId) {
      await ensureEditMembership(tx, actor, project.id, actor.id);
    }
    return project;
  });
}

export interface ProjectUpdateInput extends ProjectInput {
  status: string;
}

export async function updateProject(db: Db, actor: SessionActor, projectId: string, version: number, input: ProjectUpdateInput) {
  const v = validateInput(input);
  if (!(["preparation", "realization"] as string[]).includes(input.status)) {
    throw new DomainError("validation", "Formulář obsahuje chyby.", { status: "Vyberte stav (příprava / realizace)." });
  }
  return db.transaction(async (tx) => {
    const { project: before } = await requireProject(tx, actor, projectId, "project.edit");
    if (before.version !== version) throw conflictError();
    if (input.leaderUserId !== before.leaderUserId) await requireEligibleLeader(tx, input.leaderUserId);
    const [after] = await tx
      .update(projects)
      .set({
        ...v,
        leaderUserId: input.leaderUserId,
        status: input.status as ProjectStatus,
        version: before.version + 1,
        updatedBy: actor.id,
        updatedAt: new Date(),
      })
      .where(and(eq(projects.id, projectId), eq(projects.version, version)))
      .returning();
    if (!after) throw conflictError();
    if (after.leaderUserId !== before.leaderUserId) await ensureEditMembership(tx, actor, projectId, after.leaderUserId);
    const changes = diff(before, after, EDITABLE_FIELDS);
    if (Object.keys(changes).length) {
      await writeHistory(tx, { actorId: actor.id, projectId, entityType: "project", entityId: projectId, action: "update", changes });
    }
    return after;
  });
}

export async function archiveProject(db: Db, actor: SessionActor, projectId: string, version: number, reason: string) {
  const r = requireReason(reason);
  return db.transaction(async (tx) => {
    const { project: before } = await requireProject(tx, actor, projectId, "project.archive");
    const [after] = await tx
      .update(projects)
      .set({ status: "archived", archivedAt: new Date(), archivedBy: actor.id, archiveReason: r, version: before.version + 1, updatedBy: actor.id, updatedAt: new Date() })
      .where(and(eq(projects.id, projectId), eq(projects.version, version)))
      .returning();
    if (!after) throw conflictError();
    await writeHistory(tx, { actorId: actor.id, projectId, entityType: "project", entityId: projectId, action: "archive", changes: { status: { before: before.status, after: "archived" } }, reason: r });
    return after;
  });
}

export async function unarchiveProject(db: Db, actor: SessionActor, projectId: string, version: number, reason: string) {
  const r = requireReason(reason);
  return db.transaction(async (tx) => {
    await requireProject(tx, actor, projectId, "project.unarchive");
    const [after] = await tx
      .update(projects)
      .set({ status: "realization", archivedAt: null, archivedBy: null, archiveReason: null, version: version + 1, updatedBy: actor.id, updatedAt: new Date() })
      .where(and(eq(projects.id, projectId), eq(projects.version, version)))
      .returning();
    if (!after) throw conflictError();
    await writeHistory(tx, { actorId: actor.id, projectId, entityType: "project", entityId: projectId, action: "unarchive", changes: { status: { before: "archived", after: "realization" } }, reason: r });
    return after;
  });
}

// ---------- Čtení ----------

export async function listProjects(db: Db, actor: SessionActor) {
  if (actor.status !== "active") return [];
  const rows =
    actor.globalRole === "admin"
      ? await db.select().from(projects)
      : await db
          .select({ p: projects })
          .from(projects)
          .innerJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, actor.id)))
          .then((r) => r.map((x) => x.p));
  if (!rows.length) return [];
  const ids = rows.map((p) => p.id);
  const [evs, leaders] = await Promise.all([
    db.select().from(events).where(inArray(events.projectId, ids)),
    db.select({ id: users.id, displayName: users.displayName }).from(users).where(inArray(users.id, rows.map((p) => p.leaderUserId))),
  ]);
  const leaderName = new Map(leaders.map((l) => [l.id, l.displayName]));
  return rows
    .map((p) => ({
      ...p,
      leaderName: leaderName.get(p.leaderUserId) ?? "—",
      nearestEvent: nearestOpenEvent(evs.filter((e) => e.projectId === p.id)),
    }))
    .sort((a, b) => Number(a.status === "archived") - Number(b.status === "archived") || a.name.localeCompare(b.name, "cs"));
}

export async function getProjectDetail(db: Db, actor: SessionActor, projectId: string) {
  const { project, membership } = await requireProject(db, actor, projectId, "project.view");
  const ctx = { status: project.status, membership };
  const can = {
    edit: canProject(actor, "project.edit", ctx).allowed,
    editEvents: canProject(actor, "event.edit", ctx).allowed,
    manageMembers: canProject(actor, "members.manage", ctx).allowed,
    archive: canProject(actor, "project.archive", ctx).allowed,
    unarchive: canProject(actor, "project.unarchive", ctx).allowed,
    viewHistory: canProject(actor, "history.view", ctx).allowed,
  };
  const [evs, members, [lastChange], [leader], [archivedBy]] = await Promise.all([
    db.select().from(events).where(eq(events.projectId, projectId)),
    db
      .select({ userId: projectMembers.userId, access: projectMembers.access, displayName: users.displayName, globalRole: users.globalRole })
      .from(projectMembers)
      .innerJoin(users, eq(users.id, projectMembers.userId))
      .where(eq(projectMembers.projectId, projectId)),
    db
      .select({ at: historyEntries.at, action: historyEntries.action, entityType: historyEntries.entityType, actorName: users.displayName })
      .from(historyEntries)
      .innerJoin(users, eq(users.id, historyEntries.actorUserId))
      .where(eq(historyEntries.projectId, projectId))
      .orderBy(desc(historyEntries.at))
      .limit(1),
    db.select({ displayName: users.displayName }).from(users).where(eq(users.id, project.leaderUserId)),
    project.archivedBy
      ? db.select({ displayName: users.displayName }).from(users).where(eq(users.id, project.archivedBy))
      : Promise.resolve([]),
  ]);
  const active = sortEvents(evs.filter((e) => e.status === "active"));
  return {
    project,
    membership,
    can,
    leaderName: leader?.displayName ?? "—",
    archivedByName: archivedBy?.displayName ?? null,
    events: active,
    cancelledEvents: sortEvents(evs.filter((e) => e.status === "cancelled")),
    nearestEvent: nearestOpenEvent(active),
    members: members.sort((a, b) => a.displayName.localeCompare(b.displayName, "cs")),
    lastChange: lastChange ?? null,
  };
}

/** Kdo může být vedoucím (pro výběr ve formuláři). */
export async function listLeaderCandidates(db: Db) {
  const rows = await db
    .select({ id: users.id, displayName: users.displayName, globalRole: users.globalRole })
    .from(users)
    .where(and(eq(users.status, "active"), inArray(users.globalRole, ["admin", "deputy"])));
  return rows.sort((a, b) => a.displayName.localeCompare(b.displayName, "cs"));
}

