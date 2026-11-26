-- Migration 0003: Security-definer lookup for authenticated user active workspaces.
-- Allows veridoc_app_user (NOBYPASSRLS) to discover active tenant memberships at login
-- and workspace-switch time without weakening FORCE ROW LEVEL SECURITY on tenant tables.

CREATE OR REPLACE FUNCTION "veridoc"."fn_get_user_workspaces"(p_user_id uuid)
RETURNS TABLE (
  tenant_id uuid,
  tenant_name text,
  tenant_slug text,
  role "veridoc"."workspace_role",
  status "veridoc"."membership_status"
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = veridoc, pg_catalog
AS $$
  SELECT
    tm.tenant_id,
    t.name AS tenant_name,
    t.slug AS tenant_slug,
    tm.role,
    tm.status
  FROM veridoc.tenant_memberships tm
  INNER JOIN veridoc.tenants t ON t.id = tm.tenant_id
  WHERE tm.user_id = p_user_id
    AND tm.status = 'ACTIVE'
  ORDER BY tm.created_at ASC;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "veridoc"."fn_get_user_workspaces"(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "veridoc"."fn_get_user_workspaces"(uuid) TO "veridoc_app_user";
