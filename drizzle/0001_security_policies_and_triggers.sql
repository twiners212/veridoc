-- Check Constraints
ALTER TABLE "veridoc"."tenants"
  ADD CONSTRAINT "chk_creator_seat_limit" CHECK ("creator_seat_limit" > 0),
  ADD CONSTRAINT "chk_reader_pack_limit" CHECK ("reader_pack_limit" > 0);
--> statement-breakpoint

ALTER TABLE "veridoc"."document_versions"
  ADD CONSTRAINT "chk_version_major" CHECK ("version_major" >= 0),
  ADD CONSTRAINT "chk_version_minor" CHECK ("version_minor" >= 0),
  ADD CONSTRAINT "chk_file_mime_type" CHECK ("file_mime_type" IS NULL OR "file_mime_type" = 'application/pdf'),
  ADD CONSTRAINT "chk_file_size_bytes" CHECK ("file_size_bytes" IS NULL OR ("file_size_bytes" > 0 AND "file_size_bytes" <= 52428800)),
  ADD CONSTRAINT "chk_lifecycle_state_digest" CHECK ("lifecycle_state" = 'DRAFT' OR "document_sha256" IS NOT NULL),
  ADD CONSTRAINT "chk_minor_edit_justification" CHECK (NOT "is_minor_admin_edit" OR ("minor_edit_justification" IS NOT NULL AND length(trim("minor_edit_justification")) > 0));
--> statement-breakpoint

ALTER TABLE "veridoc"."approval_cycles"
  ADD CONSTRAINT "chk_cycle_number" CHECK ("cycle_number" >= 1);
--> statement-breakpoint

ALTER TABLE "veridoc"."approval_steps"
  ADD CONSTRAINT "chk_step_order" CHECK ("step_order" >= 1),
  ADD CONSTRAINT "chk_sign_off_completeness" CHECK (
    "status" NOT IN ('APPROVED', 'REJECTED') OR (
      "acted_by_user_id" IS NOT NULL AND
      "acted_by_full_name" IS NOT NULL AND
      "acted_by_role" IS NOT NULL AND
      "signed_document_sha256" IS NOT NULL AND
      "decision_intent" IS NOT NULL AND
      "acted_at" IS NOT NULL
    )
  );
--> statement-breakpoint

ALTER TABLE "veridoc"."read_acknowledgments"
  ADD CONSTRAINT "chk_dwell_time_seconds" CHECK ("dwell_time_seconds" >= 0),
  ADD CONSTRAINT "chk_max_scroll_percent" CHECK ("max_scroll_percent" BETWEEN 0 AND 100);
--> statement-breakpoint

ALTER TABLE "veridoc"."audit_logs"
  ADD CONSTRAINT "chk_sequence_number" CHECK ("sequence_number" >= 1);
--> statement-breakpoint

-- Partial Unique Indexes
CREATE UNIQUE INDEX "uq_one_published_version_per_doc" ON "veridoc"."document_versions" ("tenant_id", "document_id") WHERE "lifecycle_state" = 'PUBLISHED';
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_one_active_cycle_per_version" ON "veridoc"."approval_cycles" ("tenant_id", "document_version_id") WHERE "status" = 'IN_PROGRESS';
--> statement-breakpoint

-- Grants & Revokes for veridoc_app_user
GRANT USAGE ON SCHEMA "veridoc" TO "veridoc_app_user";
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "veridoc" TO "veridoc_app_user";
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "veridoc" TO "veridoc_app_user";
--> statement-breakpoint
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA "veridoc" TO "veridoc_app_user";
--> statement-breakpoint

ALTER DEFAULT PRIVILEGES IN SCHEMA "veridoc" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "veridoc_app_user";
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA "veridoc" GRANT USAGE, SELECT ON SEQUENCES TO "veridoc_app_user";
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA "veridoc" GRANT EXECUTE ON FUNCTIONS TO "veridoc_app_user";
--> statement-breakpoint

REVOKE UPDATE, DELETE ON "veridoc"."audit_logs", "veridoc"."read_acknowledgments" FROM "veridoc_app_user";
--> statement-breakpoint
REVOKE DELETE ON "veridoc"."approval_cycles", "veridoc"."approval_steps", "veridoc"."document_versions", "veridoc"."read_assignments" FROM "veridoc_app_user";
--> statement-breakpoint

