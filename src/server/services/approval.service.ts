import "server-only";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { TenantTransaction } from "@/db/context";
import {
  tenants,
  tenantMemberships,
  documents,
  documentVersions,
  approvalCycles,
  approvalSteps,
  users,
} from "@/db/schema";
import { computeDocumentSha256 } from "@/lib/crypto/crypto.service";
import { appendAuditLog } from "@/server/services/audit.service";
import {
  assertCanSubmitWorkflowApprovers,
  assertCanApproveDocumentVersion,
  assertCanAdminReassignStep,
} from "@/server/policies/approval.policy";
import type { WorkspaceRole, ActiveMembership } from "@/server/policies/rbac.types";
import type {
  ApprovalQueueItem,
  ApprovalQueueStepItem,
} from "@/types/approvals";
import { DomainError } from "@/types/errors";
import type { MembershipStatus } from "@/types/roles";
import type { NotificationPayload } from "./notification.service";

// ============================================================================
// Service Parameter Interfaces
// ============================================================================

export interface SubmitForApprovalParams {
  tenantId: string;
  actorUserId: string;
  actorRole: WorkspaceRole;
  versionId: string;
  expectedRowVersion?: number;
  approverIds: string[];
}

export interface ExecuteApprovalDecisionParams {
  tenantId: string;
  actorUserId: string;
  actorRole: WorkspaceRole;
  actorIp?: string;
  approvalStepId: string;
  decision: "APPROVE" | "REJECT";
  decisionIntent: string;
  reauthVerified: boolean;
  expectedDocumentSha256?: string;
}

export interface RecallApprovalParams {
  tenantId: string;
  actorUserId: string;
  actorRole: WorkspaceRole;
  versionId: string;
  expectedRowVersion?: number;
  reason: string;
}

export interface AdminOverrideApproverParams {
  tenantId: string;
  actor: ActiveMembership;
  approvalStepId: string;
  newApproverId: string;
  justification: string;
}

export interface InvalidateActiveCycleParams {
  tenantId: string;
  versionId: string;
  actorUserId: string;
  actorRole: WorkspaceRole;
  reason: string;
}

export interface GetApprovalsQueueParams {
  tenantId: string;
  actorUserId: string;
  actorRole: WorkspaceRole;
  scope?: "active" | "upcoming";
  page?: number;
  limit?: number;
  search?: string;
}

export interface GetApprovalsQueueResult {
  items: ApprovalQueueItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ApprovalsContextSnapshot {
  tenantId: string;
  tenantName: string;
  allowSingleAuthorOverride: boolean;
  availableApprovers: Array<{
    id: string;
    name: string;
    email: string;
    role: WorkspaceRole;
    status: MembershipStatus;
  }>;
}

export class ApprovalService {
  private static async resolveRecipientEmail(
    tx: TenantTransaction,
    userId: string
  ): Promise<string | null> {
    const [recipient] = await tx
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const email = recipient?.email?.trim();
    return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
  }

