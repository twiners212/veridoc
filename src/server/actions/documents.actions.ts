"use server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { withTenantContext, type TenantTransaction } from "@/db/context";
import { documents, documentVersions } from "@/db/schema";
import {
  getUserWorkspaces,
  resolveServerActionCaller,
  resolveServerActionDb,
  type ServerActionCallerContext,
} from "@/lib/auth/server";
import { createCorrelationId, logError } from "@/lib/logger";
import { computeDocumentSha256 } from "@/lib/crypto/crypto.service";
import {
  assertActiveMembership,
  assertCanCreateDocument,
  assertCanEditDocumentVersion,
} from "@/server/policies";
import { appendAuditLog } from "@/server/services/audit.service";
import { ApprovalService } from "@/server/services/approval.service";
import {
  getDocumentDetailInTx,
  listDocumentsInTx,
} from "@/server/services/document.service";
import type { ActionResult } from "@/types/actions";
import { DomainError } from "@/types/errors";
import type {
  CreateDocumentResult,
  UpdateDocumentVersionResult,
  CreateRevisionResult,
  ListDocumentsResult,
  DocumentDetailResult,
} from "@/types/documents";

export type ActionCallerContext = ServerActionCallerContext;

async function resolveCaller(context?: ActionCallerContext) {
  return await resolveServerActionCaller(context);
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

// ============================================================================
// Schemas
// ============================================================================

const createDocumentSchema = z
  .object({
    tenantId: z.string().uuid().optional(),
    title: z
      .string()
      .min(1, "Title is required")
      .max(200, "Title cannot exceed 200 characters"),
    documentNumber: z
      .string()
      .min(1, "Document number is required")
      .max(64, "Document number cannot exceed 64 characters")
      .optional(),
    documentCode: z
      .string()
      .min(1, "Document code is required")
      .max(64, "Document code cannot exceed 64 characters")
      .optional(),
    category: z.string().max(100).nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    contentFormat: z.enum(["MARKDOWN", "PDF"]).optional().default("MARKDOWN"),
    initialContent: z.string().optional(),
    markdownContent: z.string().optional(),
    targetAudienceGroupIds: z.array(z.string().uuid()).optional().default([]),
  })
  .refine((data) => data.documentNumber || data.documentCode, {
    message: "documentNumber or documentCode is required",
    path: ["documentNumber"],
  });

const updateDocumentVersionSchema = z
  .object({
    tenantId: z.string().uuid().optional(),
    documentId: z.string().uuid().optional(),
    versionId: z.string().uuid(),
    contentMarkdown: z.string().optional(),
    markdownContent: z.string().optional(),
    rowVersion: z.number().int().positive().optional(),
    expectedRowVersion: z.number().int().positive().optional(),
    title: z.string().min(1).max(200).optional(),
    confirmInvalidateApprovals: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.contentMarkdown !== undefined ||
      data.markdownContent !== undefined ||
      data.title !== undefined,
    {
      message: "contentMarkdown or title must be provided",
      path: ["contentMarkdown"],
    }
  )
  .refine(
    (data) =>
      data.rowVersion !== undefined || data.expectedRowVersion !== undefined,
    {
      message: "rowVersion or expectedRowVersion is required",
      path: ["rowVersion"],
    }
  );

const createRevisionSchema = z
  .object({
    tenantId: z.string().uuid().optional(),
    documentId: z.string().uuid().optional(),
    parentVersionId: z.string().uuid().optional(),
    sourceVersionId: z.string().uuid().optional(),
    changeType: z.enum(["MINOR", "MAJOR"]).optional(),
    revisionType: z.enum(["MINOR", "MAJOR"]).optional(),
    changeSummary: z.string().max(2000).optional(),
  })
  .refine((data) => data.parentVersionId || data.sourceVersionId, {
    message: "parentVersionId or sourceVersionId is required",
    path: ["parentVersionId"],
  })
  .refine((data) => data.changeType || data.revisionType, {
    message: "changeType or revisionType is required",
    path: ["changeType"],
  });

const listDocumentsSchema = z.object({
  tenantId: z.string().uuid().optional(),
  search: z.string().optional(),
  category: z.string().optional(),
  status: z
    .enum([
      "DRAFT",
      "PENDING_APPROVAL",
      "APPROVED",
      "PUBLISHED",
      "SUPERSEDED",
      "RETIRED",
    ])
    .optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  sortBy: z
    .enum(["updatedAt", "createdAt", "documentCode", "title"])
    .optional()
    .default("updatedAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
});

const getDocumentDetailSchema = z.union([
  z.string().uuid(),
  z.object({
    tenantId: z.string().uuid().optional(),
    documentId: z.string().uuid(),
  }),
]);

// ============================================================================
// Action 1: Create Document & Initial Draft Version
// ============================================================================

export async function createDocumentAction(
  rawInput: unknown,
  context?: ActionCallerContext
): Promise<ActionResult<CreateDocumentResult>> {
  const parsed = createDocumentSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid document creation parameters",
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
        message: "Authentication required to perform this action",
        status: 401,
      },
    };
  }

  const input = parsed.data;
  const tenantId = input.tenantId ?? caller.tenantId;
  if (!tenantId) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Active workspace tenant ID is required",
        status: 400,
      },
    };
  }

  const dbClient = resolveServerActionDb(context);

  try {
    return await withTenantContext(
      tenantId,
      async (tx: TenantTransaction) => {
        const actor = await assertActiveMembership(tx, tenantId, caller.userId);
        assertCanCreateDocument(actor);

        const code = (input.documentNumber ?? input.documentCode)!.trim().toUpperCase();

        // Check uniqueness of document code within tenant
        const [existing] = await tx
          .select({ id: documents.id })
          .from(documents)
          .where(and(eq(documents.tenantId, tenantId), eq(documents.documentCode, code)))
          .limit(1);

        if (existing) {
          throw new DomainError(
            "VALIDATION_ERROR",
            `Document with code '${code}' already exists in this workspace`,
            409
          );
        }

        // 1. Create document container
        const [doc] = await tx
          .insert(documents)
          .values({
            tenantId,
            documentCode: code,
            category: input.category ?? null,
            createdBy: actor.userId,
          })
          .returning();

        // 2. Compute canonical document digest for initial version
        const isPdf = input.contentFormat === "PDF";
        const initialContent = isPdf
          ? null
          : input.initialContent || input.markdownContent || "";
        const versionLabel = "v1.0";
        const documentSha256 = computeDocumentSha256({
          markdownContent: initialContent,
          fileSha256: null,
          metadata: {
            documentCode: code,
            tenantId,
            title: input.title,
            versionLabel,
          },
        });

        // 3. Create initial document version (v1.0, DRAFT, row_version = 1)
        const [version] = await tx
          .insert(documentVersions)
          .values({
            tenantId,
            documentId: doc.id,
            versionMajor: 1,
            versionMinor: 0,
            title: input.title,
            contentFormat: input.contentFormat,
            markdownContent: initialContent,
            lifecycleState: "DRAFT",
            authorId: actor.userId,
            rowVersion: 1,
            documentSha256,
          })
          .returning();

        // 4. Append audit logs
        await appendAuditLog(tx, {
          tenantId,
          eventType: "DOCUMENT_CREATED",
          entityType: "DOCUMENT",
          entityId: doc.id,
          actorUserId: actor.userId,
          actorRole: actor.role,
          payloadJson: {
            documentCode: code,
            title: input.title,
            category: input.category ?? null,
            description: input.description ?? null,
            targetAudienceGroupIds: input.targetAudienceGroupIds ?? [],
          },
        });

        await appendAuditLog(tx, {
          tenantId,
          eventType: "DOCUMENT_VERSION_CREATED",
          entityType: "DOCUMENT_VERSION",
          entityId: version.id,
          actorUserId: actor.userId,
          actorRole: actor.role,
          payloadJson: {
            documentId: doc.id,
            versionLabel,
            versionMajor: 1,
            versionMinor: 0,
            lifecycleState: "DRAFT",
            documentSha256,
          },
        });

        return {
          success: true,
          data: {
            documentId: doc.id,
            versionId: version.id,
          },
        };
      },
      dbClient
    );
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
      "createDocumentAction",
      err,
      "Failed to create document",
      caller.userId
    );
  }
}