-- Forced Row Level Security on tenant-scoped tables
ALTER TABLE "veridoc"."tenants" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "veridoc"."tenants" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation_policy" ON "veridoc"."tenants"
  FOR ALL
  TO "veridoc_app_user"
  USING ("id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
--> statement-breakpoint

ALTER TABLE "veridoc"."tenant_memberships" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "veridoc"."tenant_memberships" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation_policy" ON "veridoc"."tenant_memberships"
  FOR ALL
  TO "veridoc_app_user"
  USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
--> statement-breakpoint

ALTER TABLE "veridoc"."audience_groups" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "veridoc"."audience_groups" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation_policy" ON "veridoc"."audience_groups"
  FOR ALL
  TO "veridoc_app_user"
  USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
--> statement-breakpoint

ALTER TABLE "veridoc"."audience_group_members" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "veridoc"."audience_group_members" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation_policy" ON "veridoc"."audience_group_members"
  FOR ALL
  TO "veridoc_app_user"
  USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
--> statement-breakpoint

ALTER TABLE "veridoc"."documents" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "veridoc"."documents" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation_policy" ON "veridoc"."documents"
  FOR ALL
  TO "veridoc_app_user"
  USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
--> statement-breakpoint

ALTER TABLE "veridoc"."document_versions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "veridoc"."document_versions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation_policy" ON "veridoc"."document_versions"
  FOR ALL
  TO "veridoc_app_user"
  USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
--> statement-breakpoint

ALTER TABLE "veridoc"."approval_cycles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "veridoc"."approval_cycles" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation_policy" ON "veridoc"."approval_cycles"
  FOR ALL
  TO "veridoc_app_user"
  USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
--> statement-breakpoint

ALTER TABLE "veridoc"."approval_steps" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "veridoc"."approval_steps" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation_policy" ON "veridoc"."approval_steps"
  FOR ALL
  TO "veridoc_app_user"
  USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
--> statement-breakpoint

ALTER TABLE "veridoc"."read_assignments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "veridoc"."read_assignments" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation_policy" ON "veridoc"."read_assignments"
  FOR ALL
  TO "veridoc_app_user"
  USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
--> statement-breakpoint

ALTER TABLE "veridoc"."read_acknowledgments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "veridoc"."read_acknowledgments" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation_policy" ON "veridoc"."read_acknowledgments"
  FOR ALL
  TO "veridoc_app_user"
  USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
--> statement-breakpoint

ALTER TABLE "veridoc"."audit_logs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "veridoc"."audit_logs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation_policy" ON "veridoc"."audit_logs"
  FOR ALL
  TO "veridoc_app_user"
  USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
--> statement-breakpoint

-- Immutability & Guard Triggers
CREATE OR REPLACE FUNCTION "veridoc"."fn_audit_logs_immutable"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'AUDIT_LOG_IMMUTABLE: audit_logs rows cannot be updated or deleted';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

DROP TRIGGER IF EXISTS "trg_audit_logs_immutable" ON "veridoc"."audit_logs";
--> statement-breakpoint
CREATE TRIGGER "trg_audit_logs_immutable"
  BEFORE UPDATE OR DELETE ON "veridoc"."audit_logs"
  FOR EACH ROW
  EXECUTE FUNCTION "veridoc"."fn_audit_logs_immutable"();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "veridoc"."fn_document_versions_immutable"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.lifecycle_state IN ('APPROVED', 'PUBLISHED', 'SUPERSEDED', 'RETIRED') THEN
      RAISE EXCEPTION 'DOCUMENT_VERSION_IMMUTABLE: Cannot delete document version in state %', OLD.lifecycle_state;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.lifecycle_state IN ('APPROVED', 'PUBLISHED', 'SUPERSEDED', 'RETIRED') THEN
      IF NEW.title IS DISTINCT FROM OLD.title OR
         NEW.markdown_content IS DISTINCT FROM OLD.markdown_content OR
         NEW.file_storage_key IS DISTINCT FROM OLD.file_storage_key OR
         NEW.file_sha256 IS DISTINCT FROM OLD.file_sha256 OR
         NEW.document_sha256 IS DISTINCT FROM OLD.document_sha256 OR
         NEW.version_major IS DISTINCT FROM OLD.version_major OR
         NEW.version_minor IS DISTINCT FROM OLD.version_minor THEN
        RAISE EXCEPTION 'DOCUMENT_VERSION_IMMUTABLE: Controlled content and version cannot be modified in state %', OLD.lifecycle_state;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

DROP TRIGGER IF EXISTS "trg_document_versions_immutable" ON "veridoc"."document_versions";
--> statement-breakpoint
CREATE TRIGGER "trg_document_versions_immutable"
  BEFORE UPDATE OR DELETE ON "veridoc"."document_versions"
  FOR EACH ROW
  EXECUTE FUNCTION "veridoc"."fn_document_versions_immutable"();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "veridoc"."fn_approval_steps_self_approval_guard"()
RETURNS TRIGGER AS $$
DECLARE
  v_author_id uuid;
  v_allow_override boolean;
BEGIN
  IF NEW.status = 'APPROVED' THEN
    SELECT dv.author_id, ac.allow_self_approval_override
    INTO v_author_id, v_allow_override
    FROM "veridoc"."approval_cycles" ac
    JOIN "veridoc"."document_versions" dv
      ON dv.id = ac.document_version_id
     AND dv.tenant_id = ac.tenant_id
    WHERE ac.id = NEW.approval_cycle_id
      AND ac.tenant_id = NEW.tenant_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'APPROVAL_CYCLE_NOT_FOUND: approval cycle % not found', NEW.approval_cycle_id;
    END IF;

    IF NEW.acted_by_user_id = v_author_id AND NOT coalesce(v_allow_override, false) THEN
      RAISE EXCEPTION 'SELF_APPROVAL_VIOLATION: Document author cannot approve their own document version';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

DROP TRIGGER IF EXISTS "trg_approval_steps_self_approval_guard" ON "veridoc"."approval_steps";
--> statement-breakpoint
CREATE TRIGGER "trg_approval_steps_self_approval_guard"
  BEFORE INSERT OR UPDATE ON "veridoc"."approval_steps"
  FOR EACH ROW
  EXECUTE FUNCTION "veridoc"."fn_approval_steps_self_approval_guard"();
