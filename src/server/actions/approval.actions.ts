"use server";
import { eq } from "drizzle-orm";
import type { DrizzleDb } from "@/db";
import { withTenantContext, type TenantTransaction } from "@/db/context";
import { users } from "@/db/schema";
import {
  getUserWorkspaces,
  resolveServerActionCaller,
  resolveServerActionDb,
  resolveServerActionIp,
  verifySignOffPassword,
  type ServerActionCallerContext,
} from "@/lib/auth/server";
import { createCorrelationId, logError } from "@/lib/logger";
import {
  checkDistributedRateLimit,
  clearDistributedRateLimit,
  consumeDistributedRateLimit,
} from "@/server/security/rate-limiter";
import { assertActiveMembership } from "@/server/policies";
import type { WorkspaceRole, MembershipStatus } from "@/types/roles";
import {
  ApprovalService,
  type SubmitForApprovalParams,
  type ExecuteApprovalDecisionParams,
  type RecallApprovalParams,
  type AdminOverrideApproverParams,
} from "@/server/services/approval.service";
import {
  dispatchPostCommitNotifications,
  type NotificationPayload,
} from "@/server/services/notification.service";
import type { ActionResult } from "@/types/actions";
import { DomainError } from "@/types/errors";

// ============================================================================
// Context & Caller Resolution
// ============================================================================

export type ActionCallerContext = ServerActionCallerContext;

async function resolveCaller(context?: ActionCallerContext) {
  return await resolveServerActionCaller(context);
}

async function resolveCallerIp(context?: ActionCallerContext): Promise<string> {
  return await resolveServerActionIp(context);
}

async function resolveActionTenantId(
  explicitTenantId: string | undefined,
  caller: { userId: string; tenantId?: string },
  dbClient: DrizzleDb
): Promise<string | null> {
  const direct = explicitTenantId ?? caller.tenantId;
  if (direct) {
    return direct;
  }
  const workspaces = await getUserWorkspaces(caller.userId, dbClient);
  return workspaces[0]?.tenantId ?? null;
}

function internalActionError(
  actionName: string,
  err: unknown,
  safeMessage: string,
  userId?: string
): ActionResult<never> {
  const correlationId = createCorrelationId();
  logError(`${actionName} failed`, err, { correlationId, userId });
  return {
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: `${safeMessage} (ref: ${correlationId})`,
      status: 500,
    },
  };
}

import {
  submitForApprovalSchema,
  executeApprovalDecisionSchema,
  recallApprovalSchema,
  adminOverrideApproverSchema,
  type SubmitForApprovalInput,
  type ExecuteApprovalDecisionInput,
  type RecallApprovalInput,
  type AdminOverrideApproverInput,
} from "./approval.schema";

export type {
  SubmitForApprovalInput,
  ExecuteApprovalDecisionInput,
  RecallApprovalInput,
  AdminOverrideApproverInput,
};

// ============================================================================
// Action 1: Submit For Approval
// ============================================================================

export async function submitForApprovalAction(
  rawInput: unknown,
  context?: ActionCallerContext
): Promise<
  ActionResult<{
    cycleId: string;
    cycleNumber: number;
    lifecycleState: string;
    documentSha256: string;
    stepsCount: number;
  }>
