import "server-only";
import { eq, sql } from "drizzle-orm";
import type { TenantTransaction } from "@/db/context";
import {
  audienceGroupMembers,
  audienceGroups,
  tenantMemberships,
  tenants,
  users,
} from "@/db/schema";
import {
  isCreatorSeatRole,
  isReaderPackRole,
} from "@/server/policies/rbac.policy";
import type { WorkspaceRole } from "@/types/roles";

export interface WorkspaceContextSnapshot {
  role: WorkspaceRole;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  creatorSeatLimit: number;
  readerPackLimit: number;
  allowSingleAuthorOverride: boolean;
  creatorCount: number;
  readerCount: number;
  pendingApprovalsCount: number;
  pendingToReadCount: number;
}

interface RawWorkspaceContextRow {
  role: WorkspaceRole;
  status: string;
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  creator_seat_limit: number;
  reader_pack_limit: number;
  allow_single_author_override: boolean;
  creator_count: number;
  reader_count: number;
  pending_approvals_count: number;
  pending_to_read_count: number;
}

/**
 * Fetches live ACTIVE membership, tenant configuration, seat counts,
 * and pending sidebar badge counts in a single strictly parameterized SQL query
 * inside `withTenantContext()` under FORCE ROW LEVEL SECURITY.
 */
export async function getWorkspaceContextSnapshot(
  tx: TenantTransaction,
  tenantId: string,
  userId: string
): Promise<WorkspaceContextSnapshot | null> {
  const rows = await tx.execute(sql`
    SELECT
      tm.role,
      tm.status,
      t.id AS tenant_id,
      t.name AS tenant_name,
      t.slug AS tenant_slug,
      t.creator_seat_limit,
      t.reader_pack_limit,
      t.allow_single_author_override,
      (SELECT count(*)::int FROM veridoc.tenant_memberships m
       WHERE m.tenant_id = t.id AND m.status IN ('ACTIVE', 'INVITED')
         AND m.role IN ('WORKSPACE_ADMIN', 'QUALITY_MANAGER', 'DOCUMENT_AUTHOR', 'APPROVER_REVIEWER')) AS creator_count,
      (SELECT count(*)::int FROM veridoc.tenant_memberships m
       WHERE m.tenant_id = t.id AND m.status IN ('ACTIVE', 'INVITED')
         AND m.role = 'READER') AS reader_count,
      CASE
        WHEN tm.role IN ('WORKSPACE_ADMIN', 'QUALITY_MANAGER', 'APPROVER_REVIEWER') THEN (
          SELECT count(distinct s.id)::int
          FROM veridoc.approval_steps s
          INNER JOIN veridoc.approval_cycles c ON c.id = s.approval_cycle_id AND c.tenant_id = s.tenant_id
          INNER JOIN veridoc.document_versions v ON v.id = c.document_version_id AND v.tenant_id = c.tenant_id
          WHERE s.tenant_id = t.id AND s.status = 'PENDING' AND c.status = 'IN_PROGRESS'
            AND v.lifecycle_state = 'PENDING_APPROVAL'
            AND (tm.role <> 'APPROVER_REVIEWER' OR s.assigned_approver_id = tm.user_id)
        )
        ELSE 0
      END AS pending_approvals_count,
      (SELECT count(distinct ra.id)::int
       FROM veridoc.read_assignments ra
       INNER JOIN veridoc.document_versions v ON v.id = ra.document_version_id AND v.tenant_id = ra.tenant_id
       WHERE ra.tenant_id = t.id AND ra.user_id = tm.user_id
         AND ra.status = 'PENDING' AND v.lifecycle_state = 'PUBLISHED') AS pending_to_read_count
    FROM veridoc.tenant_memberships tm
    INNER JOIN veridoc.tenants t ON t.id = tm.tenant_id
    WHERE tm.tenant_id = ${tenantId}::uuid
      AND tm.user_id = ${userId}::uuid
      AND tm.status = 'ACTIVE'
    LIMIT 1
  `);

  const row = Array.from(rows as unknown as RawWorkspaceContextRow[])[0];
  if (!row || row.status !== "ACTIVE") {
    return null;
  }

  return {
    role: row.role,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    tenantSlug: row.tenant_slug,
    creatorSeatLimit: Number(row.creator_seat_limit),
    readerPackLimit: Number(row.reader_pack_limit),
    allowSingleAuthorOverride: Boolean(row.allow_single_author_override),
    creatorCount: Number(row.creator_count ?? 0),
    readerCount: Number(row.reader_count ?? 0),
    pendingApprovalsCount: Number(row.pending_approvals_count ?? 0),
    pendingToReadCount: Number(row.pending_to_read_count ?? 0),
  };
}

