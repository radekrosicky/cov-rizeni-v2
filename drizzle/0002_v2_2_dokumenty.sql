CREATE TABLE "document_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"revision_no" integer NOT NULL,
	"revision_label" text,
	"document_date" date,
	"original_filename" text NOT NULL,
	"file_kind" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	"note" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uploaded_by" uuid NOT NULL,
	CONSTRAINT "document_revisions_document_id_id_unique" UNIQUE("document_id","id"),
	CONSTRAINT "document_revisions_no_unique" UNIQUE("document_id","revision_no"),
	CONSTRAINT "document_revisions_no_positive" CHECK ("document_revisions"."revision_no" >= 1),
	CONSTRAINT "document_revisions_label_not_blank" CHECK ("document_revisions"."revision_label" is null or length(btrim("document_revisions"."revision_label")) > 0),
	CONSTRAINT "document_revisions_filename_valid" CHECK (length(btrim("document_revisions"."original_filename")) between 1 and 255 and strpos("document_revisions"."original_filename", '/') = 0
          and strpos("document_revisions"."original_filename", chr(92)) = 0 and "document_revisions"."original_filename" !~ '[[:cntrl:]]'),
	CONSTRAINT "document_revisions_file_kind_valid" CHECK ("document_revisions"."file_kind" in ('pdf', 'xlsx', 'docx', 'jpeg', 'png', 'webp', 'heic', 'tiff', 'dwg', 'dxf')),
	CONSTRAINT "document_revisions_size_valid" CHECK ("document_revisions"."size_bytes" > 0 and "document_revisions"."size_bytes" <= 1073741824),
	CONSTRAINT "document_revisions_sha256_format" CHECK ("document_revisions"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "document_revisions_storage_key_safe" CHECK ("document_revisions"."storage_key" ~ '^[a-z0-9][a-z0-9/_-]*$' and position('..' in "document_revisions"."storage_key") = 0)
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"note" text,
	"current_revision_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by" uuid,
	"archive_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "documents_category_valid" CHECK ("documents"."category" in ('contract', 'budget', 'design', 'site_meeting', 'diary_export', 'protocol', 'photo', 'other')),
	CONSTRAINT "documents_title_not_blank" CHECK (length(btrim("documents"."title")) > 0),
	CONSTRAINT "documents_status_valid" CHECK ("documents"."status" in ('active', 'archived')),
	CONSTRAINT "documents_archive_consistent" CHECK (("documents"."status" = 'archived' and "documents"."archived_at" is not null and "documents"."archived_by" is not null
           and "documents"."archive_reason" is not null and length(btrim("documents"."archive_reason")) > 0)
       or ("documents"."status" <> 'archived' and "documents"."archived_at" is null and "documents"."archived_by" is null and "documents"."archive_reason" is null)),
	CONSTRAINT "documents_version_positive" CHECK ("documents"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "history_entries" DROP CONSTRAINT "history_entity_type_valid";--> statement-breakpoint
ALTER TABLE "history_entries" DROP CONSTRAINT "history_action_valid";--> statement-breakpoint
ALTER TABLE "document_revisions" ADD CONSTRAINT "document_revisions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_revisions" ADD CONSTRAINT "document_revisions_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_archived_by_users_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_current_revision_same_document_fk" FOREIGN KEY ("id","current_revision_id") REFERENCES "public"."document_revisions"("document_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_revisions_storage_key_unique" ON "document_revisions" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "documents_project_category_idx" ON "documents" USING btree ("project_id","category");--> statement-breakpoint
ALTER TABLE "history_entries" ADD CONSTRAINT "history_entity_type_valid" CHECK ("history_entries"."entity_type" in ('user', 'project', 'project_member', 'event', 'document', 'document_revision'));--> statement-breakpoint
ALTER TABLE "history_entries" ADD CONSTRAINT "history_action_valid" CHECK ("history_entries"."action" in ('create', 'update', 'archive', 'unarchive', 'cancel', 'record_actual', 'member_add', 'member_remove', 'member_change', 'role_change', 'upload_revision', 'set_current_revision'));--> statement-breakpoint
-- ===== Ruční část migrace 0002: ochrany, které nejdou vyjádřit ve schématu Drizzle =====

-- 1) Revize je neměnná: stará revize vždy zůstane dostupná a nepřepíše se (ani přes databázi).
CREATE FUNCTION document_revisions_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Revize dokumentu je neměnná (% není povoleno). Nahrajte novou revizi.', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER document_revisions_no_update_delete
  BEFORE UPDATE OR DELETE ON document_revisions
  FOR EACH ROW EXECUTE FUNCTION document_revisions_immutable();
--> statement-breakpoint
CREATE TRIGGER document_revisions_no_truncate
  BEFORE TRUNCATE ON document_revisions
  FOR EACH STATEMENT EXECUTE FUNCTION document_revisions_immutable();
--> statement-breakpoint

-- 2) Každý dokument má na konci transakce jednoznačně určenou aktuální revizi.
--    (Že patří témuž dokumentu, hlídá složený cizí klíč documents_current_revision_same_document_fk.)
CREATE FUNCTION documents_current_revision_check() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM documents WHERE id = NEW.id AND current_revision_id IS NULL) THEN
    RAISE EXCEPTION 'Dokument musí mít aktuální revizi (nahraný soubor).'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER documents_has_current_revision
  AFTER INSERT OR UPDATE OF current_revision_id ON documents
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION documents_current_revision_check();
--> statement-breakpoint

-- 3) Dokument nelze přesunout do jiné zakázky (oprávnění i klíče souborů se řídí zakázkou).
CREATE FUNCTION documents_project_fixed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.project_id <> OLD.project_id THEN
    RAISE EXCEPTION 'Dokument nelze přesunout do jiné zakázky.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER documents_project_immutable
  BEFORE UPDATE OF project_id ON documents
  FOR EACH ROW EXECUTE FUNCTION documents_project_fixed();