  /**
   * Submits a DRAFT document version for sequential approval review.
   * Locks document_versions FOR UPDATE, validates sequential approvers (1..10, no consecutive duplicates),
   * enforces BR-APP-01 (DEC-03), computes & freezes canonical SHA-256 (DEC-06),
   * creates approval_cycles (IN_PROGRESS) + approval_steps (1=PENDING, 2..N=WAITING),
   * transitions version to PENDING_APPROVAL, and appends WORKFLOW_SUBMITTED audit log.
   */
  static async submitForApproval(
    tx: TenantTransaction,
    params: SubmitForApprovalParams
  ) {
    const {
      tenantId,
      actorUserId,
      actorRole,
      versionId,
      expectedRowVersion,
      approverIds,
    } = params;

    // 1. Validate approver list length (1..10) and no consecutive duplicates
    if (!approverIds || approverIds.length < 1 || approverIds.length > 10) {
      throw new DomainError(
        "VALIDATION_ERROR",
        "Approval workflow must contain between 1 and 10 approvers",
        400
      );
    }

    for (let i = 1; i < approverIds.length; i++) {
      if (approverIds[i] === approverIds[i - 1]) {
        throw new DomainError(
          "VALIDATION_ERROR",
          "Approver list cannot contain consecutive duplicate approvers (BR-SEQ-03)",
          400
        );
      }
    }

    // 2. Lock document_versions row FOR UPDATE
    const [version] = await tx
      .select()
      .from(documentVersions)
      .where(
        and(
          eq(documentVersions.tenantId, tenantId),
          eq(documentVersions.id, versionId)
        )
      )
      .for("update")
      .limit(1);

    if (!version) {
      throw new DomainError("NOT_FOUND", "Document version not found", 404);
    }

    // Author check: Authors can only submit versions they authored
    if (actorRole === "DOCUMENT_AUTHOR" && version.authorId !== actorUserId) {
      throw new DomainError(
        "FORBIDDEN",
        "Document Authors can only submit document versions they authored",
        403
      );
    }

    // Status check: Must be in DRAFT state
    if (version.lifecycleState !== "DRAFT") {
      throw new DomainError(
        "APPROVAL_CYCLE_INVALIDATED",
        `Only DRAFT versions can be submitted for approval (current: ${version.lifecycleState})`,
        409
      );
    }

    // Optimistic concurrency check
    if (
      expectedRowVersion !== undefined &&
      version.rowVersion !== expectedRowVersion
    ) {
      throw new DomainError(
        "CONCURRENT_MODIFICATION",
        `Version conflict: expected row version ${expectedRowVersion}, got ${version.rowVersion}`,
        409
      );
    }

    // Content completeness check
    const hasMarkdown = !!version.markdownContent && version.markdownContent.trim().length > 0;
    const hasPdf = !!version.fileSha256 && !!version.fileStorageKey;
    if (!hasMarkdown && !hasPdf) {
      throw new DomainError(
        "VALIDATION_ERROR",
        "Document version must have content (Markdown or PDF) before submitting for approval",
        400
      );
    }

    // 3. Check tenant settings for single-author override (BR-APP-01, DEC-03)
    const [tenant] = await tx
      .select({
        allowSingleAuthorOverride: tenants.allowSingleAuthorOverride,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    const allowOverride = !!tenant?.allowSingleAuthorOverride;

    // Enforce separation of duties on workflow submission
    assertCanSubmitWorkflowApprovers(version.authorId, approverIds, {
      allowSingleAuthorOverride: allowOverride,
    });

    // 4. Validate all approver users are ACTIVE members with approval-capable roles
    const memberships = await tx
      .select({
        userId: tenantMemberships.userId,
        role: tenantMemberships.role,
        status: tenantMemberships.status,
      })
      .from(tenantMemberships)
      .where(
        and(
          eq(tenantMemberships.tenantId, tenantId),
          inArray(tenantMemberships.userId, approverIds)
        )
      );

    const membershipMap = new Map(memberships.map((m) => [m.userId, m]));
    for (const approverId of approverIds) {
      const membership = membershipMap.get(approverId);
      if (!membership || membership.status !== "ACTIVE") {
        throw new DomainError(
          "VALIDATION_ERROR",
          `Approver user ${approverId} is not an active member of this workspace`,
          400
        );
      }
      const isEligibleRole =
        membership.role === "WORKSPACE_ADMIN" ||
        membership.role === "QUALITY_MANAGER" ||
        membership.role === "APPROVER_REVIEWER";
      if (!isEligibleRole) {
        throw new DomainError(
          "FORBIDDEN",
          `Approver user ${approverId} does not hold an approval-capable role`,
          403
        );
      }
    }

    // 5. Fetch document metadata for canonical SHA-256 digest
    const [doc] = await tx
      .select({ documentCode: documents.documentCode })
      .from(documents)
      .where(
        and(
          eq(documents.tenantId, tenantId),
          eq(documents.id, version.documentId)
        )
      )
      .limit(1);

    if (!doc) {
      throw new DomainError("NOT_FOUND", "Parent document not found", 404);
    }

    const versionLabel = `v${version.versionMajor}.${version.versionMinor}`;
    const canonicalSha256 = computeDocumentSha256({
      markdownContent: version.markdownContent,
      fileSha256: version.fileSha256,
      metadata: {
        documentCode: doc.documentCode,
        tenantId,
        title: version.title,
        versionLabel,
      },
    });

    // 6. Query next cycle number for this version
    const [maxCycle] = await tx
      .select({
        maxNum: sql<number>`coalesce(max(${approvalCycles.cycleNumber}), 0)::int`,
      })
      .from(approvalCycles)
      .where(
        and(
          eq(approvalCycles.tenantId, tenantId),
          eq(approvalCycles.documentVersionId, version.id)
        )
      );
    const nextCycleNumber = (maxCycle?.maxNum ?? 0) + 1;

    // 7. Insert approval_cycles record
    const [cycle] = await tx
      .insert(approvalCycles)
      .values({
        tenantId,
        documentVersionId: version.id,
        cycleNumber: nextCycleNumber,
        submittedBy: actorUserId,
        submittedSha256: canonicalSha256,
        status: "IN_PROGRESS",
        allowSelfApprovalOverride: allowOverride,
      })
      .returning();

    // 8. Insert ordered approval_steps (Step 1 = PENDING, Steps 2..N = WAITING)
    const stepInserts = approverIds.map((approverId, index) => ({
      tenantId,
      approvalCycleId: cycle.id,
      stepOrder: index + 1,
      assignedApproverId: approverId,
      status: (index === 0 ? "PENDING" : "WAITING") as "PENDING" | "WAITING",
    }));

    const createdSteps = await tx
      .insert(approvalSteps)
      .values(stepInserts)
      .returning();

    // 9. Transition document_versions to PENDING_APPROVAL and bind canonicalSha256
    const [updatedVersion] = await tx
      .update(documentVersions)
      .set({
        lifecycleState: "PENDING_APPROVAL",
        documentSha256: canonicalSha256,
        rowVersion: version.rowVersion + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(documentVersions.tenantId, tenantId),
          eq(documentVersions.id, version.id)
        )
      )
      .returning();

    // 10. Append hash-chained audit log
    await appendAuditLog(tx, {
      tenantId,
      eventType: "WORKFLOW_SUBMITTED",
      entityType: "DOCUMENT_VERSION",
      entityId: version.id,
      actorUserId,
      actorRole,
      payloadJson: {
        cycleId: cycle.id,
        cycleNumber: nextCycleNumber,
        documentSha256: canonicalSha256,
        approverIds,
        stepCount: approverIds.length,
      },
    });

    const firstApproverEmail = await ApprovalService.resolveRecipientEmail(
      tx,
      approverIds[0]
    );
    const notifications: NotificationPayload[] = firstApproverEmail
      ? [
          {
            to: firstApproverEmail,
            subject: `Approval Required: ${version.title} (${versionLabel})`,
            template: "APPROVAL_REQUESTED",
            variables: {
              documentId: version.documentId,
              versionId: version.id,
              cycleId: cycle.id,
              stepOrder: 1,
              title: version.title,
            },
          },
        ]
      : [];

    return {
      cycle,
      steps: createdSteps,
      version: updatedVersion,
      documentSha256: canonicalSha256,
      notifications,
    };
  }

  /**
   * Executes an approval sign-off decision (APPROVE or REJECT).
   * Verifies Better Auth password re-authentication (REQ-FR-401),
   * locks document_versions, approval_cycles, and approval_steps FOR UPDATE,
   * enforces active sequential step (409 APPROVAL_STEP_NOT_ACTIVE),
   * enforces separation of duties (403 SELF_APPROVAL_PROHIBITED unless allow_self_approval_override = true),
   * verifies canonical SHA-256 digest integrity (422 INTEGRITY_HASH_MISMATCH),
   * records immutable sign-off metadata (REQ-FR-402),
   * advances to next sequential step or finalizes APPROVED / DRAFT state,
   * and appends hash-chained audit logs.
   */
  static async executeApprovalDecision(
    tx: TenantTransaction,
    params: ExecuteApprovalDecisionParams
  ) {
    const {
      tenantId,
      actorUserId,
      actorRole,
      actorIp,
      approvalStepId,
      decision,
      decisionIntent,
      reauthVerified,
      expectedDocumentSha256,
    } = params;

    // 1. Verify re-authentication gate (REQ-FR-401)
    if (!reauthVerified) {
      throw new DomainError(
        "REAUTH_FAILED",
        "Password verification failed for sign-off (REQ-FR-401)",
        401
      );
    }

    if (!decisionIntent || decisionIntent.trim().length < 5) {
      throw new DomainError(
        "VALIDATION_ERROR",
        "Decision intent is mandatory and must be at least 5 characters (REQ-FR-402)",
        400
      );
    }

    // 2. Lookup initial step and cycle to identify document version
    const [initialStep] = await tx
      .select({
        id: approvalSteps.id,
        approvalCycleId: approvalSteps.approvalCycleId,
        documentVersionId: approvalCycles.documentVersionId,
      })
      .from(approvalSteps)
      .innerJoin(
        approvalCycles,
        and(
          eq(approvalCycles.id, approvalSteps.approvalCycleId),
          eq(approvalCycles.tenantId, approvalSteps.tenantId)
        )
      )
      .where(
        and(
          eq(approvalSteps.tenantId, tenantId),
          eq(approvalSteps.id, approvalStepId)
        )
      )
      .limit(1);

    if (!initialStep) {
      throw new DomainError("NOT_FOUND", "Approval step not found", 404);
    }

    // 3. Acquire FOR UPDATE locks in strict top-down hierarchy: version -> cycle -> step
    const [version] = await tx
      .select()
      .from(documentVersions)
      .where(
        and(
          eq(documentVersions.tenantId, tenantId),
          eq(documentVersions.id, initialStep.documentVersionId)
        )
      )
      .for("update")
      .limit(1);

    if (!version) {
      throw new DomainError("NOT_FOUND", "Document version not found", 404);
    }

    const [cycle] = await tx
      .select()
      .from(approvalCycles)
      .where(
        and(
          eq(approvalCycles.tenantId, tenantId),
          eq(approvalCycles.id, initialStep.approvalCycleId)
        )
      )
      .for("update")
      .limit(1);

    if (!cycle) {
      throw new DomainError("NOT_FOUND", "Approval cycle not found", 404);
    }

    const [step] = await tx
      .select()
      .from(approvalSteps)
      .where(
        and(
          eq(approvalSteps.tenantId, tenantId),
          eq(approvalSteps.id, approvalStepId)
        )
      )
      .for("update")
      .limit(1);

    if (!step) {
      throw new DomainError("NOT_FOUND", "Approval step not found", 404);
    }

    // 4. Validate cycle and version state
    if (cycle.status !== "IN_PROGRESS") {
      throw new DomainError(
        "APPROVAL_CYCLE_INVALIDATED",
        `Approval cycle is no longer active (current status: ${cycle.status})`,
        409
      );
    }

    if (version.lifecycleState !== "PENDING_APPROVAL") {
      throw new DomainError(
        "APPROVAL_CYCLE_INVALIDATED",
        `Document version is in '${version.lifecycleState}' state, not PENDING_APPROVAL`,
        409
      );
    }

    // 5. Enforce active sequential step (BR-SEQ-02)
    if (step.status !== "PENDING") {
      throw new DomainError(
        "APPROVAL_STEP_NOT_ACTIVE",
        `Approval step order ${step.stepOrder} is currently in '${step.status}' status, not PENDING (BR-SEQ-02)`,
        409
      );
    }

    // 6. Verify assigned approver identity
    if (step.assignedApproverId !== actorUserId) {
      throw new DomainError(
        "FORBIDDEN",
        "You are not the assigned approver for this active approval step",
        403
      );
    }

    // 7. Enforce live RBAC capability and Separation of Duties (DEC-03, BR-APP-01)
    assertCanApproveDocumentVersion(
      {
        id: "",
        tenantId,
        userId: actorUserId,
        role: actorRole,
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      version.authorId,
      { allowSingleAuthorOverride: cycle.allowSelfApprovalOverride }
    );

    const selfApprovalOverrideUsed =
      actorUserId === version.authorId && cycle.allowSelfApprovalOverride;

    // 8. Recompute & verify canonical SHA-256 digest (DEC-06)
    const [doc] = await tx
      .select({ documentCode: documents.documentCode })
      .from(documents)
      .where(
        and(
          eq(documents.tenantId, tenantId),
          eq(documents.id, version.documentId)
        )
      )
      .limit(1);

    const versionLabel = `v${version.versionMajor}.${version.versionMinor}`;
    const recomputedSha256 = computeDocumentSha256({
      markdownContent: version.markdownContent,
      fileSha256: version.fileSha256,
      metadata: {
        documentCode: doc?.documentCode ?? "",
        tenantId,
        title: version.title,
        versionLabel,
      },
    });

    if (
      recomputedSha256 !== version.documentSha256 ||
      recomputedSha256 !== cycle.submittedSha256 ||
      (expectedDocumentSha256 && expectedDocumentSha256 !== recomputedSha256)
    ) {
      throw new DomainError(
        "INTEGRITY_HASH_MISMATCH",
        "Document content digest does not match frozen approval submission digest (DEC-06)",
        422
      );
    }

    // 9. Fetch actor full name for immutable sign-off completeness check constraint
    const [actorUser] = await tx
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, actorUserId))
      .limit(1);

    const actedByFullName =
      actorUser?.name && actorUser.name.trim().length > 0
        ? actorUser.name.trim()
        : actorUser?.email || "Verified Approver";

    const now = new Date();
    const notifications: NotificationPayload[] = [];

    // 10. Execute Decision
    if (decision === "APPROVE") {
      // A. Update current step to APPROVED with full sign-off metadata (REQ-FR-402)
      const [updatedStep] = await tx
        .update(approvalSteps)
        .set({
          status: "APPROVED",
          actedByUserId: actorUserId,
          actedByFullName,
          actedByRole: actorRole,
          actedIpAddress: actorIp || "127.0.0.1",
          authMethod: "PASSWORD",
          signedDocumentSha256: recomputedSha256,
          decisionIntent: decisionIntent.trim(),
          selfApprovalOverrideUsed,
          actedAt: now,
        })
        .where(
          and(
            eq(approvalSteps.tenantId, tenantId),
            eq(approvalSteps.id, step.id)
          )
        )
        .returning();

      // Log self-approval override if used
      if (selfApprovalOverrideUsed) {
        await appendAuditLog(tx, {
          tenantId,
          eventType: "SELF_APPROVAL_OVERRIDE_USED",
          entityType: "APPROVAL_STEP",
          entityId: step.id,
          actorUserId,
          actorRole,
          payloadJson: {
            cycleId: cycle.id,
            documentVersionId: version.id,
            stepOrder: step.stepOrder,
          },
        });
      }

      // B. Check for next sequential step
      const [nextStep] = await tx
        .select()
        .from(approvalSteps)
        .where(
          and(
            eq(approvalSteps.tenantId, tenantId),
            eq(approvalSteps.approvalCycleId, cycle.id),
            eq(approvalSteps.stepOrder, step.stepOrder + 1)
          )
        )
        .limit(1);

      if (nextStep) {
        // Activate next sequential step (WAITING -> PENDING)
        const [activatedStep] = await tx
          .update(approvalSteps)
          .set({ status: "PENDING" })
          .where(
            and(
              eq(approvalSteps.tenantId, tenantId),
              eq(approvalSteps.id, nextStep.id)
            )
          )
          .returning();

        // Append APPROVAL_GRANTED audit log
        await appendAuditLog(tx, {
          tenantId,
          eventType: "APPROVAL_GRANTED",
          entityType: "APPROVAL_STEP",
          entityId: step.id,
          actorUserId,
          actorRole,
          payloadJson: {
            cycleId: cycle.id,
            stepOrder: step.stepOrder,
            signedDocumentSha256: recomputedSha256,
            decisionIntent: decisionIntent.trim(),
            nextStepOrder: activatedStep.stepOrder,
            nextApproverId: activatedStep.assignedApproverId,
            isFinalStep: false,
          },
        });

        const nextApproverEmail = await ApprovalService.resolveRecipientEmail(
          tx,
          activatedStep.assignedApproverId
        );
        if (nextApproverEmail) {
          notifications.push({
            to: nextApproverEmail,
            subject: `Approval Required: ${version.title} (${versionLabel})`,
            template: "APPROVAL_REQUESTED",
            variables: {
              documentId: version.documentId,
              versionId: version.id,
              cycleId: cycle.id,
              stepOrder: activatedStep.stepOrder,
              title: version.title,
            },
          });
        }

        return {
          step: updatedStep,
          cycle,
          version,
          nextStep: activatedStep,
          isFinalStep: false,
          notifications,
        };
      } else {
        // C. Final approver sign-off! Close cycle and transition version to APPROVED
        const [closedCycle] = await tx
          .update(approvalCycles)
          .set({
            status: "APPROVED",
            closedAt: now,
          })
          .where(
            and(
              eq(approvalCycles.tenantId, tenantId),
              eq(approvalCycles.id, cycle.id)
            )
          )
          .returning();

        const [approvedVersion] = await tx
          .update(documentVersions)
          .set({
            lifecycleState: "APPROVED",
            rowVersion: version.rowVersion + 1,
            updatedAt: now,
          })
          .where(
            and(
              eq(documentVersions.tenantId, tenantId),
              eq(documentVersions.id, version.id)
            )
          )
          .returning();

        // Append APPROVAL_GRANTED for final step
        await appendAuditLog(tx, {
          tenantId,
          eventType: "APPROVAL_GRANTED",
          entityType: "APPROVAL_STEP",
          entityId: step.id,
          actorUserId,
          actorRole,
          payloadJson: {
            cycleId: cycle.id,
            stepOrder: step.stepOrder,
            signedDocumentSha256: recomputedSha256,
            decisionIntent: decisionIntent.trim(),
            isFinalStep: true,
          },
        });

        // Append DOCUMENT_APPROVED audit log
        await appendAuditLog(tx, {
          tenantId,
          eventType: "DOCUMENT_APPROVED",
          entityType: "DOCUMENT_VERSION",
          entityId: version.id,
          actorUserId,
          actorRole,
          payloadJson: {
            cycleId: cycle.id,
            cycleNumber: cycle.cycleNumber,
            documentSha256: recomputedSha256,
          },
        });

        const authorEmail = await ApprovalService.resolveRecipientEmail(
          tx,
          version.authorId
        );
        if (authorEmail) {
          notifications.push({
            to: authorEmail,
            subject: `Document Version Approved: ${version.title} (${versionLabel})`,
            template: "DOCUMENT_APPROVED",
            variables: {
              documentId: version.documentId,
              versionId: version.id,
              title: version.title,
              versionLabel,
            },
          });
        }

        return {
          step: updatedStep,
          cycle: closedCycle,
          version: approvedVersion,
          nextStep: null,
          isFinalStep: true,
          notifications,
        };
      }
    } else {
      // D. Decision === "REJECT": close cycle as REJECTED, mark subsequent steps SKIPPED, reset version to DRAFT
      const [rejectedStep] = await tx
        .update(approvalSteps)
        .set({
          status: "REJECTED",
          actedByUserId: actorUserId,
          actedByFullName,
          actedByRole: actorRole,
          actedIpAddress: actorIp || "127.0.0.1",
          authMethod: "PASSWORD",
          signedDocumentSha256: recomputedSha256,
          decisionIntent: decisionIntent.trim(),
          actedAt: now,
        })
        .where(
          and(
            eq(approvalSteps.tenantId, tenantId),
            eq(approvalSteps.id, step.id)
          )
        )
        .returning();

      // Skip remaining steps
      await tx
        .update(approvalSteps)
        .set({ status: "SKIPPED" })
        .where(
          and(
            eq(approvalSteps.tenantId, tenantId),
            eq(approvalSteps.approvalCycleId, cycle.id),
            sql`${approvalSteps.stepOrder} > ${step.stepOrder}`
          )
        );

      const [rejectedCycle] = await tx
        .update(approvalCycles)
        .set({
          status: "REJECTED",
          closedAt: now,
        })
        .where(
          and(
            eq(approvalCycles.tenantId, tenantId),
            eq(approvalCycles.id, cycle.id)
          )
        )
        .returning();

      const [resetVersion] = await tx
        .update(documentVersions)
        .set({
          lifecycleState: "DRAFT",
          rowVersion: version.rowVersion + 1,
          updatedAt: now,
        })
        .where(
          and(
            eq(documentVersions.tenantId, tenantId),
            eq(documentVersions.id, version.id)
          )
        )
        .returning();

      await appendAuditLog(tx, {
        tenantId,
        eventType: "APPROVAL_REJECTED",
        entityType: "DOCUMENT_VERSION",
        entityId: version.id,
        actorUserId,
        actorRole,
        payloadJson: {
          cycleId: cycle.id,
          stepId: step.id,
          stepOrder: step.stepOrder,
          rejectionReason: decisionIntent.trim(),
        },
      });

      const authorEmail = await ApprovalService.resolveRecipientEmail(
        tx,
        version.authorId
      );
      if (authorEmail) {
        notifications.push({
          to: authorEmail,
          subject: `Document Version Rejected: ${version.title} (${versionLabel})`,
          template: "APPROVAL_REJECTED",
          variables: {
            documentId: version.documentId,
            versionId: version.id,
            title: version.title,
            rejectionReason: decisionIntent.trim(),
          },
        });
      }

      return {
        step: rejectedStep,
        cycle: rejectedCycle,
        version: resetVersion,
        nextStep: null,
        isFinalStep: false,
        notifications,
      };
    }
  }

  /**
   * Recalls an in-progress approval workflow.
   * Allowed roles: submitting author, Quality Manager, Workspace Admin.
   * Atomically closes the active cycle as RECALLED, marks collected/pending steps INVALIDATED,
   * returns document version to DRAFT, and logs APPROVAL_RECALLED.
   */
  static async recallApproval(
    tx: TenantTransaction,
    params: RecallApprovalParams
  ) {
    const {
      tenantId,
      actorUserId,
      actorRole,
      versionId,
      expectedRowVersion,
      reason,
    } = params;

    // 1. Lock document_versions FOR UPDATE
    const [version] = await tx
      .select()
      .from(documentVersions)
      .where(
        and(
          eq(documentVersions.tenantId, tenantId),
          eq(documentVersions.id, versionId)
        )
      )
      .for("update")
      .limit(1);

    if (!version) {
      throw new DomainError("NOT_FOUND", "Document version not found", 404);
    }

    if (actorRole === "DOCUMENT_AUTHOR" && version.authorId !== actorUserId) {
      throw new DomainError(
        "FORBIDDEN",
        "Only the author, Quality Manager, or Workspace Admin can recall an approval workflow",
        403
      );
    }

    if (version.lifecycleState !== "PENDING_APPROVAL") {
      throw new DomainError(
        "APPROVAL_CYCLE_INVALIDATED",
        `Document version is in '${version.lifecycleState}' state, not PENDING_APPROVAL`,
        409
      );
    }

    if (
      expectedRowVersion !== undefined &&
      version.rowVersion !== expectedRowVersion
    ) {
      throw new DomainError(
        "CONCURRENT_MODIFICATION",
        `Version conflict: expected row version ${expectedRowVersion}, got ${version.rowVersion}`,
        409
      );
    }

    // 2. Lock active cycle FOR UPDATE
    const [cycle] = await tx
      .select()
      .from(approvalCycles)
      .where(
        and(
          eq(approvalCycles.tenantId, tenantId),
          eq(approvalCycles.documentVersionId, version.id),
          eq(approvalCycles.status, "IN_PROGRESS")
        )
      )
      .for("update")
      .limit(1);

    if (!cycle) {
      throw new DomainError(
        "APPROVAL_CYCLE_INVALIDATED",
        "No active approval cycle found for this document version",
        409
      );
    }

    const now = new Date();

    // 3. Close active cycle as RECALLED
    const [recalledCycle] = await tx
      .update(approvalCycles)
      .set({
        status: "RECALLED",
        invalidatedReason: reason,
        closedAt: now,
      })
      .where(
        and(
          eq(approvalCycles.tenantId, tenantId),
          eq(approvalCycles.id, cycle.id)
        )
      )
      .returning();

    // 4. Invalidate steps in cycle (never hard delete)
    await tx
      .update(approvalSteps)
      .set({ status: "INVALIDATED" })
      .where(
        and(
          eq(approvalSteps.tenantId, tenantId),
          eq(approvalSteps.approvalCycleId, cycle.id)
        )
      );

    // 5. Return document version to DRAFT
    const [resetVersion] = await tx
      .update(documentVersions)
      .set({
        lifecycleState: "DRAFT",
        rowVersion: version.rowVersion + 1,
        updatedAt: now,
      })
      .where(
        and(
          eq(documentVersions.tenantId, tenantId),
          eq(documentVersions.id, version.id)
        )
      )
      .returning();

    // 6. Append APPROVAL_RECALLED audit log
    await appendAuditLog(tx, {
      tenantId,
      eventType: "APPROVAL_RECALLED",
      entityType: "DOCUMENT_VERSION",
      entityId: version.id,
      actorUserId,
      actorRole,
      payloadJson: {
        cycleId: cycle.id,
        reason,
      },
    });

    return {
      version: resetVersion,
      cycle: recalledCycle,
      notifications: [],
    };
  }

  /**
   * Workspace Admin Approver Override (BR-APP-04).
   * WORKSPACE_ADMIN only. Mandatory justification. Enforces BR-APP-01 on new approver.
   * Records overridden_from_approver_id and logs ADMIN_APPROVER_OVERRIDE.
   */
  static async adminOverrideApprover(
    tx: TenantTransaction,
    params: AdminOverrideApproverParams
  ) {
    const {
      tenantId,
      actor,
      approvalStepId,
      newApproverId,
      justification,
    } = params;

    // 1. Role gate: WORKSPACE_ADMIN only
    if (actor.role !== "WORKSPACE_ADMIN") {
      throw new DomainError(
        "FORBIDDEN",
        "Only WORKSPACE_ADMIN can execute approver override (BR-APP-04)",
        403
      );
    }

    if (!justification || justification.trim().length < 5) {
      throw new DomainError(
        "VALIDATION_ERROR",
        "Override justification is mandatory and must be at least 5 characters (BR-APP-04)",
        400
      );
    }

    // 2. Lookup initial step and cycle to identify document version
    const [initialStep] = await tx
      .select({
        id: approvalSteps.id,
        approvalCycleId: approvalSteps.approvalCycleId,
        documentVersionId: approvalCycles.documentVersionId,
        stepOrder: approvalSteps.stepOrder,
      })
      .from(approvalSteps)
      .innerJoin(
        approvalCycles,
        and(
          eq(approvalCycles.id, approvalSteps.approvalCycleId),
          eq(approvalCycles.tenantId, approvalSteps.tenantId)
        )
      )
      .where(
        and(
          eq(approvalSteps.tenantId, tenantId),
          eq(approvalSteps.id, approvalStepId)
        )
      )
      .limit(1);

    if (!initialStep) {
      throw new DomainError("NOT_FOUND", "Approval step not found", 404);
    }

    // 3. Acquire FOR UPDATE locks in strict top-down hierarchy: version -> cycle -> step
    const [version] = await tx
      .select()
      .from(documentVersions)
      .where(
        and(
          eq(documentVersions.tenantId, tenantId),
          eq(documentVersions.id, initialStep.documentVersionId)
        )
      )
      .for("update")
      .limit(1);

    if (!version || version.lifecycleState !== "PENDING_APPROVAL") {
      throw new DomainError(
        "APPROVAL_CYCLE_INVALIDATED",
        "Document version is no longer pending approval",
        409
      );
    }

    const [cycle] = await tx
      .select()
      .from(approvalCycles)
      .where(
        and(
          eq(approvalCycles.tenantId, tenantId),
          eq(approvalCycles.id, initialStep.approvalCycleId)
        )
      )
      .for("update")
      .limit(1);

    if (!cycle || cycle.status !== "IN_PROGRESS") {
      throw new DomainError(
        "APPROVAL_CYCLE_INVALIDATED",
        "Approval cycle is no longer active",
        409
      );
    }

    const [step] = await tx
      .select()
      .from(approvalSteps)
      .where(
        and(
          eq(approvalSteps.tenantId, tenantId),
          eq(approvalSteps.id, approvalStepId)
        )
      )
      .for("update")
      .limit(1);

    if (!step) {
      throw new DomainError("NOT_FOUND", "Approval step not found", 404);
    }

    if (step.status !== "PENDING") {
      throw new DomainError(
        "APPROVAL_STEP_NOT_ACTIVE",
        `Can only execute override on an approval step currently in PENDING status (current: ${step.status})`,
        409
      );
    }

    // 4. Validate new approver eligibility and BR-APP-01
    const [newApproverMembership] = await tx
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
          eq(tenantMemberships.userId, newApproverId)
        )
      )
      .limit(1);

