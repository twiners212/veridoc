-- Fix Document Versions Immutability Trigger:
-- 1. Protect all controlled content, format, author, and identity columns.
-- 2. Validate permitted lifecycle state transitions (APPROVED -> PUBLISHED -> SUPERSEDED/RETIRED).
-- 3. Prevent resurrection from terminal states (SUPERSEDED, RETIRED).
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
      -- Controlled content, metadata, author, and identity must never change once APPROVED/PUBLISHED/SUPERSEDED/RETIRED
      IF NEW.title IS DISTINCT FROM OLD.title OR
         NEW.content_format IS DISTINCT FROM OLD.content_format OR
         NEW.markdown_content IS DISTINCT FROM OLD.markdown_content OR
         NEW.file_storage_key IS DISTINCT FROM OLD.file_storage_key OR
         NEW.file_mime_type IS DISTINCT FROM OLD.file_mime_type OR
         NEW.file_size_bytes IS DISTINCT FROM OLD.file_size_bytes OR
         NEW.file_sha256 IS DISTINCT FROM OLD.file_sha256 OR
         NEW.document_sha256 IS DISTINCT FROM OLD.document_sha256 OR
         NEW.version_major IS DISTINCT FROM OLD.version_major OR
         NEW.version_minor IS DISTINCT FROM OLD.version_minor OR
         NEW.author_id IS DISTINCT FROM OLD.author_id OR
         NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR
         NEW.document_id IS DISTINCT FROM OLD.document_id OR
         NEW.parent_version_id IS DISTINCT FROM OLD.parent_version_id THEN
        RAISE EXCEPTION 'DOCUMENT_VERSION_IMMUTABLE: Controlled content, version metadata, or identity cannot be modified in state %', OLD.lifecycle_state;
      END IF;

      -- Validate legal lifecycle state transitions
      IF NEW.lifecycle_state IS DISTINCT FROM OLD.lifecycle_state THEN
        IF OLD.lifecycle_state = 'APPROVED' AND NEW.lifecycle_state <> 'PUBLISHED' THEN
          RAISE EXCEPTION 'ILLEGAL_STATE_TRANSITION: Version in APPROVED state can only transition to PUBLISHED, not %', NEW.lifecycle_state;
        ELSIF OLD.lifecycle_state = 'PUBLISHED' AND NEW.lifecycle_state NOT IN ('SUPERSEDED', 'RETIRED') THEN
          RAISE EXCEPTION 'ILLEGAL_STATE_TRANSITION: Version in PUBLISHED state can only transition to SUPERSEDED or RETIRED, not %', NEW.lifecycle_state;
        ELSIF OLD.lifecycle_state IN ('SUPERSEDED', 'RETIRED') THEN
          RAISE EXCEPTION 'ILLEGAL_STATE_TRANSITION: Cannot transition from terminal state % to %', OLD.lifecycle_state, NEW.lifecycle_state;
        END IF;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

-- Reinforce sign-off completeness check constraint to disallow empty/whitespace strings
ALTER TABLE "veridoc"."approval_steps"
  DROP CONSTRAINT IF EXISTS "chk_sign_off_completeness";
--> statement-breakpoint

ALTER TABLE "veridoc"."approval_steps"
  ADD CONSTRAINT "chk_sign_off_completeness" CHECK (
    "status" NOT IN ('APPROVED', 'REJECTED') OR (
      "acted_by_user_id" IS NOT NULL AND
      "acted_by_full_name" IS NOT NULL AND length(trim("acted_by_full_name")) > 0 AND
      "acted_by_role" IS NOT NULL AND
      "signed_document_sha256" IS NOT NULL AND
      "decision_intent" IS NOT NULL AND length(trim("decision_intent")) > 0 AND
      "acted_at" IS NOT NULL
    )
  );
