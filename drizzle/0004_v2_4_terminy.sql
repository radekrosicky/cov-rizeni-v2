ALTER TABLE "material_needs" ADD COLUMN "need_event_id" uuid;--> statement-breakpoint
ALTER TABLE "material_needs" ADD COLUMN "need_offset_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "material_needs" ADD COLUMN "need_date_override" date;--> statement-breakpoint
ALTER TABLE "material_needs" ADD COLUMN "need_date_override_reason" text;--> statement-breakpoint
ALTER TABLE "material_needs" ADD COLUMN "lead_time_days" integer;--> statement-breakpoint
ALTER TABLE "material_needs" ADD COLUMN "lead_time_unit" text;--> statement-breakpoint
ALTER TABLE "material_needs" ADD COLUMN "lead_time_status" text;--> statement-breakpoint
ALTER TABLE "material_needs" ADD COLUMN "reserve_days" integer DEFAULT 14 NOT NULL;--> statement-breakpoint
ALTER TABLE "material_needs" ADD CONSTRAINT "material_needs_need_event_id_events_id_fk" FOREIGN KEY ("need_event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "material_needs_event_idx" ON "material_needs" USING btree ("need_event_id");--> statement-breakpoint
ALTER TABLE "material_needs" ADD CONSTRAINT "material_needs_offset_range" CHECK ("material_needs"."need_offset_days" between -365 and 365);--> statement-breakpoint
ALTER TABLE "material_needs" ADD CONSTRAINT "material_needs_override_has_reason" CHECK (("material_needs"."need_date_override" is null and "material_needs"."need_date_override_reason" is null)
       or ("material_needs"."need_date_override" is not null and "material_needs"."need_date_override_reason" is not null and length(btrim("material_needs"."need_date_override_reason")) > 0));--> statement-breakpoint
ALTER TABLE "material_needs" ADD CONSTRAINT "material_needs_event_or_override" CHECK ("material_needs"."need_event_id" is null or "material_needs"."need_date_override" is null);--> statement-breakpoint
ALTER TABLE "material_needs" ADD CONSTRAINT "material_needs_override_no_offset" CHECK ("material_needs"."need_date_override" is null or "material_needs"."need_offset_days" = 0);--> statement-breakpoint
ALTER TABLE "material_needs" ADD CONSTRAINT "material_needs_lead_time_complete" CHECK (("material_needs"."lead_time_days" is null and "material_needs"."lead_time_unit" is null and "material_needs"."lead_time_status" is null)
       or ("material_needs"."lead_time_days" is not null and "material_needs"."lead_time_unit" is not null and "material_needs"."lead_time_status" is not null));--> statement-breakpoint
ALTER TABLE "material_needs" ADD CONSTRAINT "material_needs_lead_time_range" CHECK ("material_needs"."lead_time_days" is null or "material_needs"."lead_time_days" between 1 and 730);--> statement-breakpoint
ALTER TABLE "material_needs" ADD CONSTRAINT "material_needs_lead_unit_valid" CHECK ("material_needs"."lead_time_unit" is null or "material_needs"."lead_time_unit" in ('calendar', 'working'));--> statement-breakpoint
ALTER TABLE "material_needs" ADD CONSTRAINT "material_needs_lead_status_valid" CHECK ("material_needs"."lead_time_status" is null or "material_needs"."lead_time_status" in ('estimate', 'confirmed'));--> statement-breakpoint
ALTER TABLE "material_needs" ADD CONSTRAINT "material_needs_reserve_range" CHECK ("material_needs"."reserve_days" between 0 and 365);--> statement-breakpoint

-- ---------- Ochrany doplněné ručně (V2-4) ----------
-- 1) Dodávka smí odkazovat jen na událost TÉŽE zakázky a při nastavení / změně odkazu ne na zrušenou událost.
--    (Pozdější zrušení události odkaz neruší – aplikace ji zobrazí jako „Událost zrušena – vyberte jinou“.)
CREATE FUNCTION material_needs_event_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_event record;
BEGIN
  IF NEW.need_event_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.need_event_id IS NOT DISTINCT FROM OLD.need_event_id AND NEW.project_id = OLD.project_id THEN
    RETURN NEW;
  END IF;
  SELECT project_id, status INTO v_event FROM events WHERE id = NEW.need_event_id;
  IF v_event.project_id IS DISTINCT FROM NEW.project_id THEN
    RAISE EXCEPTION 'Událost patří k jiné zakázce.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_event.status = 'cancelled' THEN
    RAISE EXCEPTION 'Zrušenou událost nelze vybrat jako termín potřeby.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER material_needs_event_check
  BEFORE INSERT OR UPDATE OF need_event_id, project_id ON material_needs
  FOR EACH ROW EXECUTE FUNCTION material_needs_event_guard();
