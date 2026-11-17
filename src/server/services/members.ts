// Členové zakázky a jejich přístup. Přidělovat smí jen správce (Q11).
import { and, eq, notInArray } from "drizzle-orm";
import { assignableAccess } from "../../domain/access/permissions.ts";
import { MEMBER_ACCESS, type MemberAccess } from "../../domain/values.ts";
import type { Db } from "../db/client.ts";
import { projectMembers, users } from "../db/schema.ts";
import { DomainError } from "../errors.ts";
import { isUuid, requireProject, writeHistory, type SessionActor } from "./common.ts";

function parseAccess(v: string): MemberAccess {
  if (!(MEMBER_ACCESS as readonly string[]).includes(v)) throw new DomainError("validation", "Vyberte přístup.", { access: "Vyberte přístup." });
  return v as MemberAccess;
}

async function requireUser(db: Db | Parameters<Parameters<Db["transaction"]>[0]>[0], userId: string) {
  if (!isUuid(userId)) throw new DomainError("validation", "Vyberte uživatele.", { userId: "Vyberte uživatele." });
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u || u.status !== "active") throw new DomainError("validation", "Vyberte aktivního uživatele.", { userId: "Vyberte aktivního uživatele." });
  return u;
}

function checkAssignable(globalRole: Parameters<typeof assignableAccess>[0], access: MemberAccess) {
  if (!assignableAccess(globalRole).includes(access)) {
    throw new DomainError("validation", "Sledující může mít jen přístup pro čtení. Roli může změnit jen správce.", {
      access: "Sledující může mít jen přístup pro čtení.",
    });
  }
}

export async function addMember(db: Db, actor: SessionActor, projectId: string, userId: string, accessRaw: string) {
  const access = parseAccess(accessRaw);
  await db.transaction(async (tx) => {
    await requireProject(tx, actor, projectId, "members.manage");
    const u = await requireUser(tx, userId);
    checkAssignable(u.globalRole, access);
    const [existing] = await tx
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
    if (existing) throw new DomainError("validation", "Uživatel už je členem zakázky.");
    await tx.insert(projectMembers).values({ projectId, userId, access, addedBy: actor.id });
    await writeHistory(tx, { actorId: actor.id, projectId, entityType: "project_member", entityId: `${projectId}:${userId}`, action: "member_add", changes: { access: { before: null, after: access } } });
  });
}

export async function changeMemberAccess(db: Db, actor: SessionActor, projectId: string, userId: string, accessRaw: string) {
  const access = parseAccess(accessRaw);
  await db.transaction(async (tx) => {
    const { project } = await requireProject(tx, actor, projectId, "members.manage");
    const u = await requireUser(tx, userId);
    checkAssignable(u.globalRole, access);
    if (project.leaderUserId === userId && access !== "edit") {
      throw new DomainError("validation", "Vedoucí zakázky musí mít přístup pro úpravy. Nejprve změňte vedoucího.");
    }
    const [m] = await tx
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
    if (!m) throw new DomainError("not_found", "Člen nebyl nalezen.");
    if (m.access === access) return;
    await tx.update(projectMembers).set({ access }).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
    await writeHistory(tx, { actorId: actor.id, projectId, entityType: "project_member", entityId: `${projectId}:${userId}`, action: "member_change", changes: { access: { before: m.access, after: access } } });
  });
}

export async function removeMember(db: Db, actor: SessionActor, projectId: string, userId: string) {
  await db.transaction(async (tx) => {
    const { project } = await requireProject(tx, actor, projectId, "members.manage");
    if (project.leaderUserId === userId) {
      throw new DomainError("validation", "Vedoucího zakázky nelze odebrat. Nejprve změňte vedoucího.");
    }
    const deleted = await tx
      .delete(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
      .returning();
    if (!deleted.length) throw new DomainError("not_found", "Člen nebyl nalezen.");
    await writeHistory(tx, { actorId: actor.id, projectId, entityType: "project_member", entityId: `${projectId}:${userId}`, action: "member_remove", changes: { access: { before: deleted[0]!.access, after: null } } });
  });
}

/** Uživatelé, které lze ještě přidat (jen pro správce). */
export async function listMemberCandidates(db: Db, actor: SessionActor, projectId: string) {
  await requireProject(db, actor, projectId, "members.manage");
  const current = (await db.select({ id: projectMembers.userId }).from(projectMembers).where(eq(projectMembers.projectId, projectId))).map((r) => r.id);
  const rows = await db
    .select({ id: users.id, displayName: users.displayName, globalRole: users.globalRole })
    .from(users)
    .where(current.length ? and(eq(users.status, "active"), notInArray(users.id, current)) : eq(users.status, "active"));
  return rows.sort((a, b) => a.displayName.localeCompare(b.displayName, "cs"));
}