> {
  const parsed = submitForApprovalSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid submission parameters",
        status: 400,
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
    };
  }

  const caller = await resolveCaller(context);
  if (!caller) {
    return {
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required to submit workflow",
        status: 401,
      },
    };
  }

  const input = parsed.data;
  const dbClient = resolveServerActionDb(context);

  try {
    const resolvedTenantId = await resolveActionTenantId(
      input.tenantId,
      caller,
      dbClient
    );
    if (!resolvedTenantId) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Active workspace tenant ID is required",
          status: 400,
        },
      };
    }

    let pendingNotifications: NotificationPayload[] = [];

    const result = await withTenantContext(
      resolvedTenantId,
      async (tx: TenantTransaction, tenantId: string) => {
        const actor = await assertActiveMembership(tx, tenantId, caller.userId);

        const serviceParams: SubmitForApprovalParams = {
          tenantId,
          actorUserId: actor.userId,
          actorRole: actor.role,
          versionId: input.versionId,
          expectedRowVersion: input.expectedRowVersion,
          approverIds: input.approverIds,
        };

        const serviceResult = await ApprovalService.submitForApproval(
          tx,
          serviceParams
        );
        pendingNotifications = serviceResult.notifications;

        return {
          cycleId: serviceResult.cycle.id,
          cycleNumber: serviceResult.cycle.cycleNumber,
          lifecycleState: serviceResult.version.lifecycleState,
          documentSha256: serviceResult.documentSha256,
          stepsCount: serviceResult.steps.length,
        };
      },
      dbClient
    );

    // Dispatch notifications strictly AFTER transaction commits
    await dispatchPostCommitNotifications(pendingNotifications);

    return {
      success: true,
      data: result,
    };
  } catch (err: unknown) {
    if (err instanceof DomainError) {
      return {
        success: false,
        error: {
          code: err.code,
          message: err.message,
          status: err.httpStatus,
          fieldErrors: err.fieldErrors,
        },
      };
    }
    return internalActionError(
      "submitForApprovalAction",
      err,
      "Failed to submit document for approval",
      caller.userId
    );
  }
}

// ============================================================================
// Action 2: Execute Approval Decision (Sign-off or Reject)
// ============================================================================

export async function executeApprovalDecisionAction(
  rawInput: unknown,
  context?: ActionCallerContext
): Promise<
  ActionResult<{
    stepId: string;
    stepStatus: string;
    cycleStatus: string;
    lifecycleState: string;
    isFinalStep: boolean;
  }>
> {
  const parsed = executeApprovalDecisionSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid approval decision parameters",
        status: 400,
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
    };
  }

  const caller = await resolveCaller(context);
  if (!caller) {
    return {
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required to execute approval decision",
        status: 401,
      },
    };
  }

  const input = parsed.data;
  const dbClient = resolveServerActionDb(context);

  try {
    const actorIp = await resolveCallerIp(context);
    const reauthKey = `reauth:${caller.userId}:${actorIp}`;

    // Check sign-off lockout (5 failed attempts in 15 minutes / 900,000 ms)
    const lockoutCheck = await checkDistributedRateLimit(
      reauthKey,
      5,
      900000,
      dbClient
    );
    if (!lockoutCheck.allowed) {
      return {
        success: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: `Too many failed password verification attempts. Sign-off locked for ${lockoutCheck.retryAfterSeconds} seconds.`,
          status: 429,
        },
      };
    }

    // 1. Password Re-Authentication Gate (REQ-FR-401)
    // Scrub reauthPassword from all logging and error output
    const reauthVerified = await verifySignOffPassword(
      caller.userId,
      input.reauthPassword,
      dbClient
    );

    if (!reauthVerified) {
      await consumeDistributedRateLimit(reauthKey, 5, 900000, dbClient);
      return {
        success: false,
        error: {
          code: "REAUTH_FAILED",
          message: "Password verification failed for sign-off (REQ-FR-401)",
          status: 401,
        },
      };
    }

    // Reset lockout on successful authentication
    await clearDistributedRateLimit(reauthKey, dbClient);

    // Resolve tenantId via security-definer workspace lookup when omitted
    const resolvedTenantId = await resolveActionTenantId(
      input.tenantId,
      caller,
      dbClient
    );
    if (!resolvedTenantId) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Active workspace tenant ID is required",
          status: 400,
        },
      };
    }

    let pendingNotifications: NotificationPayload[] = [];

    const result = await withTenantContext(
      resolvedTenantId,
      async (tx: TenantTransaction, tenantId: string) => {
        const actor = await assertActiveMembership(tx, tenantId, caller.userId);

        const serviceParams: ExecuteApprovalDecisionParams = {
          tenantId,
          actorUserId: actor.userId,
          actorRole: actor.role,
          actorIp,
          approvalStepId: input.approvalStepId,
          decision: input.decision,
          decisionIntent: input.decisionIntent,
          reauthVerified: true,
          expectedDocumentSha256: input.expectedDocumentSha256,
        };

        const serviceResult = await ApprovalService.executeApprovalDecision(
          tx,
          serviceParams
        );
        pendingNotifications = serviceResult.notifications;

        return {
          stepId: serviceResult.step.id,
          stepStatus: serviceResult.step.status,
          cycleStatus: serviceResult.cycle.status,
          lifecycleState: serviceResult.version.lifecycleState,
          isFinalStep: serviceResult.isFinalStep,
        };
      },
      dbClient
    );

    // Dispatch notifications strictly AFTER transaction commits
    await dispatchPostCommitNotifications(pendingNotifications);

    return {
      success: true,
      data: result,
    };
  } catch (err: unknown) {
    if (err instanceof DomainError) {
      return {
        success: false,
        error: {
          code: err.code,
          message: err.message,
          status: err.httpStatus,
          fieldErrors: err.fieldErrors,
        },
      };
    }
    return internalActionError(
      "executeApprovalDecisionAction",
      err,
      "Failed to execute approval decision",
      caller.userId
    );
  }
}

