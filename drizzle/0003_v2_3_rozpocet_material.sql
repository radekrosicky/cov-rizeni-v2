CREATE TABLE "budget_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"document_revision_id" uuid NOT NULL,
	"mapping" jsonb NOT NULL,
	"currency" text,
	"vat_basis" text,
	"status" text DEFAULT 'active' NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"void_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "budget_imports_status_valid" CHECK ("budget_imports"."status" in ('active', 'voided')),
	CONSTRAINT "budget_imports_vat_valid" CHECK ("budget_imports"."vat_basis" is null or "budget_imports"."vat_basis" in ('without_vat', 'with_vat')),
	CONSTRAINT "budget_imports_currency_format" CHECK ("budget_imports"."currency" is null or "budget_imports"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "budget_imports_mapping_is_array" CHECK (jsonb_typeof("budget_imports"."mapping") = 'array' and jsonb_array_length("budget_imports"."mapping") between 1 and 50),
	CONSTRAINT "budget_imports_void_consistent" CHECK (("budget_imports"."status" = 'voided' and "budget_imports"."voided_at" is not null and "budget_imports"."voided_by" is not null
           and "budget_imports"."void_reason" is not null and length(btrim("budget_imports"."void_reason")) > 0)
       or ("budget_imports"."status" <> 'voided' and "budget_imports"."voided_at" is null and "budget_imports"."voided_by" is null and "budget_imports"."void_reason" is null)),
	CONSTRAINT "budget_imports_version_positive" CHECK ("budget_imports"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "budget_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"sheet_name" text NOT NULL,
	"row_number" integer NOT NULL,
	"raw_cells" jsonb NOT NULL,
	"detected_kind" text NOT NULL,
	"kind" text NOT NULL,
	"code" text,
	"description" text,
	"unit_raw" text,
	"unit" text,
	"quantity_raw" text,
	"quantity" numeric(18, 4),
	"quantity_status" text NOT NULL,
	"unit_price_raw" text,
	"unit_price" numeric(18, 2),
	"total_price_raw" text,
	"total_price" numeric(18, 2),
	"review_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"review_note" text,
	CONSTRAINT "budget_items_row_unique" UNIQUE("import_id","sheet_name","row_number"),
	CONSTRAINT "budget_items_row_positive" CHECK ("budget_items"."row_number" >= 1),
	CONSTRAINT "budget_items_sheet_not_blank" CHECK (length(btrim("budget_items"."sheet_name")) > 0),
	CONSTRAINT "budget_items_raw_cells_object" CHECK (jsonb_typeof("budget_items"."raw_cells") = 'object'),
	CONSTRAINT "budget_items_detected_kind_valid" CHECK ("budget_items"."detected_kind" in ('material', 'work', 'service', 'heading', 'subtotal', 'other')),
	CONSTRAINT "budget_items_kind_valid" CHECK ("budget_items"."kind" in ('material', 'work', 'service', 'heading', 'subtotal', 'other')),
	CONSTRAINT "budget_items_quantity_status_valid" CHECK ("budget_items"."quantity_status" in ('numeric', 'missing', 'non_numeric', 'ambiguous')),
	CONSTRAINT "budget_items_quantity_consistent" CHECK (("budget_items"."quantity_status" = 'numeric' and "budget_items"."quantity" is not null) or ("budget_items"."quantity_status" <> 'numeric' and "budget_items"."quantity" is null)),
	CONSTRAINT "budget_items_quantity_missing_has_no_raw" CHECK ("budget_items"."quantity_status" <> 'missing' or "budget_items"."quantity_raw" is null),
	CONSTRAINT "budget_items_review_reasons_array" CHECK (jsonb_typeof("budget_items"."review_reasons") = 'array'),
	CONSTRAINT "budget_items_review_consistent" CHECK (("budget_items"."reviewed_at" is null and "budget_items"."reviewed_by" is null) or ("budget_items"."reviewed_at" is not null and "budget_items"."reviewed_by" is not null))
);
--> statement-breakpoint
CREATE TABLE "material_need_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_need_id" uuid NOT NULL,
	"budget_item_id" uuid NOT NULL,
	"quantity_taken" numeric(18, 4),
	"over_allocation_reason" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "material_need_sources_unique" UNIQUE("material_need_id","budget_item_id"),
	CONSTRAINT "material_need_sources_quantity_positive" CHECK ("material_need_sources"."quantity_taken" is null or "material_need_sources"."quantity_taken" > 0),
	CONSTRAINT "material_need_sources_reason_not_blank" CHECK ("material_need_sources"."over_allocation_reason" is null or length(btrim("material_need_sources"."over_allocation_reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "material_needs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"tracking_reason" text NOT NULL,
	"tracking_reason_note" text,
	"planned_quantity" numeric(18, 4),
	"unit" text,
	"responsible_user_id" uuid,
	"note" text,
	"status" text DEFAULT 'to_confirm' NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by" uuid,
	"archive_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "material_needs_name_not_blank" CHECK (length(btrim("material_needs"."name")) > 0),
	CONSTRAINT "material_needs_reason_valid" CHECK ("material_needs"."tracking_reason" in ('critical_technology', 'long_lead_time', 'may_block_assembly', 'risky_supplier', 'other')),
	CONSTRAINT "material_needs_other_reason_has_note" CHECK ("material_needs"."tracking_reason" <> 'other' or ("material_needs"."tracking_reason_note" is not null and length(btrim("material_needs"."tracking_reason_note")) > 0)),
	CONSTRAINT "material_needs_planned_quantity_positive" CHECK ("material_needs"."planned_quantity" is null or "material_needs"."planned_quantity" > 0),
	CONSTRAINT "material_needs_status_valid" CHECK ("material_needs"."status" in ('to_confirm', 'archived')),
	CONSTRAINT "material_needs_archive_consistent" CHECK (("material_needs"."status" = 'archived' and "material_needs"."archived_at" is not null and "material_needs"."archived_by" is not null
           and "material_needs"."archive_reason" is not null and length(btrim("material_needs"."archive_reason")) > 0)
       or ("material_needs"."status" <> 'archived' and "material_needs"."archived_at" is null and "material_needs"."archived_by" is null and "material_needs"."archive_reason" is null)),
	CONSTRAINT "material_needs_version_positive" CHECK ("material_needs"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "history_entries" DROP CONSTRAINT "history_entity_type_valid";--> statement-breakpoint
ALTER TABLE "history_entries" DROP CONSTRAINT "history_action_valid";--> statement-breakpoint
ALTER TABLE "budget_imports" ADD CONSTRAINT "budget_imports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_imports" ADD CONSTRAINT "budget_imports_document_revision_id_document_revisions_id_fk" FOREIGN KEY ("document_revision_id") REFERENCES "public"."document_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_imports" ADD CONSTRAINT "budget_imports_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_imports" ADD CONSTRAINT "budget_imports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_imports" ADD CONSTRAINT "budget_imports_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_import_id_budget_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."budget_imports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_need_sources" ADD CONSTRAINT "material_need_sources_material_need_id_material_needs_id_fk" FOREIGN KEY ("material_need_id") REFERENCES "public"."material_needs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_need_sources" ADD CONSTRAINT "material_need_sources_budget_item_id_budget_items_id_fk" FOREIGN KEY ("budget_item_id") REFERENCES "public"."budget_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_need_sources" ADD CONSTRAINT "material_need_sources_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_needs" ADD CONSTRAINT "material_needs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_needs" ADD CONSTRAINT "material_needs_responsible_user_id_users_id_fk" FOREIGN KEY ("responsible_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_needs" ADD CONSTRAINT "material_needs_archived_by_users_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_needs" ADD CONSTRAINT "material_needs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_needs" ADD CONSTRAINT "material_needs_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budget_imports_project_idx" ON "budget_imports" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_imports_one_active_per_revision" ON "budget_imports" USING btree ("document_revision_id") WHERE "budget_imports"."status" = 'active';--> statement-breakpoint
CREATE INDEX "budget_items_import_idx" ON "budget_items" USING btree ("import_id");--> statement-breakpoint
CREATE INDEX "material_need_sources_item_idx" ON "material_need_sources" USING btree ("budget_item_id");--> statement-breakpoint
CREATE INDEX "material_needs_project_idx" ON "material_needs" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "history_entries" ADD CONSTRAINT "history_entity_type_valid" CHECK ("history_entries"."entity_type" in ('user', 'project', 'project_member', 'event', 'document', 'document_revision', 'budget_import', 'budget_item', 'material_need', 'material_need_source'));--> statement-breakpoint
ALTER TABLE "history_entries" ADD CONSTRAINT "history_action_valid" CHECK ("history_entries"."action" in ('create', 'update', 'archive', 'unarchive', 'cancel', 'record_actual', 'member_add', 'member_remove', 'member_change', 'role_change', 'upload_revision', 'set_current_revision', 'link_source', 'unlink_source', 'review'));--> statement-breakpoint
-- ===== Ruční část migrace 0003: ochrany, které nejdou vyjádřit ve schématu Drizzle =====

-- 1) Import se smí vázat jen na revizi XLSX dokumentu druhu „Rozpočty“ TÉŽE zakázky.
--    Zakázka ani revize importu se později nemění.
CREATE FUNCTION budget_imports_check_source() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_project uuid;
  v_category text;
  v_kind text;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.project_id <> OLD.project_id OR NEW.document_revision_id <> OLD.document_revision_id) THEN
    RAISE EXCEPTION 'Zakázku ani zdrojový soubor importu nelze změnit.' USING ERRCODE = 'restrict_violation';
  END IF;
  SELECT d.project_id, d.category, r.file_kind INTO v_project, v_category, v_kind
  FROM document_revisions r JOIN documents d ON d.id = r.document_id
  WHERE r.id = NEW.document_revision_id;
  IF v_project IS DISTINCT FROM NEW.project_id THEN
    RAISE EXCEPTION 'Rozpočet musí pocházet z dokumentu téže zakázky.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_category <> 'budget' THEN
    RAISE EXCEPTION 'Import je možný jen z dokumentu druhu „Rozpočty“.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_kind <> 'xlsx' THEN
    RAISE EXCEPTION 'Import je možný jen ze souboru XLSX.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER budget_imports_source
  BEFORE INSERT OR UPDATE ON budget_imports
  FOR EACH ROW EXECUTE FUNCTION budget_imports_check_source();
--> statement-breakpoint

-- 2) Import nelze zneplatnit, dokud z jeho položek vychází nějaká (nearchivovaná) dodávka –
--    existující dodávky a jejich vazby se nikdy nepřepisují automaticky.
CREATE FUNCTION budget_imports_void_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'voided' AND OLD.status <> 'voided' AND EXISTS (
    SELECT 1 FROM material_need_sources s
    JOIN budget_items i ON i.id = s.budget_item_id
    JOIN material_needs n ON n.id = s.material_need_id
    WHERE i.import_id = NEW.id AND n.status <> 'archived'
  ) THEN
    RAISE EXCEPTION 'Import nelze zneplatnit – z jeho položek vycházejí sledované dodávky.' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER budget_imports_void
  BEFORE UPDATE OF status ON budget_imports
  FOR EACH ROW EXECUTE FUNCTION budget_imports_void_guard();
--> statement-breakpoint

-- 3) Položky rozpočtu: původní a rozpoznané hodnoty jsou neměnné; měnit lze jen druh řádku
--    a vyřízení ruční kontroly. Mazat nelze. Nové položky jen do platného importu.
CREATE FUNCTION budget_items_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'Položky rozpočtu nelze mazat (% není povoleno).', TG_OP USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM budget_imports WHERE id = NEW.import_id AND status = 'active') THEN
      RAISE EXCEPTION 'Položky lze přidat jen do platného importu.' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.import_id, NEW.sheet_name, NEW.row_number, NEW.raw_cells, NEW.detected_kind, NEW.code, NEW.description,
      NEW.unit_raw, NEW.unit, NEW.quantity_raw, NEW.quantity, NEW.quantity_status, NEW.unit_price_raw, NEW.unit_price,
      NEW.total_price_raw, NEW.total_price, NEW.review_reasons)
     IS DISTINCT FROM
     (OLD.id, OLD.import_id, OLD.sheet_name, OLD.row_number, OLD.raw_cells, OLD.detected_kind, OLD.code, OLD.description,
      OLD.unit_raw, OLD.unit, OLD.quantity_raw, OLD.quantity, OLD.quantity_status, OLD.unit_price_raw, OLD.unit_price,
      OLD.total_price_raw, OLD.total_price, OLD.review_reasons) THEN
    RAISE EXCEPTION 'Původní hodnoty z rozpočtu nelze měnit (lze jen druh řádku a vyřízení kontroly).' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER budget_items_insert_update_delete
  BEFORE INSERT OR UPDATE OR DELETE ON budget_items
  FOR EACH ROW EXECUTE FUNCTION budget_items_guard();
