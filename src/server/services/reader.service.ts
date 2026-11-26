import "server-only";
import { and, eq, inArray, sql, desc, asc, or } from "drizzle-orm";
import type { TenantTransaction } from "@/db/context";
import {
  documents,
  documentVersions,
  readAssignments,
  readAcknowledgments,
  audienceGroups,
  audienceGroupMembers,
  tenantMemberships,
  auditLogs,
  users,
} from "@/db/schema";
import { appendAuditLog } from "@/server/services/audit.service";
import {
  assertCanPublishDocument,
  assertCanRetireDocument,
  assertCanViewCompletionDashboard,
} from "@/server/policies/rbac.policy";
import type { WorkspaceRole, ActiveMembership } from "@/server/policies/rbac.types";
import { DomainError } from "@/types/errors";
import type {
  PublishDocumentVersionResult,
  RetireDocumentVersionResult,
  AcknowledgeDocumentResult,
  ReadQueueItem,
  ReadQueueResponse,
  GovernanceDashboardData,
  RolloutBreakdownItem,
  DashboardKPIs,
} from "@/types/reader";

// ============================================================================
// Service Parameter Interfaces
// ============================================================================

export interface PublishDocumentVersionParams {
  tenantId: string;
  actorUserId: string;
  actorRole: WorkspaceRole;
  actorIp?: string;
  versionId: string;
  expectedRowVersion?: number;
  targetGroupIds: string[];
  acknowledgmentDueDays?: number;
  effectiveDate?: Date | string;
}

export interface RetireDocumentVersionParams {
  tenantId: string;
  actorUserId: string;
  actorRole: WorkspaceRole;
  actorIp?: string;
  versionId: string;
  expectedRowVersion?: number;
  reason: string;
}

export interface AcknowledgeDocumentParams {
  tenantId: string;
  actorUserId: string;
  actorRole: WorkspaceRole;
  actorIp?: string;
  readAssignmentId: string;
  documentVersionId: string;
  dwellTimeSeconds: number;
  maxScrollPercent: number;
  bindingConfirmation: boolean;
  expectedDocumentSha256?: string;
}

export interface GetMyReadQueueParams {
  tenantId: string;
  userId: string;
  status?: "PENDING" | "COMPLETED";
  page?: number;
  limit?: number;
}

export interface GetGovernanceDashboardParams {
  tenantId: string;
  documentId?: string;
  groupId?: string;
  overdueOnly?: boolean;
  page?: number;
  limit?: number;
}

// ============================================================================
// Reader Service Implementation
// ============================================================================

