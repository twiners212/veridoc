import "server-only";
import { and, count, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { withTenantContext, type TenantTransaction } from "@/db/context";
import {
  tenants,
  users,
  documents,
  documentVersions,
  approvalCycles,
  approvalSteps,
  readAssignments,
  readAcknowledgments,
  auditLogs,
} from "@/db/schema";
import { assertActiveMembership } from "@/server/policies/membership.policy";
import { assertCanExportAuditPacket } from "@/server/policies/rbac.policy";
import { verifyTenantAuditChainInTx } from "@/server/services/audit.service";
import type { WorkspaceRole } from "@/server/policies/rbac.types";
import { DomainError } from "@/types/errors";

export interface AuditPacketFilter {
  documentId?: string;
  versionId?: string;
  startDate?: string;
  endDate?: string;
  format: "json" | "pdf";
}

export interface AuditPacketExport {
  exportMetadata: {
    exportId: string;
    generatedAt: string;
    generatedBy: {
      userId: string;
      fullName: string;
      role: WorkspaceRole;
    };
    tenant: {
      id: string;
      name: string;
      slug: string;
    };
    filter: AuditPacketFilter;
    specVersion: "1.0.0";
    system: "VeriDoc Document & SOP Approval Workspace";
  };
  verification: {
    chainVerified: boolean;
    totalEntriesInChain: number;
    headHash: string | null;
    genesisPrevHash: string;
    hashAlgorithm: "SHA-256";
    verifiedAt: string;
    failureReason?: string;
    failedSequenceNumber?: number;
  };
  complianceDisclosure: {
    standard: string;
    immutabilityArchitecture: string;
    infrastructureBoundaryNotice: string;
    claimsBoundary: {
      fda21CfrPart11Certified: boolean;
      part11Notice: string;
      tamperProofAbsoluteClaim: boolean;
      tamperProofNotice: string;
    };
  };
  scope: {
    type: "DOCUMENT_AUDIT_PACKET" | "TENANT_AUDIT_SUMMARY";
    documentCount: number;
    versionCount: number;
    auditTrailTruncated: boolean;
    totalAuditEntriesInScope: number;
  };
  documents: Array<{
    id: string;
    documentCode: string;
    category: string | null;
    createdAt: string;
    versions: Array<{
      id: string;
      versionMajor: number;
      versionMinor: number;
      versionLabel: string;
      title: string;
      contentFormat: string;
      lifecycleState: string;
      documentSha256: string | null;
      fileSha256: string | null;
      fileSizeBytes: number | null;
      fileMimeType: string | null;
      effectiveDate: string | null;
      publishedAt: string | null;
      publishedBy: { id: string; name: string } | null;
      author: { id: string; name: string };
      parentVersionId: string | null;
      createdAt: string;
      updatedAt: string;
      approvalCycles: Array<{
        id: string;
        cycleNumber: number;
        status: string;
        submittedSha256: string;
        submittedBy: { id: string; name: string };
        invalidatedReason: string | null;
        createdAt: string;
        closedAt: string | null;
        steps: Array<{
          id: string;
          stepOrder: number;
          status: string;
          assignedApprover: { id: string; name: string };
          actedBy: {
            userId: string | null;
            fullName: string | null;
            role: WorkspaceRole | null;
            ipAddress: string | null;
          } | null;
          authMethod: string | null;
          signedDocumentSha256: string | null;
          decisionIntent: string | null;
          selfApprovalOverrideUsed: boolean;
          overriddenFromApproverId: string | null;
          actedAt: string | null;
        }>;
      }>;
      readAcknowledgments: {
        summary: {
          totalAssigned: number;
          totalAcknowledged: number;
          totalPending: number;
          totalOverdue: number;
          completionRatePercent: number;
        };
        records: Array<{
          id: string;
          user: { id: string; name: string };
          documentSha256: string;
          dwellTimeSeconds: number;
          maxScrollPercent: number;
          acknowledgedIp: string | null;
          acknowledgedAt: string;
        }>;
      };
    }>;
  }>;
  auditTrail: Array<{
    sequenceNumber: number;
    eventType: string;
    entityType: string;
    entityId: string;
    actorUserId: string | null;
    actorRole: WorkspaceRole | null;
    actorIp: string | null;
    prevHash: string;
    entryHash: string;
    createdAt: string;
    payloadJson: unknown;
  }>;
}

export async function generateAuditPacketData(
  tx: TenantTransaction,
  params: {
    tenantId: string;
    actorUserId: string;
    filter: AuditPacketFilter;
  }
): Promise<AuditPacketExport> {
  const { tenantId, actorUserId, filter } = params;

  // 1. Verify caller membership & RBAC, fetch profile/tenant metadata, and verify hash chain in parallel
  const [membership, callerUserRows, tenantRows, chainVerification] =
    await Promise.all([
      assertActiveMembership(tx, tenantId, actorUserId),
      tx
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, actorUserId))
        .limit(1),
      tx
        .select({ id: tenants.id, name: tenants.name, slug: tenants.slug })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1),
      verifyTenantAuditChainInTx(tx, tenantId),
    ]);

  assertCanExportAuditPacket(membership);

  const callerUser = callerUserRows[0];
  const tenantRecord = tenantRows[0];

  if (!tenantRecord) {
    throw new DomainError("NOT_FOUND", "Tenant not found", 404);
  }

  // 2. Anti-enumeration checks & fetch matching documents and versions
  let targetDocumentId = filter.documentId;
  const targetVersionId = filter.versionId;

  let matchingDocuments: (typeof documents.$inferSelect)[] = [];
  let matchingVersions: (typeof documentVersions.$inferSelect)[] = [];

  if (targetVersionId) {
    const [version] = await tx
      .select()
      .from(documentVersions)
      .where(
        and(
          eq(documentVersions.tenantId, tenantId),
          eq(documentVersions.id, targetVersionId)
        )
      )
      .limit(1);

    if (!version) {
      throw new DomainError("NOT_FOUND", "Requested document version not found", 404);
    }

    targetDocumentId = version.documentId;
    matchingDocuments = await tx
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.tenantId, tenantId),
          eq(documents.id, targetDocumentId)
        )
      );

    if (matchingDocuments.length === 0) {
      throw new DomainError("NOT_FOUND", "Requested document not found", 404);
    }
    matchingVersions = [version];
  } else if (targetDocumentId) {
    const [docsResult, versionsResult] = await Promise.all([
      tx
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.tenantId, tenantId),
            eq(documents.id, targetDocumentId)
          )
        ),
      tx
        .select()
        .from(documentVersions)
        .where(
          and(
            eq(documentVersions.tenantId, tenantId),
            eq(documentVersions.documentId, targetDocumentId)
          )
        )
        .orderBy(desc(documentVersions.createdAt)),
    ]);

    if (docsResult.length === 0) {
      throw new DomainError("NOT_FOUND", "Requested document not found", 404);
    }
    matchingDocuments = docsResult;
    matchingVersions = versionsResult;
  } else {
    const [docsResult, tenantVersions] = await Promise.all([
      tx.select().from(documents).where(eq(documents.tenantId, tenantId)),
      tx
        .select()
        .from(documentVersions)
        .where(eq(documentVersions.tenantId, tenantId))
        .orderBy(desc(documentVersions.createdAt)),
    ]);

    matchingDocuments = docsResult;
    const docIdSet = new Set(matchingDocuments.map((d) => d.id));
    matchingVersions = tenantVersions.filter((v) => docIdSet.has(v.documentId));
  }

  const versionIds = matchingVersions.map((v) => v.id);

  // 3. Query approval cycles, read assignments, and read acknowledgments in parallel
  const [allCycles, allAssignments, allAcks] =
    versionIds.length > 0
      ? await Promise.all([
          tx
            .select()
            .from(approvalCycles)
            .where(
              and(
                eq(approvalCycles.tenantId, tenantId),
                inArray(approvalCycles.documentVersionId, versionIds)
              )
            )
            .orderBy(approvalCycles.cycleNumber),
          tx
            .select()
            .from(readAssignments)
            .where(
              and(
                eq(readAssignments.tenantId, tenantId),
                inArray(readAssignments.documentVersionId, versionIds)
              )
            ),
          tx
            .select()
            .from(readAcknowledgments)
            .where(
              and(
                eq(readAcknowledgments.tenantId, tenantId),
                inArray(readAcknowledgments.documentVersionId, versionIds)
              )
            )
            .orderBy(desc(readAcknowledgments.acknowledgedAt)),
        ])
      : [[], [], []];

  const cycleIds = allCycles.map((c) => c.id);
  const allSteps =
    cycleIds.length > 0
      ? await tx
          .select()
          .from(approvalSteps)
          .where(
            and(
              eq(approvalSteps.tenantId, tenantId),
              inArray(approvalSteps.approvalCycleId, cycleIds)
            )
          )
          .orderBy(approvalSteps.stepOrder)
      : [];

  // 4. Collect all referenced user IDs for display names
  const allUserIds = new Set<string>();
  allUserIds.add(actorUserId);
  for (const v of matchingVersions) {
    allUserIds.add(v.authorId);
    if (v.publishedBy) allUserIds.add(v.publishedBy);
  }
  for (const c of allCycles) {
    allUserIds.add(c.submittedBy);
  }
  for (const s of allSteps) {
    allUserIds.add(s.assignedApproverId);
    if (s.actedByUserId) allUserIds.add(s.actedByUserId);
  }
  for (const a of allAcks) {
    allUserIds.add(a.userId);
  }

  // 5. Build audit log scope conditions and fetch users + audit count + audit rows in parallel
  const auditConditions = [eq(auditLogs.tenantId, tenantId)];
  if (filter.startDate) {
    auditConditions.push(gte(auditLogs.createdAt, new Date(filter.startDate)));
  }
  if (filter.endDate) {
    auditConditions.push(lte(auditLogs.createdAt, new Date(filter.endDate)));
  }
  if (targetVersionId || targetDocumentId) {
    // Collect entity IDs related to this document/version
    const relevantEntityIds = new Set<string>();
    if (targetDocumentId) relevantEntityIds.add(targetDocumentId);
    for (const vid of versionIds) relevantEntityIds.add(vid);
    for (const cid of allCycles.map((c) => c.id)) relevantEntityIds.add(cid);
    for (const sid of allSteps.map((s) => s.id)) relevantEntityIds.add(sid);
    for (const aid of allAcks.map((a) => a.id)) relevantEntityIds.add(aid);

    if (relevantEntityIds.size > 0) {
      auditConditions.push(inArray(auditLogs.entityId, Array.from(relevantEntityIds)));
    }
  }

  const [userRecords, auditCountRes, auditRows] = await Promise.all([
    allUserIds.size > 0
      ? tx
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(inArray(users.id, Array.from(allUserIds)))
      : Promise.resolve([]),
    tx
      .select({ count: count() })
      .from(auditLogs)
      .where(and(...auditConditions)),
    tx
      .select()
      .from(auditLogs)
      .where(and(...auditConditions))
      .orderBy(desc(auditLogs.sequenceNumber))
      .limit(1000),
  ]);

  const userMap = new Map<string, { id: string; name: string }>();
  for (const u of userRecords) {
    userMap.set(u.id, u);
  }

  const totalAuditEntriesInScope = Number(auditCountRes[0]?.count ?? 0);
  const auditTrailTruncated = totalAuditEntriesInScope > auditRows.length;

  // 11. Assemble structured documents tree
  const documentsTree = matchingDocuments.map((doc) => {
    const docVersions = matchingVersions.filter((v) => v.documentId === doc.id);
    return {
      id: doc.id,
      documentCode: doc.documentCode,
      category: doc.category,
      createdAt: doc.createdAt.toISOString(),
      versions: docVersions.map((ver) => {
        const verCycles = allCycles.filter((c) => c.documentVersionId === ver.id);
        const verAssignments = allAssignments.filter(
          (a) => a.documentVersionId === ver.id
        );
        const verAcks = allAcks.filter((a) => a.documentVersionId === ver.id);

        const totalAssigned = verAssignments.length;
        const totalAcknowledged = verAcks.length;
        const totalPending = Math.max(0, totalAssigned - totalAcknowledged);
        const now = new Date();
        const totalOverdue = verAssignments.filter(
          (a) => a.status === "PENDING" && a.dueAt && new Date(a.dueAt) < now
        ).length;
        const completionRatePercent =
          totalAssigned > 0
            ? Math.round((totalAcknowledged / totalAssigned) * 1000) / 10
            : 100;

        return {
          id: ver.id,
          versionMajor: ver.versionMajor,
          versionMinor: ver.versionMinor,
          versionLabel: `v${ver.versionMajor}.${ver.versionMinor}`,
          title: ver.title,
          contentFormat: ver.contentFormat,
          lifecycleState: ver.lifecycleState,
          documentSha256: ver.documentSha256,
          fileSha256: ver.fileSha256,
          fileSizeBytes: ver.fileSizeBytes,
          fileMimeType: ver.fileMimeType,
          effectiveDate: ver.effectiveDate ? ver.effectiveDate.toISOString() : null,
          publishedAt: ver.publishedAt ? ver.publishedAt.toISOString() : null,
          publishedBy: ver.publishedBy
            ? {
                id: ver.publishedBy,
                name: userMap.get(ver.publishedBy)?.name ?? "User",
              }
            : null,
          author: {
            id: ver.authorId,
            name: userMap.get(ver.authorId)?.name ?? "Author",
          },
          parentVersionId: ver.parentVersionId,
          createdAt: ver.createdAt.toISOString(),
          updatedAt: ver.updatedAt.toISOString(),
          approvalCycles: verCycles.map((cycle) => {
            const cycleSteps = allSteps.filter(
              (s) => s.approvalCycleId === cycle.id
            );
            return {
              id: cycle.id,
              cycleNumber: cycle.cycleNumber,
              status: cycle.status,
              submittedSha256: cycle.submittedSha256,
              submittedBy: {
                id: cycle.submittedBy,
                name: userMap.get(cycle.submittedBy)?.name ?? "User",
              },
              invalidatedReason: cycle.invalidatedReason,
              createdAt: cycle.createdAt.toISOString(),
              closedAt: cycle.closedAt ? cycle.closedAt.toISOString() : null,
              steps: cycleSteps.map((step) => ({
                id: step.id,
                stepOrder: step.stepOrder,
                status: step.status,
                assignedApprover: {
                  id: step.assignedApproverId,
                  name: userMap.get(step.assignedApproverId)?.name ?? "Approver",
                },
                actedBy: step.actedByUserId
                  ? {
                      userId: step.actedByUserId,
                      fullName:
                        step.actedByFullName ??
                        userMap.get(step.actedByUserId)?.name ??
                        null,
                      role: step.actedByRole,
                      ipAddress: step.actedIpAddress,
                    }
                  : null,
                authMethod: step.authMethod,
                signedDocumentSha256: step.signedDocumentSha256,
                decisionIntent: step.decisionIntent,
                selfApprovalOverrideUsed: step.selfApprovalOverrideUsed ?? false,
                overriddenFromApproverId: step.overriddenFromApproverId,
                actedAt: step.actedAt ? step.actedAt.toISOString() : null,
              })),
            };
          }),
          readAcknowledgments: {
            summary: {
              totalAssigned,
              totalAcknowledged,
              totalPending,
              totalOverdue,
              completionRatePercent,
            },
            records: verAcks.map((ack) => ({
              id: ack.id,
              user: {
                id: ack.userId,
                name: userMap.get(ack.userId)?.name ?? "Reader",
              },
              documentSha256: ack.documentSha256,
              dwellTimeSeconds: ack.dwellTimeSeconds,
              maxScrollPercent: ack.maxScrollPercent,
              acknowledgedIp: ack.acknowledgedIp,
              acknowledgedAt: ack.acknowledgedAt.toISOString(),
            })),
          },
        };
      }),
    };
  });

  const exportPayload: AuditPacketExport = {
    exportMetadata: {
      exportId: crypto.randomUUID(),
      generatedAt: new Date().toISOString(),
      generatedBy: {
        userId: actorUserId,
        fullName: callerUser?.name ?? "Quality Manager",
        role: membership.role,
      },
      tenant: {
        id: tenantRecord.id,
        name: tenantRecord.name,
        slug: tenantRecord.slug,
      },
      filter,
      specVersion: "1.0.0",
      system: "VeriDoc Document & SOP Approval Workspace",
    },
    verification: {
      chainVerified: chainVerification.verified,
      totalEntriesInChain: chainVerification.totalEntries,
      headHash: chainVerification.headHash,
      genesisPrevHash: "0".repeat(64),
      hashAlgorithm: "SHA-256",
      verifiedAt: new Date().toISOString(),
      failureReason: chainVerification.failureReason,
      failedSequenceNumber: chainVerification.failedSequenceNumber,
    },
    complianceDisclosure: {
      standard: "ISO 9001:2015 §7.5 / GMP Document Control Assistance",
      immutabilityArchitecture:
        "Append-only database controls with application-level SHA-256 hash chaining",
      infrastructureBoundaryNotice:
        "Audit records use append-only database controls and application-level SHA-256 hash chaining, subject to cloud infrastructure security boundaries.",
      claimsBoundary: {
        fda21CfrPart11Certified: false,
        part11Notice:
          "This export assists with document control frameworks (ISO 9001, ISO 27001, SOC 2, GMP). Universal FDA 21 CFR Part 11 certification requires customer-specific operational validation (IQ/OQ/PQ) and is not claimed out-of-the-box in Slice 1 (DEC-02).",
        tamperProofAbsoluteClaim: false,
        tamperProofNotice:
          "No computing system provides unconditional tamper-proof guarantees against physical hardware or cloud infrastructure compromise (DEC-08).",
      },
    },
    scope: {
      type:
        targetDocumentId || targetVersionId
          ? "DOCUMENT_AUDIT_PACKET"
          : "TENANT_AUDIT_SUMMARY",
      documentCount: matchingDocuments.length,
      versionCount: matchingVersions.length,
      auditTrailTruncated,
      totalAuditEntriesInScope,
    },
    documents: documentsTree,
    auditTrail: auditRows.map((row) => ({
      sequenceNumber: row.sequenceNumber,
      eventType: row.eventType,
      entityType: row.entityType,
      entityId: row.entityId,
      actorUserId: row.actorUserId,
      actorRole: row.actorRole,
      actorIp: row.actorIp,
      prevHash: row.prevHash,
      entryHash: row.entryHash,
      createdAt: row.createdAt.toISOString(),
      payloadJson: row.payloadJson,
    })),
  };

  return exportPayload;
}