--> statement-breakpoint
CREATE TRIGGER budget_items_no_truncate
  BEFORE TRUNCATE ON budget_items
  FOR EACH STATEMENT EXECUTE FUNCTION budget_items_guard();
--> statement-breakpoint

-- 4) Sledovaná dodávka nepatří jiné zakázce, než kde vznikla.
CREATE FUNCTION material_needs_project_fixed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.project_id <> OLD.project_id THEN
    RAISE EXCEPTION 'Dodávku nelze přesunout do jiné zakázky.' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER material_needs_project_immutable
  BEFORE UPDATE OF project_id ON material_needs
  FOR EACH ROW EXECUTE FUNCTION material_needs_project_fixed();
--> statement-breakpoint

-- 5) Zdroje dodávky (vazba na položku rozpočtu):
--    - položka i dodávka patří TÉŽE zakázce; import je platný; dodávka není archivovaná;
--    - nadpis ani mezisoučet nelze sledovat;
--    - u položky s číselným množstvím se převzaté množství zadává; u nečíselného / chybějícího / nejednoznačného ne;
--    - součet převzatých množství přes nearchivované dodávky smí překročit množství položky JEN s důvodem;
--    - dodávku ani položku vazby nelze přepojit (jen odebrat a přidat znovu – s historií).
CREATE FUNCTION material_need_sources_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_need_project uuid;
  v_need_status text;
  v_item record;
  v_sum numeric;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.material_need_id <> OLD.material_need_id OR NEW.budget_item_id <> OLD.budget_item_id) THEN
    RAISE EXCEPTION 'Vazbu nelze přepojit – odeberte ji a přidejte novou.' USING ERRCODE = 'restrict_violation';
  END IF;
  SELECT project_id, status INTO v_need_project, v_need_status FROM material_needs WHERE id = NEW.material_need_id;
  SELECT i.kind, i.quantity, i.quantity_status, b.project_id, b.status AS import_status INTO v_item
  FROM budget_items i JOIN budget_imports b ON b.id = i.import_id WHERE i.id = NEW.budget_item_id;
  IF v_need_status = 'archived' THEN
    RAISE EXCEPTION 'Archivovanou dodávku nelze měnit.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_item.project_id IS DISTINCT FROM v_need_project THEN
    RAISE EXCEPTION 'Položka rozpočtu a dodávka musí patřit téže zakázce.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_item.import_status <> 'active' THEN
    RAISE EXCEPTION 'Položka pochází ze zneplatněného importu.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_item.kind IN ('heading', 'subtotal') THEN
    RAISE EXCEPTION 'Nadpis ani mezisoučet nelze sledovat jako dodávku.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_item.quantity_status = 'numeric' AND NEW.quantity_taken IS NULL THEN
    RAISE EXCEPTION 'U položky s číselným množstvím zadejte převzaté množství.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_item.quantity_status <> 'numeric' AND NEW.quantity_taken IS NOT NULL THEN
    RAISE EXCEPTION 'Položka nemá jednoznačné číselné množství – převzaté množství nelze určit.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_item.quantity_status = 'numeric' THEN
    -- Zámek položky po dobu transakce: dvě souběžná přidání nemohou obě projít kontrolou součtu.
    PERFORM pg_advisory_xact_lock(hashtext('budget_item:' || NEW.budget_item_id::text));
    SELECT coalesce(sum(s.quantity_taken), 0) INTO v_sum
    FROM material_need_sources s JOIN material_needs n ON n.id = s.material_need_id
    WHERE s.budget_item_id = NEW.budget_item_id AND n.status <> 'archived' AND s.id <> NEW.id;
    IF v_sum + NEW.quantity_taken > v_item.quantity AND NEW.over_allocation_reason IS NULL THEN
      RAISE EXCEPTION 'Převzaté množství (%) překračuje množství v rozpočtu (%). Uveďte důvod.', v_sum + NEW.quantity_taken, v_item.quantity
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER material_need_sources_check
  BEFORE INSERT OR UPDATE ON material_need_sources
  FOR EACH ROW EXECUTE FUNCTION material_need_sources_guard();