// ============================================================================
// Action 2: Update Document Version (Draft Content & Concurrency Guard)
// ============================================================================

export async function updateDocumentVersionAction(
  rawInput: unknown,
  context?: ActionCallerContext
): Promise<ActionResult<UpdateDocumentVersionResult>> {
  const parsed = updateDocumentVersionSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid update parameters",
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
        message: "Authentication required to perform this action",
        status: 401,
      },
    };
  }

  const input = parsed.data;
  const dbClient = resolveServerActionDb(context);

  try {
    // Resolve tenantId via security-definer workspace lookup when omitted
    let resolvedTenantId = input.tenantId ?? caller.tenantId;
    if (!resolvedTenantId) {
      const workspaces = await getUserWorkspaces(caller.userId, dbClient);
      resolvedTenantId = workspaces[0]?.tenantId;
    }
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

    return await withTenantContext(
      resolvedTenantId,
      async (tx: TenantTransaction, tenantId: string) => {
        const actor = await assertActiveMembership(tx, tenantId, caller.userId);

        // 1. Select document version with row lock FOR UPDATE
        const [existing] = await tx
          .select()
          .from(documentVersions)
          .where(
            and(
              eq(documentVersions.tenantId, tenantId),
              eq(documentVersions.id, input.versionId)
            )
          )
          .for("update")
          .limit(1);

        if (!existing) {
          throw new DomainError("NOT_FOUND", "Document version not found", 404);
        }

        if (input.documentId && existing.documentId !== input.documentId) {
          throw new DomainError("NOT_FOUND", "Document version not found", 404);
        }

        // 2. Check actor edit authorization
        assertCanEditDocumentVersion(actor, {
          authorId: existing.authorId,
          lifecycleState: existing.lifecycleState,
        });

        let targetMinor = existing.versionMinor;
        let targetLifecycleState = existing.lifecycleState;

        // 3. Guard: Status check and Mid-Approval Invalidation (DEC-04, BR-APP-02)
        if (existing.lifecycleState !== "DRAFT") {
          if (existing.lifecycleState === "PENDING_APPROVAL") {
            if (input.confirmInvalidateApprovals !== true) {
              throw new DomainError(
                "INVALIDATION_CONFIRMATION_REQUIRED",
                "Editing a document version currently in approval requires explicit confirmation (DEC-04)",
                409
              );
            }

            // Invalidate active cycle and steps atomically
            await ApprovalService.invalidateActiveCycle(tx, {
              tenantId,
              versionId: existing.id,
              actorUserId: actor.userId,
              actorRole: actor.role,
              reason: "Document content edited mid-approval (DEC-04)",
            });

            targetMinor = existing.versionMinor + 1;
            targetLifecycleState = "DRAFT";

            await appendAuditLog(tx, {
              tenantId,
              eventType: "APPROVAL_INVALIDATED_BY_EDIT",
              entityType: "DOCUMENT_VERSION",
              entityId: existing.id,
              actorUserId: actor.userId,
              actorRole: actor.role,
              payloadJson: {
                reason: "Document content edited mid-approval",
                previousVersionMinor: existing.versionMinor,
                newVersionMinor: targetMinor,
                previousLifecycleState: "PENDING_APPROVAL",
                newLifecycleState: "DRAFT",
              },
            });
          } else {
            throw new DomainError(
              "VERSION_IMMUTABLE",
              `Version is immutable in state '${existing.lifecycleState}' (BR-VER-02)`,
              409
            );
          }
        }

        // 4. Guard: row_version must match input (optimistic concurrency guard)
        const expectedRowVersion = input.rowVersion ?? input.expectedRowVersion!;
        if (existing.rowVersion !== expectedRowVersion) {
          throw new DomainError(
            "CONCURRENT_MODIFICATION",
            `Document version was modified by another operation (expected row_version ${expectedRowVersion}, got ${existing.rowVersion})`,
            409
          );
        }

        // 5. Fetch documentCode for canonical hashing
        const [doc] = await tx
          .select({ documentCode: documents.documentCode })
          .from(documents)
          .where(
            and(
              eq(documents.tenantId, tenantId),
              eq(documents.id, existing.documentId)
            )
          )
          .limit(1);

        const newContent =
          input.contentMarkdown ??
          input.markdownContent ??
          existing.markdownContent;
        const newTitle = input.title ?? existing.title;
        const newRowVersion = existing.rowVersion + 1;
        const versionLabel = `v${existing.versionMajor}.${targetMinor}`;

        // 6. Recompute canonical document_sha256
        const newDigest = computeDocumentSha256({
          markdownContent: newContent,
          fileSha256: existing.fileSha256,
          metadata: {
            documentCode: doc?.documentCode ?? "",
            tenantId,
            title: newTitle,
            versionLabel,
          },
        });

        // 7. Update document_versions row
        const [updated] = await tx
          .update(documentVersions)
          .set({
            title: newTitle,
            markdownContent: newContent,
            versionMinor: targetMinor,
            lifecycleState: targetLifecycleState,
            rowVersion: newRowVersion,
            documentSha256: newDigest,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(documentVersions.tenantId, tenantId),
              eq(documentVersions.id, existing.id)
            )
          )
          .returning();

        // 8. Append audit event
        await appendAuditLog(tx, {
          tenantId,
          eventType: "DOCUMENT_VERSION_UPDATED",
          entityType: "DOCUMENT_VERSION",
          entityId: updated.id,
          actorUserId: actor.userId,
          actorRole: actor.role,
          payloadJson: {
            documentId: existing.documentId,
            previousRowVersion: existing.rowVersion,
            newRowVersion,
            documentSha256: newDigest,
            versionMinor: targetMinor,
            lifecycleState: targetLifecycleState,
          },
        });

        return {
          success: true,
          data: {
            versionId: updated.id,
            rowVersion: updated.rowVersion,
            documentSha256: newDigest,
            versionMinor: updated.versionMinor,
            lifecycleState: updated.lifecycleState,
          },
        };
      },
      dbClient
    );
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
      "updateDocumentVersionAction",
      err,
      "Failed to update document version",
      caller.userId
    );
  }
}

