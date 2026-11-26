CREATE SCHEMA IF NOT EXISTS "veridoc";
--> statement-breakpoint
CREATE TYPE "veridoc"."approval_cycle_status" AS ENUM('IN_PROGRESS', 'APPROVED', 'REJECTED', 'INVALIDATED', 'RECALLED');--> statement-breakpoint
CREATE TYPE "veridoc"."approval_step_status" AS ENUM('WAITING', 'PENDING', 'APPROVED', 'REJECTED', 'INVALIDATED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "veridoc"."content_format" AS ENUM('MARKDOWN', 'PDF');--> statement-breakpoint
CREATE TYPE "veridoc"."document_lifecycle_state" AS ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PUBLISHED', 'SUPERSEDED', 'RETIRED');--> statement-breakpoint
CREATE TYPE "veridoc"."group_type" AS ENUM('DEPARTMENT', 'SITE_LOCATION', 'JOB_ROLE', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "veridoc"."membership_status" AS ENUM('ACTIVE', 'INVITED', 'DEACTIVATED');--> statement-breakpoint
CREATE TYPE "veridoc"."read_assignment_status" AS ENUM('PENDING', 'COMPLETED', 'EXPIRED_SUPERSEDED');--> statement-breakpoint
CREATE TYPE "veridoc"."workspace_role" AS ENUM('WORKSPACE_ADMIN', 'QUALITY_MANAGER', 'DOCUMENT_AUTHOR', 'APPROVER_REVIEWER', 'READER');--> statement-breakpoint
CREATE TABLE "veridoc"."approval_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"document_version_id" uuid NOT NULL,
	"cycle_number" integer NOT NULL,
	"submitted_by" uuid NOT NULL,
	"submitted_sha256" char(64) NOT NULL,
	"status" "veridoc"."approval_cycle_status" DEFAULT 'IN_PROGRESS' NOT NULL,
	"allow_self_approval_override" boolean DEFAULT false NOT NULL,
	"invalidated_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "uq_approval_cycles_tenant_id" UNIQUE("tenant_id","id"),
	CONSTRAINT "uq_approval_cycles_version_cycle" UNIQUE("tenant_id","document_version_id","cycle_number")
);
--> statement-breakpoint
CREATE TABLE "veridoc"."approval_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"approval_cycle_id" uuid NOT NULL,
	"step_order" integer NOT NULL,
	"assigned_approver_id" uuid NOT NULL,
	"status" "veridoc"."approval_step_status" DEFAULT 'WAITING' NOT NULL,
	"acted_by_user_id" uuid,
	"acted_by_full_name" text,
	"acted_by_role" "veridoc"."workspace_role",
	"acted_ip_address" "inet",
	"auth_method" text,
	"signed_document_sha256" char(64),
	"decision_intent" text,
	"self_approval_override_used" boolean DEFAULT false NOT NULL,
	"overridden_from_approver_id" uuid,
	"acted_at" timestamp with time zone,
	CONSTRAINT "uq_approval_steps_tenant_id" UNIQUE("tenant_id","id"),
	CONSTRAINT "uq_approval_steps_cycle_order" UNIQUE("tenant_id","approval_cycle_id","step_order")
);
--> statement-breakpoint
CREATE TABLE "veridoc"."audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sequence_number" bigint NOT NULL,
	"event_type" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"actor_role" "veridoc"."workspace_role",
	"actor_ip" "inet",
	"payload_json" jsonb NOT NULL,
	"prev_hash" char(64) NOT NULL,
	"entry_hash" char(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_audit_logs_tenant_seq" UNIQUE("tenant_id","sequence_number")
);
--> statement-breakpoint
CREATE TABLE "veridoc"."accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "veridoc"."sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"active_tenant_id" uuid,
	"ip_address" text,
	"user_agent" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "veridoc"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "veridoc"."verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "veridoc"."document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"parent_version_id" uuid,
	"version_major" integer DEFAULT 0 NOT NULL,
	"version_minor" integer DEFAULT 1 NOT NULL,
	"version_label" text GENERATED ALWAYS AS ('v' || version_major || '.' || version_minor) STORED,
	"title" text NOT NULL,
	"content_format" "veridoc"."content_format" NOT NULL,
	"markdown_content" text,
	"file_storage_key" text,
	"file_mime_type" text,
	"file_size_bytes" bigint,
	"file_sha256" char(64),
	"document_sha256" char(64),
	"lifecycle_state" "veridoc"."document_lifecycle_state" DEFAULT 'DRAFT' NOT NULL,
	"author_id" uuid NOT NULL,
	"effective_date" timestamp with time zone,
	"published_at" timestamp with time zone,
	"published_by" uuid,
	"is_minor_admin_edit" boolean DEFAULT false NOT NULL,
	"minor_edit_justification" text,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_document_versions_tenant_id" UNIQUE("tenant_id","id"),
	CONSTRAINT "uq_document_versions_num" UNIQUE("tenant_id","document_id","version_major","version_minor")
);
--> statement-breakpoint
CREATE TABLE "veridoc"."documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"document_code" text NOT NULL,
	"category" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_documents_tenant_code" UNIQUE("tenant_id","document_code"),
	CONSTRAINT "uq_documents_tenant_id" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "veridoc"."audience_group_members" (
	"tenant_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audience_group_members_tenant_id_group_id_user_id_pk" PRIMARY KEY("tenant_id","group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "veridoc"."audience_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"group_type" "veridoc"."group_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_audience_groups_tenant_type_name" UNIQUE("tenant_id","group_type","name"),
	CONSTRAINT "uq_audience_groups_tenant_id" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "veridoc"."tenant_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "veridoc"."workspace_role" NOT NULL,
	"status" "veridoc"."membership_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_tenant_memberships_tenant_user" UNIQUE("tenant_id","user_id"),
	CONSTRAINT "uq_tenant_memberships_tenant_id" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "veridoc"."tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"creator_seat_limit" integer DEFAULT 10 NOT NULL,
	"reader_pack_limit" integer DEFAULT 100 NOT NULL,
	"allow_single_author_override" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "veridoc"."read_acknowledgments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"read_assignment_id" uuid NOT NULL,
	"document_version_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"document_sha256" char(64) NOT NULL,
	"dwell_time_seconds" integer NOT NULL,
	"max_scroll_percent" smallint NOT NULL,
	"acknowledged_ip" "inet",
	"acknowledged_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_read_acknowledgments_tenant_id" UNIQUE("tenant_id","id"),
	CONSTRAINT "uq_read_ack_tenant_version_user" UNIQUE("tenant_id","document_version_id","user_id"),
	CONSTRAINT "uq_read_ack_tenant_assignment" UNIQUE("tenant_id","read_assignment_id")
);
--> statement-breakpoint
CREATE TABLE "veridoc"."read_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"document_version_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"assigned_via_group_id" uuid,
	"status" "veridoc"."read_assignment_status" DEFAULT 'PENDING' NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_read_assignments_tenant_id" UNIQUE("tenant_id","id"),
	CONSTRAINT "uq_read_assignments_tenant_version_user" UNIQUE("tenant_id","document_version_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "veridoc"."approval_cycles" ADD CONSTRAINT "approval_cycles_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "veridoc"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veridoc"."approval_cycles" ADD CONSTRAINT "approval_cycles_tenant_id_document_version_id_document_versions_tenant_id_id_fk" FOREIGN KEY ("tenant_id","document_version_id") REFERENCES "veridoc"."document_versions"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veridoc"."approval_steps" ADD CONSTRAINT "approval_steps_assigned_approver_id_users_id_fk" FOREIGN KEY ("assigned_approver_id") REFERENCES "veridoc"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veridoc"."approval_steps" ADD CONSTRAINT "approval_steps_acted_by_user_id_users_id_fk" FOREIGN KEY ("acted_by_user_id") REFERENCES "veridoc"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veridoc"."approval_steps" ADD CONSTRAINT "approval_steps_overridden_from_approver_id_users_id_fk" FOREIGN KEY ("overridden_from_approver_id") REFERENCES "veridoc"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veridoc"."approval_steps" ADD CONSTRAINT "approval_steps_tenant_id_approval_cycle_id_approval_cycles_tenant_id_id_fk" FOREIGN KEY ("tenant_id","approval_cycle_id") REFERENCES "veridoc"."approval_cycles"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veridoc"."audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "veridoc"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veridoc"."audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "veridoc"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veridoc"."accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "veridoc"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veridoc"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "veridoc"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veridoc"."sessions" ADD CONSTRAINT "sessions_active_tenant_id_tenants_id_fk" FOREIGN KEY ("active_tenant_id") REFERENCES "veridoc"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veridoc"."document_versions" ADD CONSTRAINT "document_versions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "veridoc"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veridoc"."document_versions" ADD CONSTRAINT "document_versions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "veridoc"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veridoc"."document_versions" ADD CONSTRAINT "document_versions_tenant_id_document_id_documents_tenant_id_id_fk" FOREIGN KEY ("tenant_id","document_id") REFERENCES "veridoc"."documents"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veridoc"."document_versions" ADD CONSTRAINT "document_versions_tenant_id_parent_version_id_document_versions_tenant_id_id_fk" FOREIGN KEY ("tenant_id","parent_version_id") REFERENCES "veridoc"."document_versions"("tenant_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veridoc"."documents" ADD CONSTRAINT "documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "veridoc"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veridoc"."documents" ADD CONSTRAINT "documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "veridoc"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veridoc"."audience_group_members" ADD CONSTRAINT "audience_group_members_tenant_id_group_id_audience_groups_tenant_id_id_fk" FOREIGN KEY ("tenant_id","group_id") REFERENCES "veridoc"."audience_groups"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veridoc"."audience_group_members" ADD CONSTRAINT "audience_group_members_tenant_id_user_id_tenant_memberships_tenant_id_user_id_fk" FOREIGN KEY ("tenant_id","user_id") REFERENCES "veridoc"."tenant_memberships"("tenant_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veridoc"."audience_groups" ADD CONSTRAINT "audience_groups_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "veridoc"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veridoc"."tenant_memberships" ADD CONSTRAINT "tenant_memberships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "veridoc"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veridoc"."tenant_memberships" ADD CONSTRAINT "tenant_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "veridoc"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veridoc"."read_acknowledgments" ADD CONSTRAINT "read_acknowledgments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "veridoc"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veridoc"."read_acknowledgments" ADD CONSTRAINT "read_acknowledgments_tenant_id_read_assignment_id_read_assignments_tenant_id_id_fk" FOREIGN KEY ("tenant_id","read_assignment_id") REFERENCES "veridoc"."read_assignments"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veridoc"."read_acknowledgments" ADD CONSTRAINT "read_acknowledgments_tenant_id_document_version_id_document_versions_tenant_id_id_fk" FOREIGN KEY ("tenant_id","document_version_id") REFERENCES "veridoc"."document_versions"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veridoc"."read_assignments" ADD CONSTRAINT "read_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "veridoc"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veridoc"."read_assignments" ADD CONSTRAINT "read_assignments_tenant_id_document_version_id_document_versions_tenant_id_id_fk" FOREIGN KEY ("tenant_id","document_version_id") REFERENCES "veridoc"."document_versions"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veridoc"."read_assignments" ADD CONSTRAINT "read_assignments_tenant_id_assigned_via_group_id_audience_groups_tenant_id_id_fk" FOREIGN KEY ("tenant_id","assigned_via_group_id") REFERENCES "veridoc"."audience_groups"("tenant_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_approval_steps_queue" ON "veridoc"."approval_steps" USING btree ("tenant_id","assigned_approver_id","status");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_entity" ON "veridoc"."audit_logs" USING btree ("tenant_id","entity_type","entity_id","sequence_number");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_time" ON "veridoc"."audit_logs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_doc_versions_tenant_state" ON "veridoc"."document_versions" USING btree ("tenant_id","lifecycle_state","updated_at");--> statement-breakpoint
CREATE INDEX "idx_documents_tenant_code" ON "veridoc"."documents" USING btree ("tenant_id","document_code");--> statement-breakpoint
CREATE INDEX "idx_memberships_tenant_role" ON "veridoc"."tenant_memberships" USING btree ("tenant_id","role","status");--> statement-breakpoint
CREATE INDEX "idx_read_assignments_reader" ON "veridoc"."read_assignments" USING btree ("tenant_id","user_id","status","due_at");--> statement-breakpoint
CREATE INDEX "idx_read_assignments_dashboard" ON "veridoc"."read_assignments" USING btree ("tenant_id","document_version_id","status");