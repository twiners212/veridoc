"use server";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { withTenantContext } from "@/db/context";
import { documentVersions, documents, readAssignments, users } from "@/db/schema";
import {
  resolveServerActionCaller,
  resolveServerActionDb,
  resolveServerActionIp,
  type ServerActionCallerContext,
} from "@/lib/auth/server";
import { assertActiveMembership } from "@/server/policies/membership.policy";
import {
  assertCanPublishDocument,
  assertCanRetireDocument,
  assertCanViewCompletionDashboard,
} from "@/server/policies/rbac.policy";
import { ReaderService } from "@/server/services/reader.service";
import {
  dispatchPostCommitNotifications,
  type NotificationPayload,
} from "@/server/services/notification.service";
import type { ActionResult } from "@/types/actions";
import { DomainError } from "@/types/errors";
import type {
  PublishDocumentVersionResult,
  RetireDocumentVersionResult,
  AcknowledgeDocumentResult,
  ReadQueueResponse,
  GovernanceDashboardData,
} from "@/types/reader";

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

function handleReaderActionError<T>(
  actionName: string,
  error: unknown,
  fallbackMessage: string
): ActionResult<T> {
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

  const correlationId = randomUUID();
  console.error(`[${actionName}] Internal error (correlationId=${correlationId}):`, error);
  return {
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: `${fallbackMessage} (reference: ${correlationId})`,
      status: 500,
    },
  };
}

// ============================================================================
// Zod Schemas
// ============================================================================

const publishDocumentVersionSchema = z.object({
  tenantId: z.string().uuid().optional(),
  versionId: z.string().uuid(),
  expectedRowVersion: z.number().int().positive().optional(),
  targetGroupIds: z
    .array(z.string().uuid())
    .min(1, "At least one target audience group is required"),
  acknowledgmentDueDays: z.number().int().min(1).max(90).optional().default(14),
  effectiveDate: z.string().optional(),
});

const retireDocumentVersionSchema = z.object({
  tenantId: z.string().uuid().optional(),
  versionId: z.string().uuid(),
  expectedRowVersion: z.number().int().positive().optional(),
  reason: z
    .string()
    .min(5, "Retire reason must be at least 5 characters")
    .max(1000, "Retire reason cannot exceed 1000 characters"),
});

const acknowledgeDocumentSchema = z.object({
  tenantId: z.string().uuid().optional(),
  readAssignmentId: z.string().uuid(),
  documentVersionId: z.string().uuid(),
  dwellTimeSeconds: z.number().int().min(0),
  maxScrollPercent: z.number().int().min(0).max(100),
  bindingConfirmation: z.literal(true, {
    errorMap: () => ({
      message: "Explicit binding confirmation is required",
    }),
  }),
  expectedDocumentSha256: z.string().length(64).optional(),
});

const getMyReadQueueSchema = z.object({
  tenantId: z.string().uuid().optional(),
  status: z.enum(["PENDING", "COMPLETED"]).optional(),
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(100).optional().default(20),
});

const getGovernanceDashboardDataSchema = z.object({
  tenantId: z.string().uuid().optional(),
  documentId: z.string().uuid().optional(),
  groupId: z.string().uuid().optional(),
  overdueOnly: z.boolean().optional(),
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(100).optional().default(20),
});

// ============================================================================
// Server Action: publishDocumentVersionAction
// ============================================================================

