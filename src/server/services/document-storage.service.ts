import "server-only";
import { and, eq } from "drizzle-orm";
import type { TenantTransaction } from "@/db/context";
import { documents, documentVersions } from "@/db/schema";
import {
  deleteDocumentPdf,
  uploadDocumentPdf,
} from "@/lib/storage/storage.service";
import { computeDocumentSha256 } from "@/lib/crypto/crypto.service";
import { appendAuditLog } from "@/server/services/audit.service";
import { ApprovalService } from "@/server/services/approval.service";
import { assertActiveMembership } from "@/server/policies/membership.policy";
import type { ActiveMembership } from "@/server/policies/rbac.types";
import { DomainError } from "@/types/errors";

export interface UploadDocumentVersionPdfParams {
  tenantId: string;
  userId: string;
  documentId: string;
  versionId: string;
  fileBuffer: Buffer | Uint8Array;
  fileName?: string;
  expectedRowVersion?: number;
  confirmInvalidateApprovals?: boolean;
}

export interface PreflightDocumentPdfUploadParams {
  tenantId: string;
  userId: string;
  documentId: string;
  versionId: string;
  expectedRowVersion?: number;
  confirmInvalidateApprovals?: boolean;
}

export interface PreflightDocumentPdfUploadResult {
  versionId: string;
  rowVersion: number;
  lifecycleState: string;
}

export interface CommitDocumentPdfUploadParams {
  tenantId: string;
  userId: string;
  documentId: string;
  versionId: string;
  storageKey: string;
  fileSizeBytes: number;
  fileSha256: string;
  expectedRowVersion?: number;
  confirmInvalidateApprovals?: boolean;
}

export interface UploadDocumentVersionPdfResult {
  versionId: string;
  fileSizeBytes: number;
  fileSha256: string;
  documentSha256: string;
  lifecycleState: string;
  rowVersion: number;
}

async function loadAndValidateVersionForUpload(
  tx: TenantTransaction,
  params: PreflightDocumentPdfUploadParams,
  options: { lockForUpdate: boolean }
) {
  const {
    tenantId,
    userId,
    documentId,
    versionId,
    expectedRowVersion,
    confirmInvalidateApprovals,
  } = params;

  const membership = await assertActiveMembership(tx, tenantId, userId);

  if (
    membership.role !== "WORKSPACE_ADMIN" &&
    membership.role !== "QUALITY_MANAGER" &&
    membership.role !== "DOCUMENT_AUTHOR"
  ) {
    throw new DomainError(
      "FORBIDDEN",
      "Insufficient permissions to upload document PDF",
      403
    );
  }

  const baseQuery = tx
    .select({
      id: documentVersions.id,
      tenantId: documentVersions.tenantId,
      documentId: documentVersions.documentId,
      lifecycleState: documentVersions.lifecycleState,
      authorId: documentVersions.authorId,
      rowVersion: documentVersions.rowVersion,
      versionMajor: documentVersions.versionMajor,
      versionMinor: documentVersions.versionMinor,
      versionLabel: documentVersions.versionLabel,
      title: documentVersions.title,
      markdownContent: documentVersions.markdownContent,
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
        eq(documentVersions.id, versionId),
        eq(documentVersions.documentId, documentId),
        eq(documentVersions.tenantId, tenantId)
      )
    );

  const [version] = options.lockForUpdate
    ? await baseQuery.for("update")
    : await baseQuery.limit(1);

  if (!version) {
    throw new DomainError("NOT_FOUND", "Document version not found", 404);
  }

  if (membership.role === "DOCUMENT_AUTHOR" && version.authorId !== userId) {
    throw new DomainError(
      "FORBIDDEN",
      "Document Authors can only modify document versions they authored",
      403
    );
  }

  if (expectedRowVersion !== undefined && !Number.isNaN(expectedRowVersion)) {
    if (version.rowVersion !== expectedRowVersion) {
      throw new DomainError(
        "OPTIMISTIC_LOCK_CONFLICT",
        `Version conflict: expected row version ${expectedRowVersion} does not match current ${version.rowVersion}`,
        409
      );
    }
  }

  if (
    version.lifecycleState === "APPROVED" ||
    version.lifecycleState === "PUBLISHED" ||
    version.lifecycleState === "SUPERSEDED" ||
    version.lifecycleState === "RETIRED"
  ) {
    throw new DomainError(
      "VERSION_IMMUTABLE",
      `Version is immutable in state '${version.lifecycleState}' (BR-VER-02)`,
      409
    );
  }

  if (
    version.lifecycleState === "PENDING_APPROVAL" &&
    !confirmInvalidateApprovals
  ) {
    throw new DomainError(
      "INVALIDATION_CONFIRMATION_REQUIRED",
      "Modifying a version in PENDING_APPROVAL requires confirmInvalidateApprovals: true",
      409
    );
  }

  return { membership, version };
}

type ValidatedVersion = Awaited<
  ReturnType<typeof loadAndValidateVersionForUpload>
>["version"];

