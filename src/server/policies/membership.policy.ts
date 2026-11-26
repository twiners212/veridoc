import "server-only";
import { and, eq } from "drizzle-orm";
import { tenantMemberships } from "@/db/schema";
import type { TenantTransaction } from "@/db/context";
import { DomainError } from "@/types/errors";
import type { ActiveMembership } from "./rbac.types";

/**
 * Resolves the user's live membership in the tenant from the database.
 * Returns null if user is not a member or status !== 'ACTIVE'.
 */
export async function getActiveMembership(
  tx: TenantTransaction,
  tenantId: string,
  userId: string
): Promise<ActiveMembership | null> {
  if (!tenantId || !userId) {
    return null;
  }

  const [row] = await tx
    .select({
      id: tenantMemberships.id,
      tenantId: tenantMemberships.tenantId,
      userId: tenantMemberships.userId,
      role: tenantMemberships.role,
      status: tenantMemberships.status,
      createdAt: tenantMemberships.createdAt,
      updatedAt: tenantMemberships.updatedAt,
    })
    .from(tenantMemberships)
    .where(
      and(
        eq(tenantMemberships.tenantId, tenantId),
        eq(tenantMemberships.userId, userId)
      )
    )
    .limit(1);

  if (!row || row.status !== "ACTIVE") {
    return null;
  }

  return {
    id: row.id,
    tenantId: row.tenantId,
    userId: row.userId,
    role: row.role,
    status: "ACTIVE",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Asserts that the user has an ACTIVE membership in the workspace.
 * Throws 403 FORBIDDEN if missing, invited, or deactivated (fail closed).
 */
export async function assertActiveMembership(
  tx: TenantTransaction,
  tenantId: string,
  userId: string
): Promise<ActiveMembership> {
  const membership = await getActiveMembership(tx, tenantId, userId);
  if (!membership) {
    throw new DomainError(
      "FORBIDDEN",
      "User does not have an active membership in this workspace",
      403
    );
  }
  return membership;
}

/**
 * Asserts that the actor is an active WORKSPACE_ADMIN.
 */
export async function assertWorkspaceAdmin(
  tx: TenantTransaction,
  tenantId: string,
  userId: string
): Promise<ActiveMembership> {
  const membership = await assertActiveMembership(tx, tenantId, userId);
  if (membership.role !== "WORKSPACE_ADMIN") {
    throw new DomainError(
      "FORBIDDEN",
      "Action requires WORKSPACE_ADMIN role",
      403
    );
  }
  return membership;
}