export async function publishDocumentVersionAction(
  rawInput: unknown,
  context?: ActionCallerContext
): Promise<ActionResult<PublishDocumentVersionResult>> {
  const parsed = publishDocumentVersionSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid publication parameters",
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
        message: "Authentication required to publish document version",
        status: 401,
      },
    };
  }

  const effectiveTenantId = parsed.data.tenantId || caller.tenantId;
  if (!effectiveTenantId) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Tenant ID is required",
        status: 400,
      },
    };
  }

  const callerIp = await resolveCallerIp(context);
  const clientDb = resolveServerActionDb(context);

  try {
    let pendingNotifications: NotificationPayload[] = [];

    const result = await withTenantContext(
      effectiveTenantId,
      async (tx, tenantId) => {
        const membership = await assertActiveMembership(
          tx,
          tenantId,
          caller.userId
        );
        assertCanPublishDocument(membership);

        const publishedResult = await ReaderService.publishDocumentVersion(tx, {
          tenantId,
          actorUserId: caller.userId,
          actorRole: membership.role,
          actorIp: callerIp,
          versionId: parsed.data.versionId,
          expectedRowVersion: parsed.data.expectedRowVersion,
          targetGroupIds: parsed.data.targetGroupIds,
          acknowledgmentDueDays: parsed.data.acknowledgmentDueDays,
          effectiveDate: parsed.data.effectiveDate,
        });

        if (publishedResult.assignedCount > 0) {
          const [versionMeta] = await tx
            .select({
              title: documentVersions.title,
              versionLabel: documentVersions.versionLabel,
              versionMajor: documentVersions.versionMajor,
              versionMinor: documentVersions.versionMinor,
              documentCode: documents.documentCode,
            })
            .from(documentVersions)
            .innerJoin(
              documents,
              and(
                eq(documents.id, documentVersions.documentId),
                eq(documents.tenantId, documentVersions.tenantId)
              )
            )
            .where(
              and(
                eq(documentVersions.tenantId, tenantId),
                eq(documentVersions.id, publishedResult.versionId)
              )
            )
            .limit(1);

          const readerRows = await tx
            .select({
              email: users.email,
              dueAt: readAssignments.dueAt,
            })
            .from(readAssignments)
            .innerJoin(users, eq(readAssignments.userId, users.id))
            .where(
              and(
                eq(readAssignments.tenantId, tenantId),
                eq(readAssignments.documentVersionId, publishedResult.versionId),
                eq(readAssignments.status, "PENDING")
              )
            );

          const versionLabel =
            versionMeta?.versionLabel ||
            (versionMeta
              ? `v${versionMeta.versionMajor}.${versionMeta.versionMinor}`
              : "");
          const title = versionMeta?.title || "Published Document";
          const subject = versionLabel
            ? `Required Reading: ${title} (${versionLabel})`
            : `Required Reading: ${title}`;

          pendingNotifications = readerRows
            .map((row) => ({
              email: row.email?.trim() ?? "",
              dueAt: row.dueAt,
            }))
            .filter(
              (row) =>
                row.email.length > 0 &&
                /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)
            )
            .map((row) => ({
              to: row.email,
              subject,
              template: "DOCUMENT_PUBLISHED_READ_ASSIGNED",
              variables: {
                documentId: publishedResult.documentId,
                documentCode: versionMeta?.documentCode,
                versionId: publishedResult.versionId,
                versionLabel,
                title,
                dueAt: row.dueAt.toISOString(),
                effectiveDate: publishedResult.effectiveDate,
              },
            }));
        }

        return publishedResult;
      },
      clientDb
    );

    // Dispatch notifications strictly AFTER transaction commits
    await dispatchPostCommitNotifications(pendingNotifications);

    return { success: true, data: result };
  } catch (error: unknown) {
    return handleReaderActionError(
      "publishDocumentVersionAction",
      error,
      "An unexpected error occurred while publishing the document version."
    );
  }
}

// ============================================================================
// Server Action: retireDocumentVersionAction
// ============================================================================

export async function retireDocumentVersionAction(
  rawInput: unknown,
  context?: ActionCallerContext
): Promise<ActionResult<RetireDocumentVersionResult>> {
  const parsed = retireDocumentVersionSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid retirement parameters",
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
        message: "Authentication required to retire document version",
        status: 401,
      },
    };
  }

  const effectiveTenantId = parsed.data.tenantId || caller.tenantId;
  if (!effectiveTenantId) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Tenant ID is required",
        status: 400,
      },
    };
  }

  const callerIp = await resolveCallerIp(context);
  const clientDb = resolveServerActionDb(context);

  try {
    return await withTenantContext(
      effectiveTenantId,
      async (tx, tenantId) => {
        const membership = await assertActiveMembership(
          tx,
          tenantId,
          caller.userId
        );
        assertCanRetireDocument(membership);

        const result = await ReaderService.retireDocumentVersion(tx, {
          tenantId,
          actorUserId: caller.userId,
          actorRole: membership.role,
          actorIp: callerIp,
          versionId: parsed.data.versionId,
          expectedRowVersion: parsed.data.expectedRowVersion,
          reason: parsed.data.reason,
        });

        return { success: true, data: result };
      },
      clientDb
    );
  } catch (error: unknown) {
    return handleReaderActionError(
      "retireDocumentVersionAction",
      error,
      "An unexpected error occurred while retiring the document version."
    );
  }
}

// ============================================================================
// Server Action: acknowledgeDocumentAction
// ============================================================================

