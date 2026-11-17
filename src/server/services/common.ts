// Společné části serverových služeb: přihlášený uživatel, kontrola přístupu k zakázce, zápis historie.
// Pravidlo: každá služba NEJDŘÍV ověří oprávnění (doména), pak v JEDNÉ transakci provede změnu i zápis historie.
import { and, eq } from "drizzle-orm";
import { canProject, DENY_MESSAGES, type Actor, type ProjectAction } from "../../domain/access/permissions.ts";
import type { GlobalRole, HistoryEntityType } from "../../domain/values.ts";
import type { DbOrTx } from "../db/client.ts";
import { historyEntries, projectMembers, projects, type Project } from "../db/schema.ts";
import { DomainError } from "../errors.ts";

/** Přihlášený uživatel (zatím jen fiktivní vývojová identita). */
export interface SessionActor extends Actor {
  displayName: string;
  email: string;
  isDevIdentity: boolean;
  globalRole: GlobalRole;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string) => UUID_RE.test(v);

/** Načte zakázku a ověří akci. Nečlen dostane „nenalezeno“ – nesmí se dozvědět, že zakázka existuje. */
export async function requireProject(db: DbOrTx, actor: Actor, projectId: string, action: ProjectAction) {
  if (!isUuid(projectId)) throw new DomainError("not_found", DENY_MESSAGES.not_member);
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) throw new DomainError("not_found", DENY_MESSAGES.not_member);
  const [m] = await db
    .select({ access: projectMembers.access })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, actor.id)));
  const membership = m?.access ?? null;
  const decision = canProject(actor, action, { status: project.status, membership });
  if (!decision.allowed) {
    throw new DomainError(decision.reason === "not_member" ? "not_found" : "forbidden", DENY_MESSAGES[decision.reason]);
  }
  return { project, membership };
}

export type Changes = Record<string, { before: unknown; after: unknown }>;

/** Rozdíl dvou záznamů jen v uvedených polích (pro historii). */
export function diff<T extends object>(before: T | null, after: T, fields: readonly (keyof T & string)[]): Changes {
  const out: Changes = {};
  for (const f of fields) {
    const b = before ? before[f] : null;
    const a = after[f];
    if (JSON.stringify(b ?? null) !== JSON.stringify(a ?? null)) out[f] = { before: b ?? null, after: a ?? null };
  }
  return out;
}

export async function writeHistory(
  tx: DbOrTx,
  entry: {
    actorId: string;
    projectId: string | null;
    entityType: HistoryEntityType;
    entityId: string;
    action: (typeof historyEntries.$inferInsert)["action"];
    changes?: Changes;
    reason?: string | null;
  },
): Promise<void> {
  await tx.insert(historyEntries).values({
    actorUserId: entry.actorId,
    projectId: entry.projectId,
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    changes: entry.changes ?? {},
    reason: entry.reason?.trim() || null,
  });
}

/** Hlášení o souběžné úpravě (Q8) – nic se tiše nepřepíše. */
export function conflictError(): DomainError {
  return new DomainError(
    "conflict",
    "Záznam mezitím upravil někdo jiný. Vaše změny NEBYLY uloženy – načtěte aktuální stav a zadejte je znovu.",
  );
}

export function requireReason(reason: string | null | undefined, field = "reason"): string {
  const r = (reason ?? "").trim();
  if (!r) throw new DomainError("validation", "Uveďte důvod.", { [field]: "Uveďte důvod." });
  return r;
}

export type ProjectRow = Project;
