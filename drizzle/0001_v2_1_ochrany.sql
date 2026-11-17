-- Ruční část migrace V2-1: ochrany, které nejdou vyjádřit ve schématu Drizzle.

-- 1) Historie změn je jen pro přidávání (Q7, Q9): žádná úprava, smazání ani vyprázdnění.
CREATE FUNCTION history_entries_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Historie změn je jen pro přidávání (% není povoleno).', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER history_entries_no_update_delete
  BEFORE UPDATE OR DELETE ON history_entries
  FOR EACH ROW EXECUTE FUNCTION history_entries_append_only();
--> statement-breakpoint
CREATE TRIGGER history_entries_no_truncate
  BEFORE TRUNCATE ON history_entries
  FOR EACH STATEMENT EXECUTE FUNCTION history_entries_append_only();
--> statement-breakpoint

-- 2) Vedoucí zakázky je vždy jejím členem s přístupem „edit“ (rozhodnutí k plánu V2-1, bod 4).
--    Kontrola je odložená na konec transakce, aby šlo zakázku a členství založit v jedné transakci.
CREATE FUNCTION assert_project_leader_is_editor(p_project_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_leader uuid;
BEGIN
  SELECT leader_user_id INTO v_leader FROM projects WHERE id = p_project_id;
  IF v_leader IS NULL THEN
    RETURN; -- zakázka neexistuje (nemůže nastat při ON DELETE RESTRICT)
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id AND user_id = v_leader AND access = 'edit'
  ) THEN
    RAISE EXCEPTION 'Vedoucí zakázky musí být jejím členem s přístupem pro úpravy.'
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION projects_leader_check() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM assert_project_leader_is_editor(NEW.id);
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER projects_leader_is_editor
  AFTER INSERT OR UPDATE OF leader_user_id ON projects
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION projects_leader_check();
--> statement-breakpoint
CREATE FUNCTION project_members_leader_check() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM assert_project_leader_is_editor(OLD.project_id);
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER project_members_keep_leader
  AFTER UPDATE OR DELETE ON project_members
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION project_members_leader_check();