export async function acknowledgeDocumentAction(
  rawInput: unknown,
  context?: ActionCallerContext
): Promise<ActionResult<AcknowledgeDocumentResult>> {
  const parsed = acknowledgeDocumentSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid acknowledgment parameters",
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
        message: "Authentication required to acknowledge document",
        status: 401,
      },
    };
  }

  const effectiveTenantId = parsed.data.tenantId || caller.tenantId;
  if (!effectiveTenantId) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Tenant ID is required",
        status: 400,
      },
    };
  }

  const callerIp = await resolveCallerIp(context);
  const clientDb = resolveServerActionDb(context);

  try {
    return await withTenantContext(
      effectiveTenantId,
      async (tx, tenantId) => {
        const membership = await assertActiveMembership(
          tx,
          tenantId,
          caller.userId
        );

        const result = await ReaderService.acknowledgeDocument(tx, {
          tenantId,
          actorUserId: caller.userId,
          actorRole: membership.role,
          actorIp: callerIp,
          readAssignmentId: parsed.data.readAssignmentId,
          documentVersionId: parsed.data.documentVersionId,
          dwellTimeSeconds: parsed.data.dwellTimeSeconds,
          maxScrollPercent: parsed.data.maxScrollPercent,
          bindingConfirmation: parsed.data.bindingConfirmation,
          expectedDocumentSha256: parsed.data.expectedDocumentSha256,
        });

        return { success: true, data: result };
      },
      clientDb
    );
  } catch (error: unknown) {
    return handleReaderActionError(
      "acknowledgeDocumentAction",
      error,
      "An unexpected error occurred while recording acknowledgment."
    );
  }
}

// ============================================================================
// Server Action: getMyReadQueueAction
// ============================================================================

export async function getMyReadQueueAction(
  rawInput?: unknown,
  context?: ActionCallerContext
): Promise<ActionResult<ReadQueueResponse>> {
  const parsed = getMyReadQueueSchema.safeParse(rawInput ?? {});
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid query parameters",
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
        message: "Authentication required to view reading queue",
        status: 401,
      },
    };
  }

  const effectiveTenantId = parsed.data.tenantId || caller.tenantId;
  if (!effectiveTenantId) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Tenant ID is required",
        status: 400,
      },
    };
  }

  const clientDb = resolveServerActionDb(context);

  try {
    return await withTenantContext(
      effectiveTenantId,
      async (tx, tenantId) => {
        await assertActiveMembership(tx, tenantId, caller.userId);

        const result = await ReaderService.getMyReadQueue(tx, {
          tenantId,
          userId: caller.userId,
          status: parsed.data.status,
          page: parsed.data.page,
          limit: parsed.data.limit,
        });

        return { success: true, data: result };
      },
      clientDb
    );
  } catch (error: unknown) {
    return handleReaderActionError(
      "getMyReadQueueAction",
      error,
      "An unexpected error occurred while loading the reading queue."
    );
  }
}

// ============================================================================
// Server Action: getGovernanceDashboardDataAction
// ============================================================================

export async function getGovernanceDashboardDataAction(
  rawInput?: unknown,
  context?: ActionCallerContext
): Promise<ActionResult<GovernanceDashboardData>> {
  const parsed = getGovernanceDashboardDataSchema.safeParse(rawInput ?? {});
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid dashboard query parameters",
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
        message: "Authentication required to view governance dashboard",
        status: 401,
      },
    };
  }

  const effectiveTenantId = parsed.data.tenantId || caller.tenantId;
  if (!effectiveTenantId) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Tenant ID is required",
        status: 400,
      },
    };
  }

  const clientDb = resolveServerActionDb(context);

  try {
    return await withTenantContext(
      effectiveTenantId,
      async (tx, tenantId) => {
        const membership = await assertActiveMembership(
          tx,
          tenantId,
          caller.userId
        );
        assertCanViewCompletionDashboard(membership);

        const result = await ReaderService.getGovernanceDashboardData(tx, {
          tenantId,
          documentId: parsed.data.documentId,
          groupId: parsed.data.groupId,
          overdueOnly: parsed.data.overdueOnly,
          page: parsed.data.page,
          limit: parsed.data.limit,
        });

        return { success: true, data: result };
      },
      clientDb
    );
  } catch (error: unknown) {
    return handleReaderActionError(
      "getGovernanceDashboardDataAction",
      error,
      "An unexpected error occurred while loading dashboard data."
    );
  }
}