// ============================================================================
// Action 3: Create Revision (Clones Published Version to New Draft)
// ============================================================================

export async function createRevisionAction(
  rawInput: unknown,
  context?: ActionCallerContext
): Promise<ActionResult<CreateRevisionResult>> {
  const parsed = createRevisionSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid revision creation parameters",
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
        message: "Authentication required to perform this action",
        status: 401,
      },
    };
  }

  const input = parsed.data;
  const parentId = (input.parentVersionId ?? input.sourceVersionId)!;
  const changeType = (input.changeType ?? input.revisionType)!;
  const dbClient = resolveServerActionDb(context);

  try {
    // Resolve tenantId via security-definer workspace lookup when omitted
    let resolvedTenantId = input.tenantId ?? caller.tenantId;
    if (!resolvedTenantId) {
      const workspaces = await getUserWorkspaces(caller.userId, dbClient);
      resolvedTenantId = workspaces[0]?.tenantId;
    }
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

    return await withTenantContext(
      resolvedTenantId,
      async (tx: TenantTransaction, tenantId: string) => {
        const actor = await assertActiveMembership(tx, tenantId, caller.userId);
        assertCanCreateDocument(actor);

        // 1. Select parent version
        const [parentVersion] = await tx
          .select()
          .from(documentVersions)
          .where(
            and(
              eq(documentVersions.tenantId, tenantId),
              eq(documentVersions.id, parentId)
            )
          )
          .limit(1);

        if (!parentVersion) {
          throw new DomainError("NOT_FOUND", "Parent document version not found", 404);
        }

        if (input.documentId && parentVersion.documentId !== input.documentId) {
          throw new DomainError(
            "NOT_FOUND",
            "Parent version does not belong to specified document",
            404
          );
        }

        // 2. Guard: Parent must be PUBLISHED or APPROVED
        if (
          parentVersion.lifecycleState !== "PUBLISHED" &&
          parentVersion.lifecycleState !== "APPROVED"
        ) {
          throw new DomainError(
            "VALIDATION_ERROR",
            `New revision can only be created from a PUBLISHED or APPROVED version (current state: ${parentVersion.lifecycleState})`,
            400
          );
        }

        // 3. Compute next semantic version number
        let nextMajor: number;
        let nextMinor: number;

        if (changeType === "MAJOR") {
          nextMajor = parentVersion.versionMajor + 1;
          nextMinor = 0;
        } else {
          nextMajor = parentVersion.versionMajor;
          nextMinor = parentVersion.versionMinor + 1;
        }

        // Query existing versions with the same major to prevent duplicate version number
        const existingWithMajor = await tx
          .select({ versionMinor: documentVersions.versionMinor })
          .from(documentVersions)
          .where(
            and(
              eq(documentVersions.tenantId, tenantId),
              eq(documentVersions.documentId, parentVersion.documentId),
              eq(documentVersions.versionMajor, nextMajor)
            )
          );

        if (existingWithMajor.length > 0) {
          const maxMinor = Math.max(...existingWithMajor.map((v) => v.versionMinor));
          if (maxMinor >= nextMinor) {
            nextMinor = maxMinor + 1;
          }
        }

        const versionNumber = `v${nextMajor}.${nextMinor}`;

        // 4. Fetch documentCode for canonical hashing
        const [doc] = await tx
          .select({ documentCode: documents.documentCode })
          .from(documents)
          .where(
            and(
              eq(documents.tenantId, tenantId),
              eq(documents.id, parentVersion.documentId)
            )
          )
          .limit(1);

        // 5. Compute document SHA-256 for the new draft revision
        const digest = computeDocumentSha256({
          markdownContent: parentVersion.markdownContent,
          fileSha256: null,
          metadata: {
            documentCode: doc?.documentCode ?? "",
            tenantId,
            title: parentVersion.title,
            versionLabel: versionNumber,
          },
        });

        // 6. Insert new draft version
        const [newVersion] = await tx
          .insert(documentVersions)
          .values({
            tenantId,
            documentId: parentVersion.documentId,
            parentVersionId: parentVersion.id,
            versionMajor: nextMajor,
            versionMinor: nextMinor,
            title: parentVersion.title,
            contentFormat: parentVersion.contentFormat,
            markdownContent: parentVersion.markdownContent,
            fileStorageKey: null,
            fileMimeType: null,
            fileSizeBytes: null,
            fileSha256: null,
            documentSha256: digest,
            lifecycleState: "DRAFT",
            authorId: actor.userId,
            rowVersion: 1,
          })
          .returning();

        // 7. Append audit log
        await appendAuditLog(tx, {
          tenantId,
          eventType: "DOCUMENT_REVISION_CREATED",
          entityType: "DOCUMENT_VERSION",
          entityId: newVersion.id,
          actorUserId: actor.userId,
          actorRole: actor.role,
          payloadJson: {
            documentId: parentVersion.documentId,
            parentVersionId: parentVersion.id,
            changeType,
            versionNumber,
            versionMajor: nextMajor,
            versionMinor: nextMinor,
            changeSummary: input.changeSummary ?? null,
          },
        });

        return {
          success: true,
          data: {
            versionId: newVersion.id,
            versionNumber,
          },
        };
      },
      dbClient
    );
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
      "createRevisionAction",
      err,
      "Failed to create document revision",
      caller.userId
    );
  }
}

