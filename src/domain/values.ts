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

export const HISTORY_ENTITY_TYPES = [
  "user",
  "project",
  "project_member",
  "event",
  "document",
  "document_revision",
  "budget_import",
  "budget_item",
  "material_need",
  "material_need_source",
] as const;
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
  "upload_revision",
  "set_current_revision",
  "link_source",
  "unlink_source",
  "review",
] as const;
export type HistoryAction = (typeof HISTORY_ACTIONS)[number];

// ---------- Dokumenty (V2-2) ----------

/** Druhy dokumentů (Master zadání 5.7). Dodatek smlouvy = samostatný dokument druhu „contract“. */
export const DOCUMENT_CATEGORIES = [
  "contract",
  "budget",
  "design",
  "site_meeting",
  "diary_export",
  "protocol",
  "photo",
  "other",
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];
export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  contract: "Smlouvy a dodatky",
  budget: "Rozpočty",
  design: "Projektová dokumentace a výkresy",
  site_meeting: "Zápisy z kontrolních dnů",
  diary_export: "Export stavebního deníku",
  protocol: "Protokoly a revize",
  photo: "Fotografie",
  other: "Ostatní",
};

export const DOCUMENT_STATUSES = ["active", "archived"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

/** Povolené druhy souborů – seznam povolených (ne zakázaných). Typ se ověřuje podle OBSAHU souboru.
 *  ZIP a jiné archivy nejsou povolené (schváleno k plánu V2-2). */
export const FILE_KINDS = ["pdf", "xlsx", "docx", "jpeg", "png", "webp", "heic", "tiff", "dwg", "dxf"] as const;
export type FileKind = (typeof FILE_KINDS)[number];

// ---------- Rozpočet a sledovaný materiál (V2-3) ----------

/** Import rozpočtu: platný, nebo zneplatněný s důvodem. „Nahrazen novější revizí“ se odvozuje, neukládá. */
export const BUDGET_IMPORT_STATUSES = ["active", "voided"] as const;
export type BudgetImportStatus = (typeof BUDGET_IMPORT_STATUSES)[number];

/** Druh řádku rozpočtu. Ne každý řádek je materiál k objednání. */
export const BUDGET_ROW_KINDS = ["material", "work", "service", "heading", "subtotal", "other"] as const;
export type BudgetRowKind = (typeof BUDGET_ROW_KINDS)[number];
export const BUDGET_ROW_KIND_LABELS: Record<BudgetRowKind, string> = {
  material: "Materiál / technologie",
  work: "Práce",
  service: "Služba",
  heading: "Nadpis",
  subtotal: "Mezisoučet",
  other: "Ostatní",
};

/** Stav množství z rozpočtu – nic se nevymýšlí. */
export const QUANTITY_STATUSES = ["numeric", "missing", "non_numeric", "ambiguous"] as const;
export type QuantityStatus = (typeof QUANTITY_STATUSES)[number];
export const QUANTITY_STATUS_LABELS: Record<QuantityStatus, string> = {
  numeric: "Číslo",
  missing: "Chybí",
  non_numeric: "Není číslo",
  ambiguous: "Nejednoznačné",
};

/** Ceny v rozpočtu: s DPH / bez DPH; neznámé = prázdné (nevymýšlí se). */
export const VAT_BASES = ["without_vat", "with_vat"] as const;
export type VatBasis = (typeof VAT_BASES)[number];

/** Důvod sledování dodávky (schváleno k plánu V2-3) – vždy lze doplnit vlastní text. Cena NENÍ důvodem. */
export const TRACKING_REASONS = ["critical_technology", "long_lead_time", "may_block_assembly", "risky_supplier", "other"] as const;
export type TrackingReason = (typeof TRACKING_REASONS)[number];
export const TRACKING_REASON_LABELS: Record<TrackingReason, string> = {
  critical_technology: "Kritická technologie",
  long_lead_time: "Dlouhá dodací lhůta",
  may_block_assembly: "Může zastavit montáž",
  risky_supplier: "Rizikový dodavatel",
  other: "Jiný důvod",
};

/** Stav sledované dodávky. „K potvrzení“ / archivováno; stavy objednáno → dodáno přidá etapa evidence objednávek. */
export const MATERIAL_NEED_STATUSES = ["to_confirm", "archived"] as const;
export type MaterialNeedStatus = (typeof MATERIAL_NEED_STATUSES)[number];

// ---------- Termíny potřeby a doporučené objednání (V2-4) ----------

/** Dodací lhůta v kalendářních, nebo pracovních dnech (bez víkendů a českých svátků). */
export const LEAD_TIME_UNITS = ["calendar", "working"] as const;
export type LeadTimeUnit = (typeof LEAD_TIME_UNITS)[number];
export const LEAD_TIME_UNIT_LABELS: Record<LeadTimeUnit, string> = { calendar: "kalendářních dní", working: "pracovních dní" };

/** Stav dodací lhůty. Neznámá lhůta se neukládá jako hodnota (prázdné) – žádný vymyšlený termín. */
export const LEAD_TIME_STATUSES = ["estimate", "confirmed"] as const;
export type LeadTimeStatus = (typeof LEAD_TIME_STATUSES)[number];
export const LEAD_TIME_STATUS_LABELS: Record<LeadTimeStatus, string> = { estimate: "odhad – ověřit", confirmed: "potvrzeno dodavatelem" };

/** Výchozí bezpečnostní rezerva před potřebou materiálu (R4) – KALENDÁŘNÍ dny, u dodávky upravitelná. */
export const DEFAULT_RESERVE_DAYS = 14;
/** Hranice upozornění „blíží se“ před DOPORUČENÝM TERMÍNEM OBJEDNÁNÍ – jiný údaj než rezerva. */
export const ORDER_SOON_DAYS = 14;
