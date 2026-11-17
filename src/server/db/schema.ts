// Databázové schéma etapy V2-1: uživatelé, zakázky, členství, události/milníky, historie.
// Zásady (Master zadání v1.0, rozhodnutí Q1–Q12, docs/PLAN-V2-1.md):
//  - Termíny zakázky existují JEN v tabulce events (hlídá test src/server/db/schema.guard.test.ts).
//  - Každá událost má vlastní id a vlastní smluvní / plánované / skutečné datum (všechna nepovinná).
//    Více událostí stejného typu v jedné zakázce je povoleno (např. montáž linky 1 a linky 2).
//  - Stavové hodnoty jsou text + CHECK (snadnější rozšíření než výčtové typy PostgreSQL).
//  - Upravitelné tabulky mají `version` pro ochranu před tichým přepsáním (Q8).
//  - history_entries je jen pro přidávání; UPDATE/DELETE odmítne databázový trigger (ruční část migrace).
//  - Fyzické mazání je omezené (ON DELETE RESTRICT); archivace / zrušení vždy s důvodem (Q9).
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  unique,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_STATUSES,
  EVENT_KINDS,
  FILE_KINDS,
  EVENT_STATUSES,
  GLOBAL_ROLES,
  HISTORY_ACTIONS,
  HISTORY_ENTITY_TYPES,
  MEMBER_ACCESS,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  USER_STATUSES,
} from "../../domain/values.ts";