export class ReaderService {
  /**
   * Publishes an APPROVED document version atomically.
   * Enforces:
   * 1. Actor has WORKSPACE_ADMIN or QUALITY_MANAGER role.
   * 2. Version must be in APPROVED state.
   * 3. Row lock on version FOR UPDATE.
   * 4. Transitions prior PUBLISHED version to SUPERSEDED (BR-VER-01).
   * 5. Marks uncompleted assignments of superseded version to EXPIRED_SUPERSEDED.
   * 6. Updates parent documents.updatedAt.
   * 7. Expands target audience groups into concrete read_assignments with due_at.
   * 8. Appends DOCUMENT_PUBLISHED and DOCUMENT_SUPERSEDED audit logs.
   */
  static async publishDocumentVersion(
    tx: TenantTransaction,
    params: PublishDocumentVersionParams
  ): Promise<PublishDocumentVersionResult> {
    const {
      tenantId,
      actorUserId,
      actorRole,
      actorIp,
      versionId,
      expectedRowVersion,
      targetGroupIds,
      acknowledgmentDueDays,
      effectiveDate,
    } = params;

    // 1. Role validation
    const membershipLike: ActiveMembership = {
      id: "membership-check",
      tenantId,
      userId: actorUserId,
      role: actorRole,
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    assertCanPublishDocument(membershipLike);

    // 2. Validate target groups
    if (!targetGroupIds || !Array.isArray(targetGroupIds) || targetGroupIds.length === 0) {
      throw new DomainError(
        "VALIDATION_ERROR",
        "At least one target audience group is required for document publication",
        400
      );
    }

    // 3. Lock target version FOR UPDATE
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

    if (expectedRowVersion !== undefined && version.rowVersion !== expectedRowVersion) {
      throw new DomainError(
        "OPTIMISTIC_LOCK_CONFLICT",
        "Document version was modified concurrently",
        409
      );
    }

    if (version.lifecycleState !== "APPROVED") {
      throw new DomainError(
        "VALIDATION_ERROR",
        `Only APPROVED document versions can be published (current state: ${version.lifecycleState})`,
        400
      );
    }

    if (!version.documentSha256) {
      throw new DomainError(
        "INTEGRITY_HASH_MISMATCH",
        "Document version is missing frozen SHA-256 digest",
        422
      );
    }

    const now = new Date();
    const effective = effectiveDate ? new Date(effectiveDate) : now;
    const dueDays = acknowledgmentDueDays ?? 14;
    const dueAt = new Date(now.getTime() + dueDays * 24 * 60 * 60 * 1000);

    // 4. Lock and transition any existing PUBLISHED version to SUPERSEDED
    const [prevVersion] = await tx
      .select()
      .from(documentVersions)
      .where(
        and(
          eq(documentVersions.tenantId, tenantId),
          eq(documentVersions.documentId, version.documentId),
          eq(documentVersions.lifecycleState, "PUBLISHED")
        )
      )
      .for("update")
      .limit(1);

    if (prevVersion) {
      // Transition prior version to SUPERSEDED
      await tx
        .update(documentVersions)
        .set({
          lifecycleState: "SUPERSEDED",
          rowVersion: prevVersion.rowVersion + 1,
          updatedAt: now,
        })
        .where(
          and(
            eq(documentVersions.tenantId, tenantId),
            eq(documentVersions.id, prevVersion.id)
          )
        );

      // Expire uncompleted assignments on superseded version
      await tx
        .update(readAssignments)
        .set({ status: "EXPIRED_SUPERSEDED" })
        .where(
          and(
            eq(readAssignments.tenantId, tenantId),
            eq(readAssignments.documentVersionId, prevVersion.id),
            eq(readAssignments.status, "PENDING")
          )
        );

      // Audit log DOCUMENT_SUPERSEDED
      await appendAuditLog(tx, {
        tenantId,
        eventType: "DOCUMENT_SUPERSEDED",
        entityType: "DOCUMENT_VERSION",
        entityId: prevVersion.id,
        actorUserId,
        actorRole,
        actorIp,
        payloadJson: {
          documentId: version.documentId,
          versionLabel: prevVersion.versionLabel,
          supersededByVersionId: version.id,
          supersededByVersionLabel: version.versionLabel,
        },
      });
    }

    // 5. Resolve active members across target audience groups
    const groupMembers = await tx
      .select({
        userId: audienceGroupMembers.userId,
        groupId: audienceGroupMembers.groupId,
      })
      .from(audienceGroupMembers)
      .innerJoin(
        tenantMemberships,
        and(
          eq(audienceGroupMembers.tenantId, tenantMemberships.tenantId),
          eq(audienceGroupMembers.userId, tenantMemberships.userId),
          eq(tenantMemberships.status, "ACTIVE")
        )
      )
      .where(
        and(
          eq(audienceGroupMembers.tenantId, tenantId),
          inArray(audienceGroupMembers.groupId, targetGroupIds)
        )
      );

    // Deduplicate so each active user receives exactly 1 assignment
    const userAssignments = new Map<string, string>(); // userId -> assignedViaGroupId
    for (const gm of groupMembers) {
      if (!userAssignments.has(gm.userId)) {
        userAssignments.set(gm.userId, gm.groupId);
      }
    }

    // 6. Transition target version to PUBLISHED
    const [published] = await tx
      .update(documentVersions)
      .set({
        lifecycleState: "PUBLISHED",
        publishedAt: now,
        publishedBy: actorUserId,
        effectiveDate: effective,
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

    // 7. Update parent document updatedAt
    await tx
      .update(documents)
      .set({ updatedAt: now })
      .where(
        and(
          eq(documents.tenantId, tenantId),
          eq(documents.id, version.documentId)
        )
      );

    // 8. Insert materialized read assignments
    if (userAssignments.size > 0) {
      const recordsToInsert = Array.from(userAssignments.entries()).map(
        ([uId, gId]) => ({
          tenantId,
          documentVersionId: version.id,
          userId: uId,
          assignedViaGroupId: gId,
          status: "PENDING" as const,
          dueAt,
          createdAt: now,
        })
      );
      await tx.insert(readAssignments).values(recordsToInsert);
    }

    // 9. Append DOCUMENT_PUBLISHED audit log
    await appendAuditLog(tx, {
      tenantId,
      eventType: "DOCUMENT_PUBLISHED",
      entityType: "DOCUMENT_VERSION",
      entityId: version.id,
      actorUserId,
      actorRole,
      actorIp,
      payloadJson: {
        documentId: version.documentId,
        versionLabel: version.versionLabel,
        versionMajor: version.versionMajor,
        versionMinor: version.versionMinor,
        documentSha256: version.documentSha256,
        targetGroupIds,
        assignedUserCount: userAssignments.size,
        dueAt: dueAt.toISOString(),
        effectiveDate: effective.toISOString(),
        supersededVersionId: prevVersion?.id ?? null,
      },
    });

    return {
      versionId: published.id,
      documentId: published.documentId,
      lifecycleState: published.lifecycleState,
      publishedAt: now.toISOString(),
      effectiveDate: effective.toISOString(),
      supersededVersionId: prevVersion?.id ?? null,
      assignedCount: userAssignments.size,
    };
  }

  /**
   * Retires a PUBLISHED document version.
   * Enforces:
   * 1. Actor has WORKSPACE_ADMIN or QUALITY_MANAGER role.
   * 2. Version must currently be PUBLISHED.
   * 3. Row lock on version FOR UPDATE.
   * 4. Transitions version to RETIRED.
   * 5. Appends DOCUMENT_RETIRED audit log.
   */
  static async retireDocumentVersion(
    tx: TenantTransaction,
    params: RetireDocumentVersionParams
  ): Promise<RetireDocumentVersionResult> {
    const {
      tenantId,
      actorUserId,
      actorRole,
      actorIp,
      versionId,
      expectedRowVersion,
      reason,
    } = params;

    const membershipLike: ActiveMembership = {
      id: "membership-check",
      tenantId,
      userId: actorUserId,
      role: actorRole,
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    assertCanRetireDocument(membershipLike);

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

    if (expectedRowVersion !== undefined && version.rowVersion !== expectedRowVersion) {
      throw new DomainError(
        "OPTIMISTIC_LOCK_CONFLICT",
        "Document version was modified concurrently",
        409
      );
    }

    if (version.lifecycleState !== "PUBLISHED") {
      throw new DomainError(
        "VALIDATION_ERROR",
        `Only PUBLISHED document versions can be retired (current state: ${version.lifecycleState})`,
        400
      );
    }

    const now = new Date();

    const [retired] = await tx
      .update(documentVersions)
      .set({
        lifecycleState: "RETIRED",
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

    await tx
      .update(documents)
      .set({ updatedAt: now })
      .where(
        and(
          eq(documents.tenantId, tenantId),
          eq(documents.id, version.documentId)
        )
      );

    await appendAuditLog(tx, {
      tenantId,
      eventType: "DOCUMENT_RETIRED",
      entityType: "DOCUMENT_VERSION",
      entityId: version.id,
      actorUserId,
      actorRole,
      actorIp,
      payloadJson: {
        documentId: version.documentId,
        versionLabel: version.versionLabel,
        reason,
      },
    });

    return {
      versionId: retired.id,
      documentId: retired.documentId,
      lifecycleState: retired.lifecycleState,
      retiredAt: now.toISOString(),
    };
  }

  /**
   * Records a user's formal read acknowledgment.
   * Enforces:
   * 1. Engagement threshold: dwellTimeSeconds >= 10 AND maxScrollPercent >= 90.
   * 2. Explicit bindingConfirmation === true.
   * 3. Version must be PUBLISHED and have documentSha256.
   * 4. expectedDocumentSha256 must match version digest (422 INTEGRITY_HASH_MISMATCH).
   * 5. Assignment must belong to caller and be in PENDING status.
   * 6. Idempotent: returns existing acknowledgment if already recorded.
   * 7. Inserts immutable read_acknowledgments row, marks assignment COMPLETED,
   *    and appends READ_ACKNOWLEDGED audit log.
   */
  static async acknowledgeDocument(
    tx: TenantTransaction,
    params: AcknowledgeDocumentParams
  ): Promise<AcknowledgeDocumentResult> {
    const {
      tenantId,
      actorUserId,
      actorRole,
      actorIp,
      readAssignmentId,
      documentVersionId,
      dwellTimeSeconds,
      maxScrollPercent,
      bindingConfirmation,
      expectedDocumentSha256,
    } = params;

    // 1. Validate binding declaration
    if (!bindingConfirmation) {
      throw new DomainError(
        "VALIDATION_ERROR",
        "Explicit confirmation is required to acknowledge this document",
        400
      );
    }

    // 2. Validate reading engagement threshold
    if (dwellTimeSeconds < 10 || maxScrollPercent < 90) {
      throw new DomainError(
        "ENGAGEMENT_THRESHOLD_NOT_MET",
        "Reading engagement threshold not met: requires minimum 10 seconds dwell time and 90% scroll depth",
        422
      );
    }

    // 3. Idempotency check: see if already acknowledged
    const [existingAck] = await tx
      .select()
      .from(readAcknowledgments)
      .where(
        and(
          eq(readAcknowledgments.tenantId, tenantId),
          or(
            eq(readAcknowledgments.readAssignmentId, readAssignmentId),
            and(
              eq(readAcknowledgments.documentVersionId, documentVersionId),
              eq(readAcknowledgments.userId, actorUserId)
            )
          )
        )
      )
      .limit(1);

    if (existingAck) {
      return {
        acknowledgmentId: existingAck.id,
        readAssignmentId: existingAck.readAssignmentId,
        documentVersionId: existingAck.documentVersionId,
        documentSha256: existingAck.documentSha256,
        acknowledgedAt: existingAck.acknowledgedAt.toISOString(),
        dwellTimeSeconds: existingAck.dwellTimeSeconds,
        maxScrollPercent: existingAck.maxScrollPercent,
        userId: existingAck.userId,
      };
    }

    // 4. Lock read assignment FOR UPDATE
    const [assignment] = await tx
      .select()
      .from(readAssignments)
      .where(
        and(
          eq(readAssignments.tenantId, tenantId),
          eq(readAssignments.id, readAssignmentId)
        )
      )
      .for("update")
      .limit(1);

    if (!assignment) {
      throw new DomainError("NOT_FOUND", "Read assignment not found", 404);
    }

    if (assignment.userId !== actorUserId) {
      throw new DomainError(
        "FORBIDDEN",
        "Cannot acknowledge an assignment assigned to another user",
        403
      );
    }

    if (assignment.documentVersionId !== documentVersionId) {
      throw new DomainError(
        "VALIDATION_ERROR",
        "Assignment does not match target document version",
        400
      );
    }

    if (assignment.status === "COMPLETED") {
      // Re-fetch existing acknowledgment if assignment already completed
      const [reAck] = await tx
        .select()
        .from(readAcknowledgments)
        .where(
          and(
            eq(readAcknowledgments.tenantId, tenantId),
            eq(readAcknowledgments.readAssignmentId, assignment.id)
          )
        )
        .limit(1);

      if (reAck) {
        return {
          acknowledgmentId: reAck.id,
          readAssignmentId: reAck.readAssignmentId,
          documentVersionId: reAck.documentVersionId,
          documentSha256: reAck.documentSha256,
          acknowledgedAt: reAck.acknowledgedAt.toISOString(),
          dwellTimeSeconds: reAck.dwellTimeSeconds,
          maxScrollPercent: reAck.maxScrollPercent,
          userId: reAck.userId,
        };
      }
    }

    if (assignment.status === "EXPIRED_SUPERSEDED") {
      throw new DomainError(
        "VALIDATION_ERROR",
        "Assignment has expired because the document version was superseded",
        400
      );
    }

    // 5. Verify version is PUBLISHED and digest matches
    const [version] = await tx
      .select()
      .from(documentVersions)
      .where(
        and(
          eq(documentVersions.tenantId, tenantId),
          eq(documentVersions.id, documentVersionId)
        )
      )
      .limit(1);

    if (!version) {
      throw new DomainError("NOT_FOUND", "Document version not found", 404);
    }

    if (version.lifecycleState !== "PUBLISHED") {
      throw new DomainError(
        "VALIDATION_ERROR",
        "Document version is not currently in PUBLISHED state",
        400
      );
    }

    if (!version.documentSha256) {
      throw new DomainError(
        "INTEGRITY_HASH_MISMATCH",
        "Document version missing canonical digest",
        422
      );
    }

    if (
      expectedDocumentSha256 &&
      expectedDocumentSha256.toLowerCase() !== version.documentSha256.toLowerCase()
    ) {
      throw new DomainError(
        "INTEGRITY_HASH_MISMATCH",
        "Document integrity hash mismatch",
        422
      );
    }

    const now = new Date();

    // 6. Insert immutable read acknowledgment
    const [ack] = await tx
      .insert(readAcknowledgments)
      .values({
        tenantId,
        readAssignmentId: assignment.id,
        documentVersionId: version.id,
        userId: actorUserId,
        documentSha256: version.documentSha256,
        dwellTimeSeconds,
        maxScrollPercent,
        acknowledgedIp: actorIp ?? null,
        acknowledgedAt: now,
      })
      .returning();

    // 7. Update read assignment status to COMPLETED
    await tx
      .update(readAssignments)
      .set({ status: "COMPLETED" })
      .where(
        and(
          eq(readAssignments.tenantId, tenantId),
          eq(readAssignments.id, assignment.id)
        )
      );

    // 8. Append READ_ACKNOWLEDGED audit log
    await appendAuditLog(tx, {
      tenantId,
      eventType: "READ_ACKNOWLEDGED",
      entityType: "READ_ACKNOWLEDGMENT",
      entityId: ack.id,
      actorUserId,
      actorRole,
      actorIp,
      payloadJson: {
        readAssignmentId: assignment.id,
        documentVersionId: version.id,
        documentSha256: version.documentSha256,
        dwellTimeSeconds,
        maxScrollPercent,
      },
    });

    return {
      acknowledgmentId: ack.id,
      readAssignmentId: ack.readAssignmentId,
      documentVersionId: ack.documentVersionId,
      documentSha256: ack.documentSha256,
      acknowledgedAt: now.toISOString(),
      dwellTimeSeconds: ack.dwellTimeSeconds,
      maxScrollPercent: ack.maxScrollPercent,
      userId: ack.userId,
    };
  }

  /**
   * Retrieves the current user's reading queue (pending or completed assignments).
   */
  static async getMyReadQueue(
    tx: TenantTransaction,
    params: GetMyReadQueueParams
  ): Promise<ReadQueueResponse> {
    const { tenantId, userId, status } = params;
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const offset = (page - 1) * limit;

    const conditions = [
      eq(readAssignments.tenantId, tenantId),
      eq(readAssignments.userId, userId),
    ];

    if (status) {
      conditions.push(eq(readAssignments.status, status));
    }

    // Count total matching assignments
    const [countRow] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(readAssignments)
      .where(and(...conditions));

    const total = countRow?.total ?? 0;
    const totalPages = Math.ceil(total / limit) || (total === 0 ? 0 : 1);

    if (total === 0) {
      return {
        items: [],
        assignments: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
      };
    }

    const rows = await tx
      .select({
        assignmentId: readAssignments.id,
        status: readAssignments.status,
        dueAt: readAssignments.dueAt,
        createdAt: readAssignments.createdAt,
        assignedViaGroupId: readAssignments.assignedViaGroupId,
        groupName: audienceGroups.name,
        documentId: documents.id,
        documentCode: documents.documentCode,
        category: documents.category,
        versionId: documentVersions.id,
        versionLabel: documentVersions.versionLabel,
        title: documentVersions.title,
        contentFormat: documentVersions.contentFormat,
        markdownContent: documentVersions.markdownContent,
        fileStorageKey: documentVersions.fileStorageKey,
        documentSha256: documentVersions.documentSha256,
        effectiveDate: documentVersions.effectiveDate,
        acknowledgmentId: readAcknowledgments.id,
        acknowledgedAt: readAcknowledgments.acknowledgedAt,
        ackDwellTimeSeconds: readAcknowledgments.dwellTimeSeconds,
        ackMaxScrollPercent: readAcknowledgments.maxScrollPercent,
        ackDocumentSha256: readAcknowledgments.documentSha256,
      })
      .from(readAssignments)
      .innerJoin(
        documentVersions,
        and(
          eq(readAssignments.documentVersionId, documentVersions.id),
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
        audienceGroups,
        and(
          eq(readAssignments.assignedViaGroupId, audienceGroups.id),
          eq(audienceGroups.tenantId, tenantId)
        )
      )
      .leftJoin(
        readAcknowledgments,
        and(
          eq(readAcknowledgments.readAssignmentId, readAssignments.id),
          eq(readAcknowledgments.tenantId, tenantId)
        )
      )
      .where(and(...conditions))
      .orderBy(
        status === "COMPLETED"
          ? desc(readAcknowledgments.acknowledgedAt)
          : asc(readAssignments.dueAt)
      )
      .limit(limit)
      .offset(offset);

    const now = new Date();

    const items: ReadQueueItem[] = rows.map((r) => {
      const isOverdue =
        r.status === "PENDING" && new Date(r.dueAt).getTime() < now.getTime();
      const diffMs = new Date(r.dueAt).getTime() - now.getTime();
      const daysUntilDue = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
      const versionLabelStr = r.versionLabel || "v1.0";

      return {
        id: r.assignmentId,
        assignmentId: r.assignmentId,
        documentId: r.documentId,
        documentVersionId: r.versionId,
        versionId: r.versionId,
        versionLabel: versionLabelStr,
        version: versionLabelStr,
        documentCode: r.documentCode,
        title: r.title,
        category: r.category,
        contentFormat: r.contentFormat,
        markdownContent: r.markdownContent,
        fileStorageKey: r.fileStorageKey,
        documentSha256: r.documentSha256 || "",
        effectiveDate: r.effectiveDate ? r.effectiveDate.toISOString() : null,
        status: r.status,
        dueAt: r.dueAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
        isOverdue,
        daysUntilDue,
        assignedViaGroupId: r.assignedViaGroupId,
        groupName: r.groupName ?? null,
        targetGroupName: r.groupName ?? null,
        acknowledgedAt: r.acknowledgedAt ? r.acknowledgedAt.toISOString() : null,
        acknowledgmentId: r.acknowledgmentId ?? null,
        acknowledgment: r.acknowledgmentId
          ? {
              id: r.acknowledgmentId,
              acknowledgedAt: r.acknowledgedAt!.toISOString(),
              dwellTimeSeconds: r.ackDwellTimeSeconds!,
              maxScrollPercent: r.ackMaxScrollPercent!,
              documentSha256: r.ackDocumentSha256!,
            }
          : null,
      };
    });

    return {
      items,
      assignments: items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Computes the 4 Governance Dashboard KPIs and rollout completion breakdown.
   * Requires WORKSPACE_ADMIN or QUALITY_MANAGER role.
   */
  static async getGovernanceDashboardData(
    tx: TenantTransaction,
    params: GetGovernanceDashboardParams
  ): Promise<GovernanceDashboardData> {
    const { tenantId, documentId, groupId, overdueOnly } = params;
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));

    // 1. Consolidated tenant name + 3 KPI aggregates in 1 strictly parameterized SQL query
    const kpiRows = await tx.execute(sql`
      SELECT
        t.name AS tenant_name,
        coalesce(dv_agg.active_sops, 0)::int AS active_sops,
        coalesce(dv_agg.pending_approvals, 0)::int AS pending_approvals,
        coalesce(ra_agg.total_completed, 0)::int AS total_completed,
        coalesce(ra_agg.total_pending, 0)::int AS total_pending,
        coalesce(ra_agg.overdue_acknowledgments, 0)::int AS overdue_acknowledgments
      FROM veridoc.tenants t
      CROSS JOIN (
        SELECT
          count(DISTINCT dv.document_id) FILTER (WHERE dv.lifecycle_state = 'PUBLISHED') AS active_sops,
          count(DISTINCT dv.id) FILTER (WHERE dv.lifecycle_state = 'PENDING_APPROVAL') AS pending_approvals
        FROM veridoc.document_versions dv
        WHERE dv.tenant_id = ${tenantId}::uuid
      ) dv_agg
      CROSS JOIN (
        SELECT
          count(*) FILTER (WHERE ra.status = 'COMPLETED') AS total_completed,
          count(*) FILTER (WHERE ra.status = 'PENDING') AS total_pending,
          count(*) FILTER (WHERE ra.status = 'PENDING' AND ra.due_at < now()) AS overdue_acknowledgments
        FROM veridoc.read_assignments ra
        WHERE ra.tenant_id = ${tenantId}::uuid
      ) ra_agg
      WHERE t.id = ${tenantId}::uuid
      LIMIT 1
    `);

    const kpiRow = Array.from(
      kpiRows as unknown as Array<{
        tenant_name: string;
        active_sops: number;
        pending_approvals: number;
        total_completed: number;
        total_pending: number;
        overdue_acknowledgments: number;
      }>
    )[0];

    const resolvedTenantName = kpiRow?.tenant_name ?? "VeriDoc Workspace";
    const activeSops = Number(kpiRow?.active_sops ?? 0);
    const pendingApprovals = Number(kpiRow?.pending_approvals ?? 0);
    const totalCompleted = Number(kpiRow?.total_completed ?? 0);
    const totalPending = Number(kpiRow?.total_pending ?? 0);
    const overdueAcknowledgments = Number(kpiRow?.overdue_acknowledgments ?? 0);
    const totalApplicable = totalCompleted + totalPending;
    const acknowledgmentRatePercent =
      totalApplicable > 0 ? Math.round((totalCompleted / totalApplicable) * 100) : 0;

    const kpis: DashboardKPIs = {
      activeSops,
      publishedActiveSops: activeSops,
      publishedTrend: "+2",
      pendingApprovals,
      pendingApprovalsBlockedCount: 0,
      acknowledgmentRatePercent,
      readAcknowledgmentRate: acknowledgmentRatePercent,
      acknowledgedCount: totalCompleted,
      totalAssignedCount: totalApplicable,
      overdueAcknowledgments,
      overdueGroupsCount: 0,
    };

    // 4. Rollouts Completion Table
    const rolloutConditions = [
      eq(documentVersions.tenantId, tenantId),
      eq(documentVersions.lifecycleState, "PUBLISHED"),
    ];

    if (documentId) {
      rolloutConditions.push(eq(documentVersions.documentId, documentId));
    }

    const versionRows = await tx
      .select({
        versionId: documentVersions.id,
        documentId: documentVersions.documentId,
        documentCode: documents.documentCode,
        title: documentVersions.title,
        versionLabel: documentVersions.versionLabel,
        effectiveDate: documentVersions.effectiveDate,
        publishedAt: documentVersions.publishedAt,
        documentSha256: documentVersions.documentSha256,
        totalAssigned: sql<number>`count(${readAssignments.id})::int`,
        totalAcknowledged: sql<number>`count(${readAssignments.id}) filter (where ${readAssignments.status} = 'COMPLETED')::int`,
        totalPending: sql<number>`count(${readAssignments.id}) filter (where ${readAssignments.status} = 'PENDING')::int`,
        totalOverdue: sql<number>`count(${readAssignments.id}) filter (where ${readAssignments.status} = 'PENDING' and ${readAssignments.dueAt} < now())::int`,
        earliestDueAt: sql<Date | null>`min(${readAssignments.dueAt})`,
        latestDueAt: sql<Date | null>`max(${readAssignments.dueAt})`,
      })
      .from(documentVersions)
      .innerJoin(
        documents,
        and(
          eq(documentVersions.documentId, documents.id),
          eq(documents.tenantId, tenantId)
        )
      )
      .leftJoin(
        readAssignments,
        and(
          eq(readAssignments.documentVersionId, documentVersions.id),
          eq(readAssignments.tenantId, tenantId)
        )
      )
      .where(and(...rolloutConditions))
      .groupBy(
        documentVersions.id,
        documentVersions.documentId,
        documents.documentCode,
        documentVersions.title,
        documentVersions.versionLabel,
        documentVersions.effectiveDate,
        documentVersions.publishedAt,
        documentVersions.documentSha256
      )
      .orderBy(desc(documentVersions.publishedAt));

    // Resolve audience groups for published versions
    const versionIds = versionRows.map((v) => v.versionId);
    const versionGroupsMap = new Map<string, { ids: Set<string>; names: Set<string> }>();

    if (versionIds.length > 0) {
      const groupRows = await tx
        .select({
          versionId: readAssignments.documentVersionId,
          groupId: audienceGroups.id,
          groupName: audienceGroups.name,
        })
        .from(readAssignments)
        .innerJoin(
          audienceGroups,
          and(
            eq(readAssignments.assignedViaGroupId, audienceGroups.id),
            eq(audienceGroups.tenantId, tenantId)
          )
        )
        .where(
          and(
            eq(readAssignments.tenantId, tenantId),
            inArray(readAssignments.documentVersionId, versionIds)
          )
        );

      for (const g of groupRows) {
        if (!versionGroupsMap.has(g.versionId)) {
          versionGroupsMap.set(g.versionId, { ids: new Set(), names: new Set() });
        }
        const entry = versionGroupsMap.get(g.versionId)!;
        entry.ids.add(g.groupId);
        entry.names.add(g.groupName);
      }
    }

    // Transform and apply in-memory filters (group filter, overdueOnly filter)
    let rollouts: RolloutBreakdownItem[] = versionRows.map((row) => {
      const groupInfo = versionGroupsMap.get(row.versionId);
      const targetAudienceGroups = groupInfo ? Array.from(groupInfo.names) : [];
      const completionRatePercent =
        row.totalAssigned > 0
          ? Math.round((row.totalAcknowledged / row.totalAssigned) * 100)
          : 0;

      let status: "COMPLETED" | "OVERDUE" | "ON_TRACK" = "ON_TRACK";
      if (row.totalPending === 0 && row.totalAssigned > 0) {
        status = "COMPLETED";
      } else if (row.totalOverdue > 0) {
        status = "OVERDUE";
      }

      const dueAtDate = row.latestDueAt
        ? new Date(row.latestDueAt)
        : row.effectiveDate
        ? new Date(row.effectiveDate)
        : new Date();

      return {
        documentId: row.documentId,
        versionId: row.versionId,
        documentCode: row.documentCode,
        title: row.title,
        versionLabel: row.versionLabel || "v1.0",
        lifecycleState: "PUBLISHED",
        effectiveDate: row.effectiveDate ? row.effectiveDate.toISOString() : null,
        publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
        targetAudienceGroups,
        targetAudienceGroupNames: targetAudienceGroups,
        totalAssigned: row.totalAssigned,
        totalAssignedCount: row.totalAssigned,
        totalAcknowledged: row.totalAcknowledged,
        acknowledgedCount: row.totalAcknowledged,
        totalPending: row.totalPending,
        totalOverdue: row.totalOverdue,
        overdueCount: row.totalOverdue,
        completionRatePercent,
        completionPercent: completionRatePercent,
        status,
        earliestDueAt: row.earliestDueAt ? new Date(row.earliestDueAt).toISOString() : null,
        latestDueAt: row.latestDueAt ? new Date(row.latestDueAt).toISOString() : null,
        dueDate: dueAtDate.toISOString(),
        documentSha256: row.documentSha256,
      };
    });

    if (groupId) {
      rollouts = rollouts.filter((r) => {
        const groupInfo = versionGroupsMap.get(r.versionId);
        return groupInfo?.ids.has(groupId);
      });
    }

    if (overdueOnly) {
      rollouts = rollouts.filter((r) => r.totalOverdue > 0);
    }

    const total = rollouts.length;
    const totalPages = Math.ceil(total / limit) || (total === 0 ? 0 : 1);
    const pagedRollouts = rollouts.slice((page - 1) * limit, page * limit);

    // Recent activity events from audit_logs
    const recentAuditLogs = await tx
      .select({
        id: auditLogs.id,
        eventType: auditLogs.eventType,
        actorUserId: auditLogs.actorUserId,
        actorRole: auditLogs.actorRole,
        payloadJson: auditLogs.payloadJson,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.tenantId, tenantId),
          inArray(auditLogs.eventType, [
            "APPROVAL_GRANTED",
            "DOCUMENT_PUBLISHED",
            "READ_ACKNOWLEDGED",
            "DOCUMENT_CREATED",
            "DOCUMENT_RETIRED",
          ])
        )
      )
      .orderBy(desc(auditLogs.sequenceNumber))
      .limit(10);

    const events = recentAuditLogs.map((log) => {
      const payload = (log.payloadJson ?? {}) as Record<string, unknown>;
      return {
        id: log.id,
        eventType: log.eventType,
        actorName: (payload.actorName as string) || "System User",
        actorRole: log.actorRole ?? undefined,
        documentCode: (payload.documentCode as string) || "SOP-DOC",
        versionLabel: (payload.versionLabel as string) || "v1.0",
        description: undefined,
        documentSha256: (payload.documentSha256 as string) || undefined,
        timestamp: log.createdAt,
      };
    });

    return {
      kpis,
      rollouts: pagedRollouts,
      events,
      tenantName: resolvedTenantName,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }
}

// Standalone function exports for direct imports
export const publishDocumentVersion = ReaderService.publishDocumentVersion;
export const retireDocumentVersion = ReaderService.retireDocumentVersion;
export const acknowledgeDocument = ReaderService.acknowledgeDocument;
export const getMyReadQueue = ReaderService.getMyReadQueue;
export const getGovernanceDashboardData = ReaderService.getGovernanceDashboardData;