    if (!newApproverMembership || newApproverMembership.status !== "ACTIVE") {
      throw new DomainError(
        "VALIDATION_ERROR",
        "New approver must be an active member of this workspace",
        400
      );
    }

    // Enforce no consecutive duplicates (BR-SEQ-03)
    const surroundingSteps = await tx
      .select({
        stepOrder: approvalSteps.stepOrder,
        assignedApproverId: approvalSteps.assignedApproverId,
      })
      .from(approvalSteps)
      .where(
        and(
          eq(approvalSteps.tenantId, tenantId),
          eq(approvalSteps.approvalCycleId, cycle.id),
          inArray(approvalSteps.stepOrder, [step.stepOrder - 1, step.stepOrder + 1])
        )
      );

    for (const s of surroundingSteps) {
      if (s.assignedApproverId === newApproverId) {
        throw new DomainError(
          "VALIDATION_ERROR",
          "Reassigning to this approver creates consecutive duplicate approvers in the workflow (BR-SEQ-03)",
          400
        );
      }
    }

    assertCanAdminReassignStep(
      actor,
      newApproverMembership as ActiveMembership,
      version.authorId,
      { allowSingleAuthorOverride: cycle.allowSelfApprovalOverride }
    );

    // 5. Update assigned_approver_id and record overridden_from_approver_id
    const previousApproverId = step.assignedApproverId;
    const [updatedStep] = await tx
      .update(approvalSteps)
      .set({
        assignedApproverId: newApproverId,
        overriddenFromApproverId: previousApproverId,
      })
      .where(
        and(
          eq(approvalSteps.tenantId, tenantId),
          eq(approvalSteps.id, step.id)
        )
      )
      .returning();