// ============================================================================
// Action 3: Recall Approval Workflow
// ============================================================================

export async function recallApprovalAction(
  rawInput: unknown,
  context?: ActionCallerContext
): Promise<
  ActionResult<{
    versionId: string;
    lifecycleState: string;
    cycleStatus: string;
  }>
> {
  const parsed = recallApprovalSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid recall parameters",
        status: 400,
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
    };
  }

  const caller = await resolveCaller(context);
  if (!caller) {
    return {
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required to recall approval workflow",
        status: 401,
      },
    };
  }

  const input = parsed.data;
  const dbClient = resolveServerActionDb(context);

  try {
    const resolvedTenantId = await resolveActionTenantId(
      input.tenantId,
      caller,
      dbClient
    );
    if (!resolvedTenantId) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Active workspace tenant ID is required",
          status: 400,
        },
      };
    }

    let pendingNotifications: NotificationPayload[] = [];

    const result = await withTenantContext(
      resolvedTenantId,
      async (tx: TenantTransaction, tenantId: string) => {
        const actor = await assertActiveMembership(tx, tenantId, caller.userId);

        const serviceParams: RecallApprovalParams = {
          tenantId,
          actorUserId: actor.userId,
          actorRole: actor.role,
          versionId: input.versionId,
          expectedRowVersion: input.expectedRowVersion,
          reason: input.reason,
        };

        const serviceResult = await ApprovalService.recallApproval(
          tx,
          serviceParams
        );
        pendingNotifications = serviceResult.notifications;

        return {
          versionId: serviceResult.version.id,
          lifecycleState: serviceResult.version.lifecycleState,
          cycleStatus: serviceResult.cycle.status,
        };
      },
      dbClient
    );

    await dispatchPostCommitNotifications(pendingNotifications);

    return {
      success: true,
      data: result,
    };
  } catch (err: unknown) {
    if (err instanceof DomainError) {
      return {
        success: false,
        error: {
          code: err.code,
          message: err.message,
          status: err.httpStatus,
          fieldErrors: err.fieldErrors,
        },
      };
    }
    return internalActionError(
      "recallApprovalAction",
      err,
      "Failed to recall approval workflow",
      caller.userId
    );
  }
}

// ============================================================================
// Action 4: Workspace Admin Approver Override (BR-APP-04)
// ============================================================================

export async function adminOverrideApproverAction(
  rawInput: unknown,
  context?: ActionCallerContext
): Promise<
  ActionResult<{
    stepId: string;
    previousApproverId: string;
    newApproverId: string;
  }>
