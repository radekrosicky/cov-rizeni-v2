// Oprávnění (R1, Q7, Q11, S16). Čistá funkce – volá ji serverová vrstva před KAŽDÝM čtením i zápisem.
// Skryté tlačítko v obrazovce není ochrana; rozhoduje tato funkce na serveru.
import type { GlobalRole, MemberAccess, ProjectStatus, UserStatus } from "../values.ts";

export interface Actor {
  id: string;
  globalRole: GlobalRole;
  status: UserStatus;
}

/** Kontext jedné zakázky z pohledu daného uživatele. */
export interface ProjectContext {
  status: ProjectStatus;
  /** Členství uživatele v zakázce; null = není členem. */
  membership: MemberAccess | null;
}

export type ProjectAction =
  | "project.view" // zakázka, události, členové
  | "history.view" // historie změn zakázky (Q7: i sledující)
  | "project.edit" // základní údaje zakázky
  | "event.edit" // přidat / upravit / zrušit událost, zapsat skutečné datum
  | "project.archive" // jen správce
  | "project.unarchive" // jen správce
  | "members.manage" // přidělování přístupu – jen správce (Q11)
  | "document.view" // seznam, detail, otevřít, stáhnout (i sledující u přidělené zakázky)
  | "document.manage" // nahrát, nová revize, změna aktuální revize, úprava údajů, archivace (V2-2)
  | "material.view" // rozpočtové položky, sledované dodávky (i sledující u přidělené zakázky)
  | "material.manage"; // import rozpočtu, dodávky a jejich vazby (V2-3)

export type GlobalAction = "project.create";

export type Decision = { allowed: true } | { allowed: false; reason: DenyReason };
export type DenyReason = "inactive" | "not_member" | "read_only" | "admin_only" | "archived";

const allow: Decision = { allowed: true };
const deny = (reason: DenyReason): Decision => ({ allowed: false, reason });

/** Efektivní přístup k zakázce: kombinace globální role a členství. Sledující nikdy neupravuje,
 *  i kdyby měl omylem členství „edit“ (S16 – roli mění jen správce). */
export function effectiveAccess(actor: Actor, membership: MemberAccess | null): "admin" | MemberAccess | null {
  if (actor.status !== "active") return null;
  if (actor.globalRole === "admin") return "admin";
  if (!membership) return null;
  if (actor.globalRole === "viewer") return "read";
  return membership;
}

export function canGlobal(actor: Actor, action: GlobalAction): Decision {
  if (actor.status !== "active") return deny("inactive");
  switch (action) {
    case "project.create":
      // Zástupce smí zakládat; automaticky se stane členem s přístupem „edit“ (schváleno k plánu V2-1).
      return actor.globalRole === "admin" || actor.globalRole === "deputy" ? allow : deny("read_only");
  }
}

export function canProject(actor: Actor, action: ProjectAction, project: ProjectContext): Decision {
  if (actor.status !== "active") return deny("inactive");
  const access = effectiveAccess(actor, project.membership);
  if (access === null) return deny("not_member"); // navenek se chová, jako by zakázka neexistovala

  switch (action) {
    case "project.view":
    case "history.view":
    case "document.view":
    case "material.view":
      return allow;
    case "project.archive":
      if (access !== "admin") return deny("admin_only");
      return project.status === "archived" ? deny("archived") : allow;
    case "project.unarchive":
      if (access !== "admin") return deny("admin_only");
      return project.status === "archived" ? allow : deny("archived");
    case "members.manage":
      if (access !== "admin") return deny("admin_only");
      return project.status === "archived" ? deny("archived") : allow;
    case "project.edit":
    case "event.edit":
    case "document.manage":
    case "material.manage":
      if (access === "read") return deny("read_only");
      // Archivovaná zakázka je jen pro čtení i pro správce; nejdřív ji musí obnovit (s historií).
      return project.status === "archived" ? deny("archived") : allow;
  }
}

export const DENY_MESSAGES: Record<DenyReason, string> = {
  inactive: "Účet není aktivní.",
  not_member: "Zakázka nebyla nalezena.",
  read_only: "Máte přístup jen pro čtení.",
  admin_only: "Tuto akci smí provést jen správce.",
  archived: "Zakázka je archivovaná – nejprve ji musí správce obnovit.",
};

/** Vedoucím zakázky smí být jen správce nebo zástupce (sledující má jen čtení) – hlídá i databáze. */
export function canBeLeader(role: GlobalRole, status: UserStatus): boolean {
  return status === "active" && (role === "admin" || role === "deputy");
}

/** Jaký přístup k zakázce lze uživateli přidělit: sledujícímu jen čtení. */
export function assignableAccess(role: GlobalRole): readonly MemberAccess[] {
  return role === "viewer" ? ["read"] : ["edit", "read"];
}