    // 6. Append ADMIN_APPROVER_OVERRIDE audit log
    await appendAuditLog(tx, {
      tenantId,
      eventType: "ADMIN_APPROVER_OVERRIDE",
      entityType: "APPROVAL_STEP",
      entityId: step.id,
      actorUserId: actor.userId,
      actorRole: actor.role,
      payloadJson: {
        cycleId: cycle.id,
        stepOrder: step.stepOrder,
        previousApproverId,
        newApproverId,
        justification: justification.trim(),
      },
    });

    const newApproverEmail = await ApprovalService.resolveRecipientEmail(
      tx,
      newApproverId
    );
    const notifications: NotificationPayload[] = newApproverEmail
      ? [
          {
            to: newApproverEmail,
            subject: `Assigned as Approver (Admin Override): ${version.title}`,
            template: "ADMIN_OVERRIDE_ASSIGNED",
            variables: {
              documentId: version.documentId,
              versionId: version.id,
              stepOrder: step.stepOrder,
              title: version.title,
            },
          },
        ]
      : [];

    return {
      step: updatedStep,
      previousApproverId,
      newApproverId,
      notifications,
    };
  }

  /**
   * Helper for atomic mid-approval invalidation on edit (DEC-04, BR-APP-02).
   * Marks active approval_cycles and all associated steps INVALIDATED.
   */
  static async invalidateActiveCycle(
    tx: TenantTransaction,
    params: InvalidateActiveCycleParams
  ): Promise<{ invalidated: boolean; cycleId?: string }> {
    const { tenantId, versionId, actorUserId, actorRole, reason } = params;

    const activeCycles = await tx
      .select({ id: approvalCycles.id })
      .from(approvalCycles)
      .where(
        and(
          eq(approvalCycles.tenantId, tenantId),
          eq(approvalCycles.documentVersionId, versionId),
          eq(approvalCycles.status, "IN_PROGRESS")
        )
      )
      .for("update");

    if (activeCycles.length === 0) {
      return { invalidated: false };
    }

    const now = new Date();
    for (const cycle of activeCycles) {
      await tx
        .update(approvalCycles)
        .set({
          status: "INVALIDATED",
          invalidatedReason: reason,
          closedAt: now,
        })
        .where(eq(approvalCycles.id, cycle.id));

      await tx
        .update(approvalSteps)
        .set({ status: "INVALIDATED" })
        .where(eq(approvalSteps.approvalCycleId, cycle.id));
    }

    return { invalidated: true, cycleId: activeCycles[0].id };
  }

