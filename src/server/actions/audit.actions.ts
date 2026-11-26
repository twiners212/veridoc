"use server";
import { db } from "@/db";
import { withTenantContext } from "@/db/context";
import {
  getUserWorkspaces,
  resolveServerActionCaller,
  resolveServerActionDb,
  type ServerActionCallerContext,
} from "@/lib/auth/server";
import { assertActiveMembership } from "@/server/policies/membership.policy";
import { assertCanViewAuditLogs } from "@/server/policies/rbac.policy";
import {
  getAuditLogs,
  getAuditStats,
  verifyTenantAuditChainInTx,
  type GetAuditLogsParams,
  type GetAuditLogsResult,
  type AuditStatsResult,
  type AuditChainVerificationResult,
} from "@/server/services/audit.service";
import type { ActionResult } from "@/types/actions";
import { DomainError } from "@/types/errors";

export type ActionCallerContext = ServerActionCallerContext;

async function resolveTenantId(
  userId: string,
  preferredTenantId?: string,
  dbClient = db
): Promise<string | null> {
  if (preferredTenantId) {
    return preferredTenantId;
  }
  const workspaces = await getUserWorkspaces(userId, dbClient);
  return workspaces[0]?.tenantId ?? null;
}

export async function getAuditLogsAction(
  params?: Partial<Omit<GetAuditLogsParams, "tenantId">>,
  context?: ActionCallerContext
): Promise<
  ActionResult<GetAuditLogsResult & { stats: AuditStatsResult }>
> {
  try {
    const caller = await resolveServerActionCaller(context);
    if (!caller?.userId) {
      return {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required to view audit logs",
          status: 401,
        },
      };
    }

    const dbClient = resolveServerActionDb(context);
    const tenantId = await resolveTenantId(
      caller.userId,
      caller.tenantId,
      dbClient
    );
    if (!tenantId) {
      return {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "No active tenant membership found",
          status: 401,
        },
      };
    }

    const data = await withTenantContext(
      tenantId,
      async (tx, activeTenantId) => {
        const membership = await assertActiveMembership(
          tx,
          activeTenantId,
          caller.userId
        );
        assertCanViewAuditLogs(membership);

        const queryParams: GetAuditLogsParams = {
          tenantId: activeTenantId,
          cursor: params?.cursor ?? params?.cursorSequence ?? null,
          limit: params?.limit ?? 50,
          search: params?.search ?? null,
          eventType: params?.eventType ?? null,
          actorRole: params?.actorRole ?? null,
          startDate: params?.startDate ?? null,
          endDate: params?.endDate ?? null,
        };

        const [logsResult, statsResult] = await Promise.all([
          getAuditLogs(tx, queryParams),
          getAuditStats(tx, activeTenantId),
        ]);

        return {
          ...logsResult,
          stats: statsResult,
        };
      },
      dbClient
    );

    return {
      success: true,
      data,
    };
  } catch (error: unknown) {
    if (error instanceof DomainError) {
      return {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          status: error.httpStatus,
          fieldErrors: error.fieldErrors,
        },
      };
    }
    console.error("Failed to execute getAuditLogsAction:", error);
    return {
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while fetching audit logs",
        status: 500,
      },
    };
  }
}

export async function verifyTenantAuditChainAction(
  context?: ActionCallerContext
): Promise<ActionResult<AuditChainVerificationResult>> {
  try {
    const caller = await resolveServerActionCaller(context);
    if (!caller?.userId) {
      return {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required to verify audit chain",
          status: 401,
        },
      };
    }

    const dbClient = resolveServerActionDb(context);
    const tenantId = await resolveTenantId(
      caller.userId,
      caller.tenantId,
      dbClient
    );
    if (!tenantId) {
      return {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "No active tenant membership found",
          status: 401,
        },
      };
    }

    const data = await withTenantContext(
      tenantId,
      async (tx, activeTenantId) => {
        const membership = await assertActiveMembership(
          tx,
          activeTenantId,
          caller.userId
        );
        assertCanViewAuditLogs(membership);

        return await verifyTenantAuditChainInTx(tx, activeTenantId);
      },
      dbClient
    );

    return {
      success: true,
      data,
    };
  } catch (error: unknown) {
    if (error instanceof DomainError) {
      return {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          status: error.httpStatus,
          fieldErrors: error.fieldErrors,
        },
      };
    }
    console.error("Failed to execute verifyTenantAuditChainAction:", error);
    return {
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while verifying the audit chain",
        status: 500,
      },
    };
  }
}