const inList = (column: AnyPgColumn, values: readonly string[]) =>
  sql`${column} in (${sql.join(
    values.map((v) => sql.raw(`'${v.replace(/'/g, "''")}'`)),
    sql`, `,
  )})`;

const notBlank = (column: AnyPgColumn) => sql`length(btrim(${column})) > 0`;

// Časové údaje záznamu (metadata). Názvy končí na `_at` – nejsou to obchodní termíny.
const stampedAt = (name: string) => timestamp(name, { withTimezone: true, mode: "date" }).notNull().defaultNow();

// ---------- users ----------

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    /** Nejmenší oprávnění jako výchozí (sledující). */
    globalRole: text("global_role", { enum: GLOBAL_ROLES }).notNull().default("viewer"),
    /** Fiktivní vývojová identita – v produkčním režimu se s ní nelze přihlásit. */
    isDevIdentity: boolean("is_dev_identity").notNull().default(false),
    status: text("status", { enum: USER_STATUSES }).notNull().default("active"),
    version: integer("version").notNull().default(1),
    createdAt: stampedAt("created_at"),
    // První uživatel (správce ze seedu) nemá tvůrce, proto nepovinné.
    createdBy: uuid("created_by").references((): AnyPgColumn => users.id, { onDelete: "restrict" }),
    updatedAt: stampedAt("updated_at"),
    updatedBy: uuid("updated_by").references((): AnyPgColumn => users.id, { onDelete: "restrict" }),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(t.email),
    check("users_email_lowercase", sql`${t.email} = lower(${t.email}) and position('@' in ${t.email}) > 1`),
    check("users_display_name_not_blank", notBlank(t.displayName)),
    check("users_global_role_valid", inList(t.globalRole, GLOBAL_ROLES)),
    check("users_status_valid", inList(t.status, USER_STATUSES)),
    check("users_version_positive", sql`${t.version} >= 1`),
  ],
);

// ---------- projects (zakázky) ----------
// ZÁMĚRNĚ bez sloupců s termíny – všechny termíny jsou v events.

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    projectType: text("project_type", { enum: PROJECT_TYPES }).notNull(),
    /** Upřesnění u typu „jiná“ */
    projectTypeNote: text("project_type_note"),
    leaderUserId: uuid("leader_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    clientName: text("client_name"),
    status: text("status", { enum: PROJECT_STATUSES }).notNull().default("preparation"),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
    archivedBy: uuid("archived_by").references(() => users.id, { onDelete: "restrict" }),
    archiveReason: text("archive_reason"),
    version: integer("version").notNull().default(1),
    createdAt: stampedAt("created_at"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    updatedAt: stampedAt("updated_at"),
    updatedBy: uuid("updated_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("projects_leader_idx").on(t.leaderUserId),
    check("projects_name_not_blank", notBlank(t.name)),
    check("projects_type_valid", inList(t.projectType, PROJECT_TYPES)),
    check(
      "projects_other_type_has_note",
      sql`${t.projectType} <> 'other' or (${t.projectTypeNote} is not null and length(btrim(${t.projectTypeNote})) > 0)`,
    ),
    check("projects_status_valid", inList(t.status, PROJECT_STATUSES)),
    // Archivace = vždy kdo, kdy a proč; mimo archiv tyto údaje prázdné (historie zůstává v history_entries).
    check(
      "projects_archive_consistent",
      sql`(${t.status} = 'archived' and ${t.archivedAt} is not null and ${t.archivedBy} is not null
           and ${t.archiveReason} is not null and length(btrim(${t.archiveReason})) > 0)
       or (${t.status} <> 'archived' and ${t.archivedAt} is null and ${t.archivedBy} is null and ${t.archiveReason} is null)`,
    ),
    check("projects_version_positive", sql`${t.version} >= 1`),
  ],
);

// ---------- project_members ----------

export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** edit = úpravy, read = jen čtení. Skutečný přístup omezuje i globální role (sledující nikdy neupravuje). */
    access: text("access", { enum: MEMBER_ACCESS }).notNull(),
    addedAt: stampedAt("added_at"),
    addedBy: uuid("added_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
  },
  (t) => [
    primaryKey({ name: "project_members_pk", columns: [t.projectId, t.userId] }),
    index("project_members_user_idx").on(t.userId),
    check("project_members_access_valid", inList(t.access, MEMBER_ACCESS)),
  ],
);

// ---------- events (události a milníky) ----------
// Jediné místo pro termíny zakázky. Budoucí materiál a připravenost odkazují na events.id.

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    /** Výchozí typ z nabídky; více událostí stejného typu v zakázce je povoleno. */
    kind: text("kind", { enum: EVENT_KINDS }).notNull(),
    /** Vlastní název (např. „Zahájení montáže technologie – linka 2“). */
    title: text("title").notNull(),
    /** Milník = příznak na události, ne její kopie. */
    isMilestone: boolean("is_milestone").notNull().default(false),
    /** Smluvní termín – nepovinné, pokud zatím není znám. */
    contractDate: date("contract_date", { mode: "string" }),
    /** Interní plán – nepovinné. */
    plannedDate: date("planned_date", { mode: "string" }),
    /** Skutečně nastalo – nepovinné; zapisuje člověk. */
    actualDate: date("actual_date", { mode: "string" }),
    actualRecordedAt: timestamp("actual_recorded_at", { withTimezone: true, mode: "date" }),
    actualRecordedBy: uuid("actual_recorded_by").references(() => users.id, { onDelete: "restrict" }),
    note: text("note"),
    status: text("status", { enum: EVENT_STATUSES }).notNull().default("active"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: "date" }),
    cancelledBy: uuid("cancelled_by").references(() => users.id, { onDelete: "restrict" }),
    cancelReason: text("cancel_reason"),
    version: integer("version").notNull().default(1),
    createdAt: stampedAt("created_at"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    updatedAt: stampedAt("updated_at"),
    updatedBy: uuid("updated_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("events_project_idx").on(t.projectId),
    check("events_kind_valid", inList(t.kind, EVENT_KINDS)),
    check("events_title_not_blank", notBlank(t.title)),
    check("events_status_valid", inList(t.status, EVENT_STATUSES)),
    // Skutečné datum vždy s tím, kdo a kdy ho zapsal.
    check(
      "events_actual_recorded",
      sql`(${t.actualDate} is null and ${t.actualRecordedAt} is null and ${t.actualRecordedBy} is null)
       or (${t.actualDate} is not null and ${t.actualRecordedAt} is not null and ${t.actualRecordedBy} is not null)`,
    ),
    // Zrušení vždy kdo, kdy a proč.
    check(
      "events_cancel_consistent",
      sql`(${t.status} = 'cancelled' and ${t.cancelledAt} is not null and ${t.cancelledBy} is not null
           and ${t.cancelReason} is not null and length(btrim(${t.cancelReason})) > 0)
       or (${t.status} <> 'cancelled' and ${t.cancelledAt} is null and ${t.cancelledBy} is null and ${t.cancelReason} is null)`,
    ),
    check("events_version_positive", sql`${t.version} >= 1`),
  ],
);

// ---------- history_entries (historie změn – jen přidávání) ----------

export const historyEntries = pgTable(
  "history_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    at: stampedAt("at"),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** Podle zakázky se řídí, kdo historii smí číst (Q7). */
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "restrict" }),
    entityType: text("entity_type", { enum: HISTORY_ENTITY_TYPES }).notNull(),
    /** Id záznamu; u členství „<project_id>:<user_id>“. */
    entityId: text("entity_id").notNull(),
    action: text("action", { enum: HISTORY_ACTIONS }).notNull(),
    /** { pole: { before, after } } */
    changes: jsonb("changes").$type<Record<string, { before: unknown; after: unknown }>>().notNull().default({}),
    reason: text("reason"),
  },
  (t) => [
    index("history_project_at_idx").on(t.projectId, t.at),
    index("history_entity_idx").on(t.entityType, t.entityId),
    check("history_entity_type_valid", inList(t.entityType, HISTORY_ENTITY_TYPES)),
    check("history_action_valid", inList(t.action, HISTORY_ACTIONS)),
    check("history_reason_not_blank", sql`${t.reason} is null or length(btrim(${t.reason})) > 0`),
  ],
);

// ---------- documents (dokumenty zakázky, V2-2) ----------
// Dokument = logická věc (např. „D.1.3 Technologie – dispozice“); soubory jsou v document_revisions.
// Aktuální revize = JEDINÝ ukazatel current_revision_id; „nahrazeno“ se odvozuje (revize ≠ aktuální).

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    category: text("category", { enum: DOCUMENT_CATEGORIES }).notNull(),
    title: text("title").notNull(),
    note: text("note"),
    /** Aktuální revize; musí patřit témuž dokumentu (složený cizí klíč níže). Prázdná jen uvnitř transakce založení. */
    currentRevisionId: uuid("current_revision_id"),
    status: text("status", { enum: DOCUMENT_STATUSES }).notNull().default("active"),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
    archivedBy: uuid("archived_by").references(() => users.id, { onDelete: "restrict" }),
    archiveReason: text("archive_reason"),
    version: integer("version").notNull().default(1),
    createdAt: stampedAt("created_at"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    updatedAt: stampedAt("updated_at"),
    updatedBy: uuid("updated_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("documents_project_category_idx").on(t.projectId, t.category),
    // Aktuální revize musí patřit TÉMUŽ dokumentu – nelze ukázat na revizi cizího dokumentu.
    foreignKey({
      name: "documents_current_revision_same_document_fk",
      columns: [t.id, t.currentRevisionId],
      foreignColumns: [documentRevisions.documentId, documentRevisions.id],
    }).onDelete("restrict"),
    check("documents_category_valid", inList(t.category, DOCUMENT_CATEGORIES)),
    check("documents_title_not_blank", notBlank(t.title)),
    check("documents_status_valid", inList(t.status, DOCUMENT_STATUSES)),
    check(
      "documents_archive_consistent",
      sql`(${t.status} = 'archived' and ${t.archivedAt} is not null and ${t.archivedBy} is not null
           and ${t.archiveReason} is not null and length(btrim(${t.archiveReason})) > 0)
       or (${t.status} <> 'archived' and ${t.archivedAt} is null and ${t.archivedBy} is null and ${t.archiveReason} is null)`,
    ),
    check("documents_version_positive", sql`${t.version} >= 1`),
  ],
);

// ---------- document_revisions (revize = konkrétní nahraný soubor) ----------
// Neměnné: úpravu ani smazání odmítne databázový trigger (ruční část migrace 0002).
// Soubor leží v úložišti (FileStorage) pod klíčem, který generuje server – nikdy jméno od uživatele.

export const documentRevisions = pgTable(
  "document_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references((): AnyPgColumn => documents.id, { onDelete: "restrict" }),
    /** Pořadové číslo 1, 2, 3… v rámci dokumentu. */
    revisionNo: integer("revision_no").notNull(),
    /** Nepovinné vlastní označení („C“, „Rev. 2“). */
    revisionLabel: text("revision_label"),
    /** Datum dokumentu (např. podpisu, vydání výkresu) – samostatný údaj dokumentu, ne termín události. */
    documentDate: date("document_date", { mode: "string" }),
    /** Původní název souboru – jen pro zobrazení a stažení. */
    originalFilename: text("original_filename").notNull(),
    /** Druh souboru zjištěný z OBSAHU (ne z přípony ani z údaje prohlížeče). */
    fileKind: text("file_kind", { enum: FILE_KINDS }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    /** Otisk SHA-256 (64 hex znaků) – kontrola celistvosti. */
    sha256: text("sha256").notNull(),
    /** Klíč v úložišti; jedinečný → existující soubor nelze přepsat jinou revizí. */
    storageKey: text("storage_key").notNull(),
    note: text("note"),
    uploadedAt: stampedAt("uploaded_at"),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
  },
  (t) => [
    unique("document_revisions_document_id_id_unique").on(t.documentId, t.id),
    unique("document_revisions_no_unique").on(t.documentId, t.revisionNo),
    uniqueIndex("document_revisions_storage_key_unique").on(t.storageKey),
    check("document_revisions_no_positive", sql`${t.revisionNo} >= 1`),
    check("document_revisions_label_not_blank", sql`${t.revisionLabel} is null or length(btrim(${t.revisionLabel})) > 0`),
    check(
      "document_revisions_filename_valid",
      // 1–255 znaků, bez lomítka, zpětného lomítka (chr 92) a řídicích znaků – název nesmí vypadat jako cesta.
      sql`length(btrim(${t.originalFilename})) between 1 and 255 and strpos(${t.originalFilename}, '/') = 0
          and strpos(${t.originalFilename}, chr(92)) = 0 and ${t.originalFilename} !~ '[[:cntrl:]]'`,
    ),
    check("document_revisions_file_kind_valid", inList(t.fileKind, FILE_KINDS)),
    // Horní mez je jen pojistka databáze; skutečný limit (výchozí 50 MB) je nastavitelný v aplikaci.
    check("document_revisions_size_valid", sql`${t.sizeBytes} > 0 and ${t.sizeBytes} <= 1073741824`),
    check("document_revisions_sha256_format", sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
    // Klíč bez „..“, bez lomítka na začátku a jen z bezpečných znaků.
    check("document_revisions_storage_key_safe", sql`${t.storageKey} ~ '^[a-z0-9][a-z0-9/_-]*$' and position('..' in ${t.storageKey}) = 0`),
  ],
);

export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type ProjectMember = typeof projectMembers.$inferSelect;
export type ProjectEvent = typeof events.$inferSelect;
export type HistoryEntry = typeof historyEntries.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type DocumentRevision = typeof documentRevisions.$inferSelect;