  /**
   * Fetches tenant approval configuration and workspace member roster for approver selection/override.
   */
  static async getApprovalsContext(
    tx: TenantTransaction,
    tenantId: string
  ): Promise<ApprovalsContextSnapshot> {
    const [tenant] = await tx
      .select({
        name: tenants.name,
        allowSingleAuthorOverride: tenants.allowSingleAuthorOverride,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    const members = await tx
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: tenantMemberships.role,
        status: tenantMemberships.status,
      })
      .from(tenantMemberships)
      .innerJoin(users, eq(tenantMemberships.userId, users.id))
      .where(eq(tenantMemberships.tenantId, tenantId));

    return {
      tenantId,
      tenantName: tenant?.name || "VeriDoc Workspace",
      allowSingleAuthorOverride: tenant?.allowSingleAuthorOverride ?? false,
      availableApprovers: members.map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        role: m.role as WorkspaceRole,
        status: m.status as MembershipStatus,
      })),
    };
  }

  /**
   * Fetches the paginated approval queue (active PENDING or upcoming WAITING steps)
   * with full bound metadata and sequential step history.
   */
  static async getApprovalsQueue(
    tx: TenantTransaction,
    params: GetApprovalsQueueParams
  ): Promise<GetApprovalsQueueResult> {
    const {
      tenantId,
      actorUserId,
      actorRole,
      scope = "active",
      search,
    } = params;
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 10));

    const allowedRoles: WorkspaceRole[] = [
      "WORKSPACE_ADMIN",
      "QUALITY_MANAGER",
      "APPROVER_REVIEWER",
    ];

    if (!allowedRoles.includes(actorRole)) {
      throw new DomainError(
        "FORBIDDEN",
        "Only approvers, quality managers, and admins can access the approvals queue",
        403
      );
    }

    const stepStatus = scope === "active" ? "PENDING" : "WAITING";

    const conditions = [
      eq(approvalSteps.tenantId, tenantId),
      eq(approvalSteps.status, stepStatus),
      eq(approvalCycles.status, "IN_PROGRESS"),
      eq(documentVersions.lifecycleState, "PENDING_APPROVAL"),
    ];

    // APPROVER_REVIEWER only sees items assigned to them
    if (actorRole === "APPROVER_REVIEWER") {
      conditions.push(eq(approvalSteps.assignedApproverId, actorUserId));
    }

    if (search && search.trim().length > 0) {
      const searchTerm = `%${search.trim()}%`;
      conditions.push(
        or(
          ilike(documents.documentCode, searchTerm),
          ilike(documentVersions.title, searchTerm)
        )!
      );
    }

    const assignedUser = alias(users, "assigned_user");
    const authorUser = alias(users, "author_user");
    const submitterUser = alias(users, "submitter_user");
    const approverMembership = alias(tenantMemberships, "approver_membership");

    const [countRow] = await tx
      .select({
        total: sql<number>`count(distinct ${approvalSteps.id})::int`,
      })
      .from(approvalSteps)
      .innerJoin(
        approvalCycles,
        and(
          eq(approvalSteps.approvalCycleId, approvalCycles.id),
          eq(approvalCycles.tenantId, tenantId)
        )
      )
      .innerJoin(
        documentVersions,
        and(
          eq(approvalCycles.documentVersionId, documentVersions.id),
          eq(documentVersions.tenantId, tenantId)
        )
      )
      .innerJoin(
        documents,
        and(
          eq(documentVersions.documentId, documents.id),
          eq(documents.tenantId, tenantId)
        )
      )
      .where(and(...conditions));

    const total = countRow?.total ?? 0;
    const totalPages = Math.ceil(total / limit) || (total === 0 ? 0 : 1);

    if (total === 0) {
      return {
        items: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
      };
    }

    const rows = await tx
      .select({
        stepId: approvalSteps.id,
        stepOrder: approvalSteps.stepOrder,
        stepStatus: approvalSteps.status,
        assignedApproverId: approvalSteps.assignedApproverId,
        overriddenFromApproverId: approvalSteps.overriddenFromApproverId,
        cycleId: approvalCycles.id,
        cycleNumber: approvalCycles.cycleNumber,
        cycleStatus: approvalCycles.status,
        cycleCreatedAt: approvalCycles.createdAt,
        submittedBy: approvalCycles.submittedBy,
        submittedSha256: approvalCycles.submittedSha256,
        allowSelfApprovalOverride: approvalCycles.allowSelfApprovalOverride,
        documentId: documents.id,
        documentCode: documents.documentCode,
        category: documents.category,
        versionId: documentVersions.id,
        versionLabel: documentVersions.versionLabel,
        versionMajor: documentVersions.versionMajor,
        versionMinor: documentVersions.versionMinor,
        title: documentVersions.title,
        contentFormat: documentVersions.contentFormat,
        lifecycleState: documentVersions.lifecycleState,
        documentSha256: documentVersions.documentSha256,
        markdownContent: documentVersions.markdownContent,
        fileStorageKey: documentVersions.fileStorageKey,
        fileSizeBytes: documentVersions.fileSizeBytes,
        authorId: documentVersions.authorId,
        rowVersion: documentVersions.rowVersion,
        versionUpdatedAt: documentVersions.updatedAt,
        assignedApproverName: assignedUser.name,
        assignedApproverEmail: assignedUser.email,
        assignedApproverMembershipStatus: approverMembership.status,
        assignedApproverMembershipRole: approverMembership.role,
        authorName: authorUser.name,
        submitterName: submitterUser.name,
      })
      .from(approvalSteps)
      .innerJoin(
        approvalCycles,
        and(
          eq(approvalSteps.approvalCycleId, approvalCycles.id),
          eq(approvalCycles.tenantId, tenantId)
        )
      )
      .innerJoin(
        documentVersions,
        and(
          eq(approvalCycles.documentVersionId, documentVersions.id),
          eq(documentVersions.tenantId, tenantId)
        )
      )
      .innerJoin(
        documents,
        and(
          eq(documentVersions.documentId, documents.id),
          eq(documents.tenantId, tenantId)
        )
      )
      .leftJoin(
        assignedUser,
        eq(approvalSteps.assignedApproverId, assignedUser.id)
      )
      .leftJoin(
        approverMembership,
        and(
          eq(approvalSteps.assignedApproverId, approverMembership.userId),
          eq(approverMembership.tenantId, tenantId)
        )
      )
      .leftJoin(authorUser, eq(documentVersions.authorId, authorUser.id))
      .leftJoin(
        submitterUser,
        eq(approvalCycles.submittedBy, submitterUser.id)
      )
      .where(and(...conditions))
      .orderBy(desc(approvalCycles.createdAt), asc(approvalSteps.stepOrder))
      .limit(limit)
      .offset((page - 1) * limit);

    const cycleIds = Array.from(new Set(rows.map((r) => r.cycleId)));
    const cycleStepsMap = new Map<string, ApprovalQueueStepItem[]>();

    if (cycleIds.length > 0) {
      const allCycleSteps = await tx
        .select({
          id: approvalSteps.id,
          approvalCycleId: approvalSteps.approvalCycleId,
          stepOrder: approvalSteps.stepOrder,
          status: approvalSteps.status,
          assignedApproverId: approvalSteps.assignedApproverId,
          overriddenFromApproverId: approvalSteps.overriddenFromApproverId,
          actedByUserId: approvalSteps.actedByUserId,
          actedByFullName: approvalSteps.actedByFullName,
          actedByRole: approvalSteps.actedByRole,
          actedAt: approvalSteps.actedAt,
          signedDocumentSha256: approvalSteps.signedDocumentSha256,
          decisionIntent: approvalSteps.decisionIntent,
          assignedApproverName: assignedUser.name,
          assignedApproverEmail: assignedUser.email,
          assignedApproverMembershipStatus: approverMembership.status,
          assignedApproverMembershipRole: approverMembership.role,
        })
        .from(approvalSteps)
        .leftJoin(
          assignedUser,
          eq(approvalSteps.assignedApproverId, assignedUser.id)
        )
        .leftJoin(
          approverMembership,
          and(
            eq(approvalSteps.assignedApproverId, approverMembership.userId),
            eq(approverMembership.tenantId, tenantId)
          )
        )
        .where(
          and(
            eq(approvalSteps.tenantId, tenantId),
            inArray(approvalSteps.approvalCycleId, cycleIds)
          )
        )
        .orderBy(asc(approvalSteps.stepOrder));

      for (const step of allCycleSteps) {
        const stepItem: ApprovalQueueStepItem = {
          id: step.id,
          stepOrder: step.stepOrder,
          status: step.status as ApprovalQueueStepItem["status"],
          assignedApproverId: step.assignedApproverId,
          assignedApproverName:
            step.assignedApproverName || "Unknown Approver",
          assignedApproverRole:
            (step.assignedApproverMembershipRole as WorkspaceRole) || null,
          assignedApproverEmail: step.assignedApproverEmail || null,
          isBlockedInactiveApprover:
            step.assignedApproverMembershipStatus !== "ACTIVE",
          overriddenFromApproverId: step.overriddenFromApproverId || null,
          actedByUserId: step.actedByUserId || null,
          actedByFullName: step.actedByFullName || null,
          actedByRole: (step.actedByRole as WorkspaceRole) || null,
          actedAt: step.actedAt ? step.actedAt.toISOString() : null,
          signedDocumentSha256: step.signedDocumentSha256 || null,
          decisionIntent: step.decisionIntent || null,
        };

        const existing = cycleStepsMap.get(step.approvalCycleId) || [];
        existing.push(stepItem);
        cycleStepsMap.set(step.approvalCycleId, existing);
      }
    }

    const items: ApprovalQueueItem[] = rows.map((row) => {
      const stepsInCycle = cycleStepsMap.get(row.cycleId) || [];
      const isBlockedInactiveApprover =
        row.assignedApproverMembershipStatus !== "ACTIVE";
      const isAssignedToCurrentUser = row.assignedApproverId === actorUserId;
      const isAuthor = row.authorId === actorUserId;
      const canApprove =
        isAssignedToCurrentUser &&
        row.stepStatus === "PENDING" &&
        (!isAuthor || row.allowSelfApprovalOverride);
      const canAdminOverride =
        actorRole === "WORKSPACE_ADMIN" && row.stepStatus === "PENDING";

      return {
        stepId: row.stepId,
        stepOrder: row.stepOrder,
        totalSteps: stepsInCycle.length || 1,
        stepStatus: row.stepStatus as ApprovalQueueItem["stepStatus"],
        assignedApproverId: row.assignedApproverId,
        assignedApproverName: row.assignedApproverName || "Unknown Approver",
        assignedApproverRole:
          (row.assignedApproverMembershipRole as WorkspaceRole) || null,
        assignedApproverEmail: row.assignedApproverEmail || null,
        isBlockedInactiveApprover,
        isAssignedToCurrentUser,
        canApprove,
        canAdminOverride,
        cycleId: row.cycleId,
        cycleNumber: row.cycleNumber,
        cycleStatus: row.cycleStatus,
        submittedAt: row.cycleCreatedAt.toISOString(),
        submittedByUserId: row.submittedBy,
        submittedByName: row.submitterName || "System",
        submittedSha256: row.submittedSha256,
        documentId: row.documentId,
        documentCode: row.documentCode,
        documentTitle: row.title,
        category: row.category,
        versionId: row.versionId,
        versionLabel:
          row.versionLabel || `v${row.versionMajor}.${row.versionMinor}`,
        versionMajor: row.versionMajor,
        versionMinor: row.versionMinor,
        contentFormat: row.contentFormat as ApprovalQueueItem["contentFormat"],
        lifecycleState:
          row.lifecycleState as ApprovalQueueItem["lifecycleState"],
        documentSha256: row.documentSha256,
        authorId: row.authorId,
        authorName: row.authorName || "Unknown Author",
        markdownContent: row.markdownContent,
        fileStorageKey: row.fileStorageKey,
        fileSizeBytes: row.fileSizeBytes,
        rowVersion: row.rowVersion,
        updatedAt: row.versionUpdatedAt.toISOString(),
        stepsInCycle,
      };
    });

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }
}