export interface WorkspaceSettingsData {
  tenant: {
    id: string;
    name: string;
    creatorSeatLimit: number;
    readerPackLimit: number;
    allowSingleAuthorOverride: boolean;
  };
  capacity: {
    creatorCount: number;
    creatorLimit: number;
    readerCount: number;
    readerLimit: number;
  };
  members: Array<{
    id: string;
    userId: string;
    name: string;
    email: string;
    role: WorkspaceRole;
    status: "ACTIVE" | "INVITED" | "DEACTIVATED";
    createdAt: string;
    groups: Array<{ id: string; name: string }>;
  }>;
  groups: Array<{
    id: string;
    name: string;
    groupType: string;
    memberCount: number;
  }>;
}

export async function getWorkspaceSettingsDataInTx(
  tx: TenantTransaction,
  tenantId: string
): Promise<WorkspaceSettingsData | null> {
  const [tenant] = await tx
    .select({
      id: tenants.id,
      name: tenants.name,
      creatorSeatLimit: tenants.creatorSeatLimit,
      readerPackLimit: tenants.readerPackLimit,
      allowSingleAuthorOverride: tenants.allowSingleAuthorOverride,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant) {
    return null;
  }

  const memberRows = await tx
    .select({
      id: tenantMemberships.id,
      userId: tenantMemberships.userId,
      role: tenantMemberships.role,
      status: tenantMemberships.status,
      createdAt: tenantMemberships.createdAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(tenantMemberships)
    .innerJoin(users, eq(users.id, tenantMemberships.userId))
    .where(eq(tenantMemberships.tenantId, tenantId));

  const groupRows = await tx
    .select({
      id: audienceGroups.id,
      name: audienceGroups.name,
      groupType: audienceGroups.groupType,
    })
    .from(audienceGroups)
    .where(eq(audienceGroups.tenantId, tenantId));

  const assignments = await tx
    .select({
      groupId: audienceGroupMembers.groupId,
      userId: audienceGroupMembers.userId,
    })
    .from(audienceGroupMembers)
    .where(eq(audienceGroupMembers.tenantId, tenantId));

  const groupMap = new Map<string, { id: string; name: string }>();
  const groupCountMap = new Map<string, number>();
  for (const g of groupRows) {
    groupMap.set(g.id, { id: g.id, name: g.name });
    groupCountMap.set(g.id, 0);
  }

  const userGroupsMap = new Map<string, Array<{ id: string; name: string }>>();
  for (const a of assignments) {
    const count = groupCountMap.get(a.groupId) ?? 0;
    groupCountMap.set(a.groupId, count + 1);

    const grp = groupMap.get(a.groupId);
    if (grp) {
      const list = userGroupsMap.get(a.userId) ?? [];
      list.push(grp);
      userGroupsMap.set(a.userId, list);
    }
  }

  let creatorCount = 0;
  let readerCount = 0;

  const members = memberRows.map((m) => {
    if (m.status === "ACTIVE" || m.status === "INVITED") {
      if (isCreatorSeatRole(m.role)) {
        creatorCount++;
      } else if (isReaderPackRole(m.role)) {
        readerCount++;
      }
    }

    return {
      id: m.id,
      userId: m.userId,
      name: m.userName,
      email: m.userEmail,
      role: m.role,
      status: m.status,
      createdAt: m.createdAt.toISOString(),
      groups: userGroupsMap.get(m.userId) ?? [],
    };
  });

  const groups = groupRows.map((g) => ({
    id: g.id,
    name: g.name,
    groupType: g.groupType,
    memberCount: groupCountMap.get(g.id) ?? 0,
  }));

  return {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      creatorSeatLimit: tenant.creatorSeatLimit,
      readerPackLimit: tenant.readerPackLimit,
      allowSingleAuthorOverride: tenant.allowSingleAuthorOverride,
    },
    capacity: {
      creatorCount,
      creatorLimit: tenant.creatorSeatLimit,
      readerCount,
      readerLimit: tenant.readerPackLimit,
    },
    members,
    groups,
  };
}
