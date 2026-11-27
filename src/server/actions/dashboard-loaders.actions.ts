"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { isValidUuid, withTenantContext, type TenantTransaction } from "@/db/context";
import { tenants } from "@/db/schema";
import {
  getCachedSession,
  getUserWorkspaces,
  isTestCallerOverrideAllowed,
  resolveServerActionDb,
  type ServerActionCallerContext,
} from "@/lib/auth/server";
import { getActiveMembership } from "@/server/policies/membership.policy";
import { ApprovalService } from "@/server/services/approval.service";
import {
  getAuditLogs,
  getAuditStats,
  verifyTenantAuditChainInTx,
  type AuditStatsResult,
  type GetAuditLogsResult,
} from "@/server/services/audit.service";
import {
  getDocumentDetailInTx,
  listDocumentsInTx,
} from "@/server/services/document.service";
import { ReaderService } from "@/server/services/reader.service";
import {
  getWorkspaceSettingsDataInTx,
  type WorkspaceSettingsData,
} from "@/server/services/workspace.service";
import type { ApprovalQueueItem } from "@/types/approvals";
import type { DocumentDetailResult, DocumentListItem } from "@/types/documents";
import { DomainError } from "@/types/errors";
import type { GovernanceDashboardData, ReadQueueResponse } from "@/types/reader";
import type { MembershipStatus, WorkspaceRole } from "@/types/roles";

export interface PageAuthContext {
  userId: string;
  userName: string;
  userEmail: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  role: WorkspaceRole;
}

interface ResolvedSessionCaller {
  userId: string;
  userName: string;
  userEmail: string;
  preferredTenantId: string | null;
}

async function resolveCallerSession(
  context?: ServerActionCallerContext
): Promise<ResolvedSessionCaller | null> {
  if (isTestCallerOverrideAllowed() && context?.userId) {
    const preferred =
      typeof context.tenantId === "string" && isValidUuid(context.tenantId.trim())
        ? context.tenantId.trim()
        : null;
    return {
      userId: context.userId,
      userName: "Test User",
      userEmail: "",
      preferredTenantId: preferred,
    };
  }

  const session = await getCachedSession();
  if (!session?.user?.id) {
    return null;
  }

  const rawActiveTenantId = (session.session as Record<string, unknown>)
    ?.activeTenantId;
  const preferredTenantId =
    typeof rawActiveTenantId === "string" && isValidUuid(rawActiveTenantId.trim())
      ? rawActiveTenantId.trim()
      : null;

  return {
    userId: session.user.id,
    userName: session.user.name || session.user.email,
    userEmail: session.user.email,
    preferredTenantId,
  };
}

/**
 * Executes a single-transaction page loader with automatic activeTenantId resolution.
 * Skips `fn_get_user_workspaces` whenever `session.activeTenantId` is valid and active;
 * falls back to `getUserWorkspaces` only if missing/inactive.
 */
async function executeInActiveWorkspace<T>(
  caller: ResolvedSessionCaller,
  dbClient: typeof db,
  fn: (
    tx: TenantTransaction,
    tenantId: string,
    role: WorkspaceRole
  ) => Promise<T>,
  explicitTenantId?: string
): Promise<T | null> {
  const runForTenant = async (targetTenantId: string): Promise<T | null> => {
    return await withTenantContext(
      targetTenantId,
      async (tx, activeTenantId) => {
        const membership = await getActiveMembership(
          tx,
          activeTenantId,
          caller.userId
        );
        if (!membership) {
          return null;
        }
        return await fn(tx, activeTenantId, membership.role);
      },
      dbClient
    );
  };

  if (explicitTenantId) {
    return await runForTenant(explicitTenantId);
  }

  if (caller.preferredTenantId) {
    const direct = await runForTenant(caller.preferredTenantId);
    if (direct !== null) {
      return direct;
    }
  }

  const workspaces = await getUserWorkspaces(caller.userId, dbClient);
  if (workspaces.length === 0) {
    return null;
  }

  const fallbackTenantId = workspaces[0].tenantId;
  if (fallbackTenantId === caller.preferredTenantId) {
    return null;
  }

  return await runForTenant(fallbackTenantId);
}