// ============================================================================
// Action 4: Query Actions (List & Detail with Visibility Enforcement)
// ============================================================================

export async function listDocumentsAction(
  rawFilters?: unknown,
  context?: ActionCallerContext
): Promise<ActionResult<ListDocumentsResult>> {
  const parsed = listDocumentsSchema.safeParse(rawFilters ?? {});
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid query filters",
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
        message: "Authentication required to perform this action",
        status: 401,
      },
    };
  }

  const filters = parsed.data;
  const tenantId = filters.tenantId ?? caller.tenantId;
  if (!tenantId) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Active workspace tenant ID is required",
        status: 400,
      },
    };
  }

  const dbClient = resolveServerActionDb(context);

  try {
    return await withTenantContext(
      tenantId,
      async (tx: TenantTransaction) => {
        const actor = await assertActiveMembership(tx, tenantId, caller.userId);
        const data = await listDocumentsInTx(tx, actor, tenantId, filters);
        return { success: true, data };
      },
      dbClient
    );
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
      "listDocumentsAction",
      err,
      "Failed to list documents",
      caller.userId
    );
  }
}

export async function getDocumentDetailAction(
  rawInput: unknown,
  context?: ActionCallerContext
): Promise<ActionResult<DocumentDetailResult>> {
  const parsed = getDocumentDetailSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid document identifier",
        status: 400,
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      },
    };
  }

  const caller = await resolveCaller(context);
  if (!caller) {
    return {
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required to perform this action",
        status: 401,
      },
    };
  }

  const documentId = typeof parsed.data === "string" ? parsed.data : parsed.data.documentId;
  const inputTenantId = typeof parsed.data === "object" ? parsed.data.tenantId : undefined;
  const dbClient = resolveServerActionDb(context);

  // Resolve tenantId via security-definer workspace lookup (never query RLS tables outside withTenantContext)
  let resolvedTenantId = inputTenantId ?? caller.tenantId;
  if (!resolvedTenantId) {
    const workspaces = await getUserWorkspaces(caller.userId, dbClient);
    resolvedTenantId = workspaces[0]?.tenantId;
  }
  if (!resolvedTenantId) {
    return {
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Document not found",
        status: 404,
      },
    };
  }

  try {
    return await withTenantContext(
      resolvedTenantId,
      async (tx: TenantTransaction, tenantId: string) => {
        const actor = await assertActiveMembership(tx, tenantId, caller.userId);
        const data = await getDocumentDetailInTx(tx, actor, tenantId, documentId);
        return { success: true, data };
      },
      dbClient
    );
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
      "getDocumentDetailAction",
      err,
      "Failed to get document detail",
      caller.userId
    );
  }
}