--> statement-breakpoint

-- 6) Obnovení archivované dodávky nesmí potichu překročit množství z rozpočtu
--    (archivované dodávky se do součtu nepočítají; po obnovení se znovu počítají).
CREATE FUNCTION material_needs_unarchive_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_src record;
  v_sum numeric;
BEGIN
  IF OLD.status = 'archived' AND NEW.status <> 'archived' THEN
    FOR v_src IN
      SELECT s.id, s.budget_item_id, s.quantity_taken, s.over_allocation_reason, i.quantity
      FROM material_need_sources s JOIN budget_items i ON i.id = s.budget_item_id
      WHERE s.material_need_id = NEW.id AND i.quantity_status = 'numeric'
    LOOP
      PERFORM pg_advisory_xact_lock(hashtext('budget_item:' || v_src.budget_item_id::text));
      SELECT coalesce(sum(s.quantity_taken), 0) INTO v_sum
      FROM material_need_sources s JOIN material_needs n ON n.id = s.material_need_id
      WHERE s.budget_item_id = v_src.budget_item_id AND n.status <> 'archived' AND n.id <> NEW.id;
      IF v_sum + v_src.quantity_taken > v_src.quantity AND v_src.over_allocation_reason IS NULL THEN
        RAISE EXCEPTION 'Obnovením by převzaté množství překročilo množství v rozpočtu. Upravte množství nebo uveďte důvod.'
          USING ERRCODE = 'check_violation';
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER material_needs_unarchive
  BEFORE UPDATE OF status ON material_needs
  FOR EACH ROW EXECUTE FUNCTION material_needs_unarchive_guard();