async function fetchTenantMeta(
  tx: TenantTransaction,
  tenantId: string
): Promise<{ name: string; slug: string; allowSingleAuthorOverride: boolean }> {
  const [tenant] = await tx
    .select({
      name: tenants.name,
      slug: tenants.slug,
      allowSingleAuthorOverride: tenants.allowSingleAuthorOverride,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  return {
    name: tenant?.name ?? "VeriDoc Workspace",
    slug: tenant?.slug ?? "",
    allowSingleAuthorOverride: tenant?.allowSingleAuthorOverride ?? false,
  };
}

// ============================================================================
// 1. /dashboard Loader (1 TX)
// ============================================================================

export type DashboardPageBundle =
  | { status: "UNAUTHENTICATED" }
  | { status: "REDIRECT_TO_READ" }
  | { status: "FORBIDDEN"; role: WorkspaceRole }
  | {
      status: "OK";
      authContext: PageAuthContext;
      dashboardData: GovernanceDashboardData;
    };

export async function loadDashboardPageContextAndDataAction(
  context?: ServerActionCallerContext
): Promise<DashboardPageBundle> {
  const caller = await resolveCallerSession(context);
  if (!caller) {
    return { status: "UNAUTHENTICATED" };
  }

  const dbClient = resolveServerActionDb(context);
  const result = await executeInActiveWorkspace<DashboardPageBundle>(
    caller,
    dbClient,
    async (tx, tenantId, role) => {
      if (role === "READER") {
        return { status: "REDIRECT_TO_READ" };
      }

      if (role !== "WORKSPACE_ADMIN" && role !== "QUALITY_MANAGER") {
        return { status: "FORBIDDEN", role };
      }

      const dashboardData = await ReaderService.getGovernanceDashboardData(tx, {
        tenantId,
      });

      return {
        status: "OK",
        authContext: {
          userId: caller.userId,
          userName: caller.userName,
          userEmail: caller.userEmail,
          tenantId,
          tenantName: dashboardData.tenantName ?? "VeriDoc Workspace",
          tenantSlug: "",
          role,
        },
        dashboardData,
      };
    }
  );

  return result ?? { status: "UNAUTHENTICATED" };
}

// ============================================================================
// 2. /approvals Loader (1 TX — includes SSR initialItems!)
// ============================================================================

export type ApprovalsPageBundle =
  | { status: "UNAUTHENTICATED" }
  | { status: "FORBIDDEN"; role: WorkspaceRole }
  | {
      status: "OK";
      authContext: PageAuthContext;
      allowSingleAuthorOverride: boolean;
      availableApprovers: Array<{
        id: string;
        name: string;
        email: string;
        role: WorkspaceRole;
        status: MembershipStatus;
      }>;
      initialItems: ApprovalQueueItem[];
    };

export async function loadApprovalsPageBundleAction(
  context?: ServerActionCallerContext
): Promise<ApprovalsPageBundle> {
  const caller = await resolveCallerSession(context);
  if (!caller) {
    return { status: "UNAUTHENTICATED" };
  }

  const dbClient = resolveServerActionDb(context);
  const result = await executeInActiveWorkspace<ApprovalsPageBundle>(
    caller,
    dbClient,
    async (tx, tenantId, role) => {
      const isAuthorized =
        role === "WORKSPACE_ADMIN" ||
        role === "QUALITY_MANAGER" ||
        role === "APPROVER_REVIEWER";

      if (!isAuthorized) {
        return { status: "FORBIDDEN", role };
      }

      const [approvalsCtx, queueResult] = await Promise.all([
        ApprovalService.getApprovalsContext(tx, tenantId),
        ApprovalService.getApprovalsQueue(tx, {
          tenantId,
          actorUserId: caller.userId,
          actorRole: role,
          scope: "active",
          page: 1,
          limit: 50,
        }),
      ]);

      return {
        status: "OK",
        authContext: {
          userId: caller.userId,
          userName: caller.userName,
          userEmail: caller.userEmail,
          tenantId,
          tenantName: approvalsCtx.tenantName,
          tenantSlug: "",
          role,
        },
        allowSingleAuthorOverride: approvalsCtx.allowSingleAuthorOverride,
        availableApprovers: approvalsCtx.availableApprovers,
        initialItems: queueResult.items,
      };
    }
  );

  return result ?? { status: "UNAUTHENTICATED" };
}

// ============================================================================
// 3. /documents Loader (1 TX)
// ============================================================================

export type DocumentsPageBundle =
  | { status: "UNAUTHENTICATED" }
  | {
      status: "OK";
      authContext: PageAuthContext;
      documents: DocumentListItem[];
    };

export async function loadDocumentsPageBundleAction(
  context?: ServerActionCallerContext
): Promise<DocumentsPageBundle> {
  const caller = await resolveCallerSession(context);
  if (!caller) {
    return { status: "UNAUTHENTICATED" };
  }

  const dbClient = resolveServerActionDb(context);
  const result = await executeInActiveWorkspace<DocumentsPageBundle>(
    caller,
    dbClient,
    async (tx, tenantId, role) => {
      const actor = {
        id: "",
        tenantId,
        userId: caller.userId,
        role,
        status: "ACTIVE" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const [tenantMeta, listResult] = await Promise.all([
        fetchTenantMeta(tx, tenantId),
        listDocumentsInTx(tx, actor, tenantId, {
          page: 1,
          limit: 20,
          sortBy: "updatedAt",
          sortOrder: "desc",
        }),
      ]);

      return {
        status: "OK",
        authContext: {
          userId: caller.userId,
          userName: caller.userName,
          userEmail: caller.userEmail,
          tenantId,
          tenantName: tenantMeta.name,
          tenantSlug: tenantMeta.slug,
          role,
        },
        documents: listResult.documents,
      };
    }
  );

  return result ?? { status: "UNAUTHENTICATED" };
}

// ============================================================================
// 4. /documents/[documentId] Loader (1 TX)
// ============================================================================

export type DocumentDetailPageBundle =
  | { status: "UNAUTHENTICATED" }
  | { status: "NOT_FOUND" }
  | {
      status: "OK";
      authContext: PageAuthContext;
      allowSingleAuthorOverride: boolean;
      detail: DocumentDetailResult;
      availableApprovers: Array<{
        id: string;
        name: string;
        email: string;
        role: WorkspaceRole;
        status: MembershipStatus;
      }>;
    };

export async function loadDocumentDetailPageBundleAction(
  documentId: string,
  context?: ServerActionCallerContext
): Promise<DocumentDetailPageBundle> {
  const caller = await resolveCallerSession(context);
  if (!caller) {
    return { status: "UNAUTHENTICATED" };
  }

  const dbClient = resolveServerActionDb(context);
  try {
    const result = await executeInActiveWorkspace<DocumentDetailPageBundle>(
      caller,
      dbClient,
      async (tx, tenantId, role) => {
        const actor = {
          id: "",
          tenantId,
          userId: caller.userId,
          role,
          status: "ACTIVE" as const,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const detail = await getDocumentDetailInTx(tx, actor, tenantId, documentId);

        if (role !== "READER") {
          const approvalsCtx = await ApprovalService.getApprovalsContext(
            tx,
            tenantId
          );
          return {
            status: "OK",
            authContext: {
              userId: caller.userId,
              userName: caller.userName,
              userEmail: caller.userEmail,
              tenantId,
              tenantName: approvalsCtx.tenantName,
              tenantSlug: "",
              role,
            },
            allowSingleAuthorOverride: approvalsCtx.allowSingleAuthorOverride,
            detail,
            availableApprovers: approvalsCtx.availableApprovers,
          };
        }

        const tenantMeta = await fetchTenantMeta(tx, tenantId);
        return {
          status: "OK",
          authContext: {
            userId: caller.userId,
            userName: caller.userName,
            userEmail: caller.userEmail,
            tenantId,
            tenantName: tenantMeta.name,
            tenantSlug: tenantMeta.slug,
            role,
          },
          allowSingleAuthorOverride: tenantMeta.allowSingleAuthorOverride,
          detail,
          availableApprovers: [],
        };
      }
    );

    return result ?? { status: "UNAUTHENTICATED" };
  } catch (err) {
    if (err instanceof DomainError && err.httpStatus === 404) {
      return { status: "NOT_FOUND" };
    }
    throw err;
  }
}

// ============================================================================
// 5. /to-read Loader (1 TX)
// ============================================================================

export type ToReadPageBundle =
  | { status: "UNAUTHENTICATED" }
  | {
      status: "OK";
      authContext: PageAuthContext;
      readQueue: ReadQueueResponse;
    };

export async function loadToReadPageBundleAction(
  context?: ServerActionCallerContext
): Promise<ToReadPageBundle> {
  const caller = await resolveCallerSession(context);
  if (!caller) {
    return { status: "UNAUTHENTICATED" };
  }

  const dbClient = resolveServerActionDb(context);
  const result = await executeInActiveWorkspace<ToReadPageBundle>(
    caller,
    dbClient,
    async (tx, tenantId, role) => {
      const [tenantMeta, readQueue] = await Promise.all([
        fetchTenantMeta(tx, tenantId),
        ReaderService.getMyReadQueue(tx, {
          tenantId,
          userId: caller.userId,
        }),
      ]);

      return {
        status: "OK",
        authContext: {
          userId: caller.userId,
          userName: caller.userName,
          userEmail: caller.userEmail,
          tenantId,
          tenantName: tenantMeta.name,
          tenantSlug: tenantMeta.slug,
          role,
        },
        readQueue,
      };
    }
  );

  return result ?? { status: "UNAUTHENTICATED" };
}

// ============================================================================
// 6. /read/[documentId] Loader (1 TX)
// ============================================================================

export type ReadDocumentPageBundle =
  | { status: "UNAUTHENTICATED" }
  | { status: "NOT_FOUND" }
  | {
      status: "OK";
      authContext: PageAuthContext;
      detail: DocumentDetailResult;
    };

export async function loadReadDocumentPageBundleAction(
  documentId: string,
  context?: ServerActionCallerContext
): Promise<ReadDocumentPageBundle> {
  const caller = await resolveCallerSession(context);
  if (!caller) {
    return { status: "UNAUTHENTICATED" };
  }

  const dbClient = resolveServerActionDb(context);
  try {
    const result = await executeInActiveWorkspace<ReadDocumentPageBundle>(
      caller,
      dbClient,
      async (tx, tenantId, role) => {
        const actor = {
          id: "",
          tenantId,
          userId: caller.userId,
          role,
          status: "ACTIVE" as const,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const [tenantMeta, detail] = await Promise.all([
          fetchTenantMeta(tx, tenantId),
          getDocumentDetailInTx(tx, actor, tenantId, documentId),
        ]);

        return {
          status: "OK",
          authContext: {
            userId: caller.userId,
            userName: caller.userName,
            userEmail: caller.userEmail,
            tenantId,
            tenantName: tenantMeta.name,
            tenantSlug: tenantMeta.slug,
            role,
          },
          detail,
        };
      }
    );

    return result ?? { status: "UNAUTHENTICATED" };
  } catch (err) {
    if (err instanceof DomainError && err.httpStatus === 404) {
      return { status: "NOT_FOUND" };
    }
    throw err;
  }
}

// ============================================================================
// 7. /audit Loader (1 TX)
// ============================================================================

export type AuditPageBundle =
  | { status: "UNAUTHENTICATED" }
  | { status: "FORBIDDEN"; role: WorkspaceRole }
  | {
      status: "OK";
      authContext: PageAuthContext;
      logs: GetAuditLogsResult;
      stats: AuditStatsResult;
    };

export async function loadAuditPageBundleAction(
  context?: ServerActionCallerContext
): Promise<AuditPageBundle> {
  const caller = await resolveCallerSession(context);
  if (!caller) {
    return { status: "UNAUTHENTICATED" };
  }

  const dbClient = resolveServerActionDb(context);
  const result = await executeInActiveWorkspace<AuditPageBundle>(
    caller,
    dbClient,
    async (tx, tenantId, role) => {
      if (role !== "WORKSPACE_ADMIN" && role !== "QUALITY_MANAGER") {
        return { status: "FORBIDDEN", role };
      }

      const [tenantMeta, logs, stats, chainVerification] = await Promise.all([
        fetchTenantMeta(tx, tenantId),
        getAuditLogs(tx, { tenantId, limit: 25 }),
        getAuditStats(tx, tenantId),
        verifyTenantAuditChainInTx(tx, tenantId),
      ]);

      const enrichedStats: AuditStatsResult = {
        ...stats,
        chainVerified: chainVerification.verified,
        ...(chainVerification.failedSequenceNumber !== undefined
          ? { failedSequenceNumber: chainVerification.failedSequenceNumber }
          : {}),
      };

      return {
        status: "OK",
        authContext: {
          userId: caller.userId,
          userName: caller.userName,
          userEmail: caller.userEmail,
          tenantId,
          tenantName: tenantMeta.name,
          tenantSlug: tenantMeta.slug,
          role,
        },
        logs,
        stats: enrichedStats,
      };
    }
  );

  return result ?? { status: "UNAUTHENTICATED" };
}

// ============================================================================
// 8. /settings Loader (1 TX)
// ============================================================================

export type SettingsPageBundle =
  | { status: "UNAUTHENTICATED" }
  | { status: "FORBIDDEN"; role?: WorkspaceRole; message?: string }
  | { status: "NOT_FOUND" }
  | { status: "ERROR"; message: string }
  | {
      status: "OK";
      authContext: PageAuthContext;
      settings: WorkspaceSettingsData;
    };

export async function loadSettingsPageBundleAction(
  requestedTenantId?: string,
  context?: ServerActionCallerContext
): Promise<SettingsPageBundle> {
  const caller = await resolveCallerSession(context);
  if (!caller) {
    return { status: "UNAUTHENTICATED" };
  }

  const dbClient = resolveServerActionDb(context);
  const explicit = requestedTenantId?.trim();
  if (explicit && !isValidUuid(explicit)) {
    return { status: "NOT_FOUND" };
  }

  const result = await executeInActiveWorkspace<SettingsPageBundle>(
    caller,
    dbClient,
    async (tx, tenantId, role) => {
      if (role !== "WORKSPACE_ADMIN") {
        return { status: "FORBIDDEN", role };
      }

      const settings = await getWorkspaceSettingsDataInTx(tx, tenantId);
      if (!settings) {
        return { status: "NOT_FOUND" };
      }

      return {
        status: "OK",
        authContext: {
          userId: caller.userId,
          userName: caller.userName,
          userEmail: caller.userEmail,
          tenantId,
          tenantName: settings.tenant.name,
          tenantSlug: "",
          role,
        },
        settings,
      };
    },
    explicit || undefined
  );

  if (result === null) {
    if (explicit) {
      return {
        status: "FORBIDDEN",
        message: "User does not have an active membership in this workspace",
      };
    }
    return { status: "UNAUTHENTICATED" };
  }

  return result;
}