> {
  const parsed = adminOverrideApproverSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid admin override parameters",
        status: 400,
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
    };
  }

  const caller = await resolveCaller(context);
  if (!caller) {
    return {
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required for admin override",
        status: 401,
      },
    };
  }

  const input = parsed.data;
  const dbClient = resolveServerActionDb(context);

  try {
    const resolvedTenantId = await resolveActionTenantId(
      input.tenantId,
      caller,
      dbClient
    );
    if (!resolvedTenantId) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Active workspace tenant ID is required",
          status: 400,
        },
      };
    }

    let pendingNotifications: NotificationPayload[] = [];

    const result = await withTenantContext(
      resolvedTenantId,
      async (tx: TenantTransaction, tenantId: string) => {
        const actor = await assertActiveMembership(tx, tenantId, caller.userId);

        const serviceParams: AdminOverrideApproverParams = {
          tenantId,
          actor,
          approvalStepId: input.approvalStepId,
          newApproverId: input.newApproverId,
          justification: input.justification,
        };

        const serviceResult = await ApprovalService.adminOverrideApprover(
          tx,
          serviceParams
        );
        pendingNotifications = serviceResult.notifications;

        return {
          stepId: serviceResult.step.id,
          previousApproverId: serviceResult.previousApproverId,
          newApproverId: serviceResult.newApproverId,
        };
      },
      dbClient
    );

    await dispatchPostCommitNotifications(pendingNotifications);

    return {
      success: true,
      data: result,
    };
  } catch (err: unknown) {
    if (err instanceof DomainError) {
      return {
        success: false,
        error: {
          code: err.code,
          message: err.message,
          status: err.httpStatus,
          fieldErrors: err.fieldErrors,
        },
      };
    }
    return internalActionError(
      "adminOverrideApproverAction",
      err,
      "Failed to execute admin approver override",
      caller.userId
    );
  }
}

// ============================================================================
// Page Context Resolution Action
// ============================================================================

export interface ApprovalsPageContextData {
  tenantId: string;
  tenantName: string;
  allowSingleAuthorOverride: boolean;
  currentUser: {
    id: string;
    name: string;
    email: string;
    role: WorkspaceRole;
  };
  availableApprovers: Array<{
    id: string;
    name: string;
    email: string;
    role: WorkspaceRole;
    status: MembershipStatus;
  }>;
}

export async function getApprovalsPageContextAction(
  tenantId?: string,
  context?: ActionCallerContext
): Promise<ActionResult<ApprovalsPageContextData>> {
  const caller = await resolveCaller(context);
  if (!caller) {
    return {
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required to access approvals page",
        status: 401,
      },
    };
  }

  const resolvedTenantId = tenantId || caller.tenantId;
  if (!resolvedTenantId) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Tenant context is required",
        status: 400,
      },
    };
  }

  const dbClient = resolveServerActionDb(context);

  try {
    return await withTenantContext(
      resolvedTenantId,
      async (tx, tId) => {
        const membership = await assertActiveMembership(tx, tId, caller.userId);

        const [approvalsCtx, currentUserRows] = await Promise.all([
          ApprovalService.getApprovalsContext(tx, tId),
          tx
            .select({
              name: users.name,
              email: users.email,
            })
            .from(users)
            .where(eq(users.id, caller.userId))
            .limit(1),
        ]);
        const currentUserRow = currentUserRows[0];

        return {
          success: true,
          data: {
            tenantId: tId,
            tenantName: approvalsCtx.tenantName,
            allowSingleAuthorOverride: approvalsCtx.allowSingleAuthorOverride,
            currentUser: {
              id: caller.userId,
              name: currentUserRow?.name || "Approver",
              email: currentUserRow?.email || "",
              role: membership.role as WorkspaceRole,
            },
            availableApprovers: approvalsCtx.availableApprovers,
          },
        };
      },
      dbClient
    );
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
    return internalActionError(
      "getApprovalsPageContextAction",
      error,
      "Failed to load approvals context",
      caller.userId
    );
  }
}
