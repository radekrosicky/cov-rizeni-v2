// Povolené hodnoty a jejich české popisy – JEDINÝ zdroj pro doménu i databázové schéma
// (schéma je importuje, aby se CHECK omezení v databázi nemohla rozejít s pravidly).

/** Globální role (R1, Q11): správce = vše; zástupce = upravuje přidělené zakázky a smí zakládat nové;
 *  sledující = jen čte přidělené zakázky. */
export const GLOBAL_ROLES = ["admin", "deputy", "viewer"] as const;
export type GlobalRole = (typeof GLOBAL_ROLES)[number];
export const GLOBAL_ROLE_LABELS: Record<GlobalRole, string> = {
  admin: "Správce",
  deputy: "Zástupce",
  viewer: "Sledující",
};

export const USER_STATUSES = ["active", "deactivated"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const PROJECT_TYPES = ["new_plant", "reconstruction", "intensification", "other"] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];
export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  new_plant: "Nová ČOV",
  reconstruction: "Rekonstrukce",
  intensification: "Intenzifikace",
  other: "Jiná",
};

export const PROJECT_STATUSES = ["preparation", "realization", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  preparation: "Příprava",
  realization: "Realizace",
  archived: "Archivováno",
};

/** Přístup k jedné zakázce: edit = úpravy, read = jen čtení. */
export const MEMBER_ACCESS = ["edit", "read"] as const;
export type MemberAccess = (typeof MEMBER_ACCESS)[number];
export const MEMBER_ACCESS_LABELS: Record<MemberAccess, string> = {
  edit: "Úpravy",
  read: "Jen čtení",
};

/** Výchozí nabídka typů událostí. Více událostí stejného typu v jedné zakázce je povoleno
 *  (např. montáž linky 1 a linky 2); každá má vlastní název a vlastní termíny. */
export const EVENT_KINDS = [
  "site_handover",
  "construction_start",
  "assembly_start",
  "trial_operation",
  "completion_handover",
  "other",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
export const EVENT_KIND_LABELS: Record<EventKind, string> = {
  site_handover: "Předání staveniště",
  construction_start: "Zahájení stavebních prací",
  assembly_start: "Zahájení montáže technologie",
  trial_operation: "Zkušební provoz / komplexní zkoušky",
  completion_handover: "Předání díla",
  other: "Jiná událost",
};

export const EVENT_STATUSES = ["active", "cancelled"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const HISTORY_ENTITY_TYPES = ["user", "project", "project_member", "event"] as const;
export type HistoryEntityType = (typeof HISTORY_ENTITY_TYPES)[number];

export const HISTORY_ACTIONS = [
  "create",
  "update",
  "archive",
  "unarchive",
  "cancel",
  "record_actual",
  "member_add",
  "member_remove",
  "member_change",
  "role_change",
] as const;
export type HistoryAction = (typeof HISTORY_ACTIONS)[number];
