CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"is_milestone" boolean DEFAULT false NOT NULL,
	"contract_date" date,
	"planned_date" date,
	"actual_date" date,
	"actual_recorded_at" timestamp with time zone,
	"actual_recorded_by" uuid,
	"note" text,
	"status" text DEFAULT 'active' NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancel_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "events_kind_valid" CHECK ("events"."kind" in ('site_handover', 'construction_start', 'assembly_start', 'trial_operation', 'completion_handover', 'other')),
	CONSTRAINT "events_title_not_blank" CHECK (length(btrim("events"."title")) > 0),
	CONSTRAINT "events_status_valid" CHECK ("events"."status" in ('active', 'cancelled')),
	CONSTRAINT "events_actual_recorded" CHECK (("events"."actual_date" is null and "events"."actual_recorded_at" is null and "events"."actual_recorded_by" is null)
       or ("events"."actual_date" is not null and "events"."actual_recorded_at" is not null and "events"."actual_recorded_by" is not null)),
	CONSTRAINT "events_cancel_consistent" CHECK (("events"."status" = 'cancelled' and "events"."cancelled_at" is not null and "events"."cancelled_by" is not null
           and "events"."cancel_reason" is not null and length(btrim("events"."cancel_reason")) > 0)
       or ("events"."status" <> 'cancelled' and "events"."cancelled_at" is null and "events"."cancelled_by" is null and "events"."cancel_reason" is null)),
	CONSTRAINT "events_version_positive" CHECK ("events"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "history_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"project_id" uuid,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"changes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reason" text,
	CONSTRAINT "history_entity_type_valid" CHECK ("history_entries"."entity_type" in ('user', 'project', 'project_member', 'event')),
	CONSTRAINT "history_action_valid" CHECK ("history_entries"."action" in ('create', 'update', 'archive', 'unarchive', 'cancel', 'record_actual', 'member_add', 'member_remove', 'member_change', 'role_change')),
	CONSTRAINT "history_reason_not_blank" CHECK ("history_entries"."reason" is null or length(btrim("history_entries"."reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"access" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"added_by" uuid NOT NULL,
	CONSTRAINT "project_members_pk" PRIMARY KEY("project_id","user_id"),
	CONSTRAINT "project_members_access_valid" CHECK ("project_members"."access" in ('edit', 'read'))
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"project_type" text NOT NULL,
	"project_type_note" text,
	"leader_user_id" uuid NOT NULL,
	"client_name" text,
	"status" text DEFAULT 'preparation' NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by" uuid,
	"archive_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "projects_name_not_blank" CHECK (length(btrim("projects"."name")) > 0),
	CONSTRAINT "projects_type_valid" CHECK ("projects"."project_type" in ('new_plant', 'reconstruction', 'intensification', 'other')),
	CONSTRAINT "projects_other_type_has_note" CHECK ("projects"."project_type" <> 'other' or ("projects"."project_type_note" is not null and length(btrim("projects"."project_type_note")) > 0)),
	CONSTRAINT "projects_status_valid" CHECK ("projects"."status" in ('preparation', 'realization', 'archived')),
	CONSTRAINT "projects_archive_consistent" CHECK (("projects"."status" = 'archived' and "projects"."archived_at" is not null and "projects"."archived_by" is not null
           and "projects"."archive_reason" is not null and length(btrim("projects"."archive_reason")) > 0)
       or ("projects"."status" <> 'archived' and "projects"."archived_at" is null and "projects"."archived_by" is null and "projects"."archive_reason" is null)),
	CONSTRAINT "projects_version_positive" CHECK ("projects"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"global_role" text DEFAULT 'viewer' NOT NULL,
	"is_dev_identity" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "users_email_lowercase" CHECK ("users"."email" = lower("users"."email") and position('@' in "users"."email") > 1),
	CONSTRAINT "users_display_name_not_blank" CHECK (length(btrim("users"."display_name")) > 0),
	CONSTRAINT "users_global_role_valid" CHECK ("users"."global_role" in ('admin', 'deputy', 'viewer')),
	CONSTRAINT "users_status_valid" CHECK ("users"."status" in ('active', 'deactivated')),
	CONSTRAINT "users_version_positive" CHECK ("users"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_actual_recorded_by_users_id_fk" FOREIGN KEY ("actual_recorded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_entries" ADD CONSTRAINT "history_entries_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_entries" ADD CONSTRAINT "history_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_leader_user_id_users_id_fk" FOREIGN KEY ("leader_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_archived_by_users_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_project_idx" ON "events" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "history_project_at_idx" ON "history_entries" USING btree ("project_id","at");--> statement-breakpoint
CREATE INDEX "history_entity_idx" ON "history_entries" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "project_members_user_idx" ON "project_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "projects_leader_idx" ON "projects" USING btree ("leader_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");