async function applyPdfUploadCommitInTx(
  tx: TenantTransaction,
  membership: ActiveMembership,
  version: ValidatedVersion,
  params: {
    tenantId: string;
    userId: string;
    documentId: string;
    versionId: string;
    storageKey: string;
    fileSizeBytes: number;
    fileSha256: string;
  }
): Promise<UploadDocumentVersionPdfResult> {
  const {
    tenantId,
    userId,
    documentId,
    versionId,
    storageKey,
    fileSizeBytes,
    fileSha256,
  } = params;

  let targetState = version.lifecycleState;
  let targetMinor = version.versionMinor;

  // Handle mid-approval edit / replacement (DEC-04, BR-APP-02)
  if (version.lifecycleState === "PENDING_APPROVAL") {
    await ApprovalService.invalidateActiveCycle(tx, {
      tenantId,
      versionId,
      actorUserId: userId,
      actorRole: membership.role,
      reason: "PDF replacement uploaded mid-approval (DEC-04)",
    });

    targetState = "DRAFT";
    targetMinor = version.versionMinor + 1;

    await appendAuditLog(tx, {
      tenantId,
      eventType: "APPROVAL_INVALIDATED_BY_EDIT",
      entityType: "DOCUMENT_VERSION",
      entityId: versionId,
      actorUserId: userId,
      actorRole: membership.role,
      payloadJson: {
        reason: "PDF uploaded mid-approval",
        previousVersionMinor: version.versionMinor,
        newVersionMinor: targetMinor,
      },
    });
  }

  const nextVersionLabel = `v${version.versionMajor}.${targetMinor}`;
  const newDocumentSha256 = computeDocumentSha256({
    markdownContent: version.markdownContent,
    fileSha256,
    metadata: {
      documentCode: version.documentCode,
      tenantId,
      title: version.title,
      versionLabel: nextVersionLabel,
    },
  });

  const nextRowVersion = version.rowVersion + 1;
  await tx
    .update(documentVersions)
    .set({
      fileStorageKey: storageKey,
      fileMimeType: "application/pdf",
      fileSizeBytes,
      fileSha256,
      documentSha256: newDocumentSha256,
      lifecycleState: targetState,
      versionMinor: targetMinor,
      rowVersion: nextRowVersion,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(documentVersions.id, versionId),
        eq(documentVersions.tenantId, tenantId)
      )
    );

  await appendAuditLog(tx, {
    tenantId,
    eventType: "DOCUMENT_PDF_UPLOADED",
    entityType: "DOCUMENT_VERSION",
    entityId: versionId,
    actorUserId: userId,
    actorRole: membership.role,
    payloadJson: {
      documentId,
      versionId,
      fileStorageKey: storageKey,
      fileSizeBytes,
      fileSha256,
      documentSha256: newDocumentSha256,
      rowVersion: nextRowVersion,
      lifecycleState: targetState,
    },
  });

  return {
    versionId,
    fileSizeBytes,
    fileSha256,
    documentSha256: newDocumentSha256,
    lifecycleState: targetState,
    rowVersion: nextRowVersion,
  };
}

/**
 * TX1 pre-flight check run before external Storage HTTP calls so locks are never held over I/O.
 */
export async function preflightDocumentPdfUpload(
  tx: TenantTransaction,
  params: PreflightDocumentPdfUploadParams
): Promise<PreflightDocumentPdfUploadResult> {
  const { version } = await loadAndValidateVersionForUpload(tx, params, {
    lockForUpdate: false,
  });
  return {
    versionId: version.id,
    rowVersion: version.rowVersion,
    lifecycleState: version.lifecycleState,
  };
}

/**
 * TX2 authoritative commit after Storage upload/verification succeeds.
 * Acquires FOR UPDATE, re-verifies optimistic lock & state, applies DEC-04 invalidation,
 * updates metadata, and appends audit records.
 */
export async function commitDocumentPdfUpload(
  tx: TenantTransaction,
  params: CommitDocumentPdfUploadParams
): Promise<UploadDocumentVersionPdfResult> {
  const { membership, version } = await loadAndValidateVersionForUpload(
    tx,
    params,
    { lockForUpdate: true }
  );

  return await applyPdfUploadCommitInTx(tx, membership, version, {
    tenantId: params.tenantId,
    userId: params.userId,
    documentId: params.documentId,
    versionId: params.versionId,
    storageKey: params.storageKey,
    fileSizeBytes: params.fileSizeBytes,
    fileSha256: params.fileSha256,
  });
}

/**
 * Backward-compatible single-transaction helper for direct callers/tests.
 */
export async function uploadDocumentVersionPdf(
  tx: TenantTransaction,
  params: UploadDocumentVersionPdfParams
): Promise<UploadDocumentVersionPdfResult> {
  const { membership, version } = await loadAndValidateVersionForUpload(
    tx,
    params,
    { lockForUpdate: true }
  );

  const uploadResult = await uploadDocumentPdf(
    params.tenantId,
    params.documentId,
    params.versionId,
    params.fileBuffer,
    params.fileName || `${params.versionId}.pdf`
  );

  try {
    return await applyPdfUploadCommitInTx(tx, membership, version, {
      tenantId: params.tenantId,
      userId: params.userId,
      documentId: params.documentId,
      versionId: params.versionId,
      storageKey: uploadResult.storageKey,
      fileSizeBytes: uploadResult.fileSizeBytes,
      fileSha256: uploadResult.fileSha256,
    });
  } catch (error) {
    await deleteDocumentPdf(uploadResult.storageKey).catch(() => {});
    throw error;
  }
}
