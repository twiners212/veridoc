import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { queryClient } from "@/db";

const appUrl = process.env.DATABASE_URL;
const directUrl = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;

if (!appUrl || !directUrl) {
  throw new Error("Missing DATABASE_URL or DIRECT_DATABASE_URL in test environment");
}

// Runtime client running as veridoc_app_user (NOBYPASSRLS)
export const appClient = postgres(appUrl, { prepare: false, max: 5 });
export const testAppDb = drizzle(appClient, { schema });

// Admin client running as postgres (migration / fixture setup / cleanup)
export const adminClient = postgres(directUrl, { prepare: false, max: 5 });
export const testAdminDb = drizzle(adminClient, { schema });

export async function cleanupTestTenants(tenantIds: string[]) {
  if (tenantIds.length === 0) return;
  try {
    await adminClient.begin(async (sql) => {
      await sql`SET LOCAL session_replication_role = 'replica'`;
      await sql`DELETE FROM veridoc.read_acknowledgments WHERE tenant_id = ANY(${tenantIds})`;
      await sql`DELETE FROM veridoc.read_assignments WHERE tenant_id = ANY(${tenantIds})`;
      await sql`DELETE FROM veridoc.approval_steps WHERE tenant_id = ANY(${tenantIds})`;
      await sql`DELETE FROM veridoc.approval_cycles WHERE tenant_id = ANY(${tenantIds})`;
      await sql`DELETE FROM veridoc.document_versions WHERE tenant_id = ANY(${tenantIds})`;
      await sql`DELETE FROM veridoc.documents WHERE tenant_id = ANY(${tenantIds})`;
      await sql`DELETE FROM veridoc.audience_group_members WHERE tenant_id = ANY(${tenantIds})`;
      await sql`DELETE FROM veridoc.audience_groups WHERE tenant_id = ANY(${tenantIds})`;
      await sql`DELETE FROM veridoc.tenant_memberships WHERE tenant_id = ANY(${tenantIds})`;
      await sql`DELETE FROM veridoc.audit_logs WHERE tenant_id = ANY(${tenantIds})`;
      await sql`DELETE FROM veridoc.tenants WHERE id = ANY(${tenantIds})`;
    });
  } catch (e) {
    // Ignore cleanup errors
  }
}

export async function cleanupTestUsers(userIds: string[]) {
  if (userIds.length === 0) return;
  try {
    await adminClient.begin(async (sql) => {
      await sql`SET LOCAL session_replication_role = 'replica'`;
      await sql`DELETE FROM veridoc.accounts WHERE user_id = ANY(${userIds})`;
      await sql`DELETE FROM veridoc.sessions WHERE user_id = ANY(${userIds})`;
      await sql`DELETE FROM veridoc.tenant_memberships WHERE user_id = ANY(${userIds})`;
      await sql`DELETE FROM veridoc.users WHERE id = ANY(${userIds})`;
    });
  } catch (e) {
    // Ignore cleanup errors
  }
}

/**
 * Closes all PostgreSQL client pools used by integration tests.
 */
export async function closeTestDbClients() {
  await Promise.allSettled([
    appClient.end({ timeout: 5 }),
    adminClient.end({ timeout: 5 }),
    queryClient.end({ timeout: 5 }),
  ]);
}
