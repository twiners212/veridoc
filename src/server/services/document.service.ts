import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { TenantTransaction } from "@/db/context";
import {
  approvalCycles,
  approvalSteps,
  documents,
  documentVersions,
  users,
} from "@/db/schema";
import { canViewDocumentVersion, type ActiveMembership } from "@/server/policies";
import { DomainError } from "@/types/errors";
import type {
  DocumentDetailResult,
  DocumentListItem,
  DocumentVersionDetail,
  DocumentVersionSummary,
  ListDocumentsFilters,
  ListDocumentsResult,
} from "@/types/documents";

/**
 * Resolves all assigned approver user IDs grouped by documentVersionId
 * so APPROVER_REVIEWER visibility checks evaluate assigned cycles accurately.
 */
export async function getAssignedApproverMapInTx(
  tx: TenantTransaction,
  tenantId: string,
  versionIds: string[]
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (versionIds.length === 0) {
    return result;
  }

  const rows = await tx
    .select({
      documentVersionId: approvalCycles.documentVersionId,
      assignedApproverId: approvalSteps.assignedApproverId,
    })
    .from(approvalSteps)
    .innerJoin(
      approvalCycles,
      and(
        eq(approvalCycles.tenantId, approvalSteps.tenantId),
        eq(approvalCycles.id, approvalSteps.approvalCycleId)
      )
    )
    .where(
      and(
        eq(approvalCycles.tenantId, tenantId),
        inArray(approvalCycles.documentVersionId, versionIds)
      )
    );

  for (const row of rows) {
    const existing = result.get(row.documentVersionId);
    if (existing) {
      if (!existing.includes(row.assignedApproverId)) {
        existing.push(row.assignedApproverId);
      }
    } else {
      result.set(row.documentVersionId, [row.assignedApproverId]);
    }
  }

  return result;
}

export async function getVersionAssignedApproverIdsInTx(
  tx: TenantTransaction,
  tenantId: string,
  versionId: string
): Promise<string[]> {
  const map = await getAssignedApproverMapInTx(tx, tenantId, [versionId]);
  return map.get(versionId) ?? [];
}

export async function listDocumentsInTx(
  tx: TenantTransaction,
  actor: ActiveMembership,
  tenantId: string,
  filters: Omit<ListDocumentsFilters, "tenantId">
): Promise<ListDocumentsResult> {
  let docQuery = tx
    .select({
      id: documents.id,
      tenantId: documents.tenantId,
      documentCode: documents.documentCode,
      category: documents.category,
      createdBy: documents.createdBy,
      createdAt: documents.createdAt,
      updatedAt: documents.updatedAt,
    })
    .from(documents)
    .where(eq(documents.tenantId, tenantId))
    .$dynamic();

  if (filters.category && filters.category !== "ALL") {
    docQuery = docQuery.where(eq(documents.category, filters.category));
  }

  const allDocs = await docQuery;

  const allVersions = await tx
    .select({
      id: documentVersions.id,
      documentId: documentVersions.documentId,
      parentVersionId: documentVersions.parentVersionId,
      versionMajor: documentVersions.versionMajor,
      versionMinor: documentVersions.versionMinor,
      title: documentVersions.title,
      contentFormat: documentVersions.contentFormat,
      lifecycleState: documentVersions.lifecycleState,
      authorId: documentVersions.authorId,
      rowVersion: documentVersions.rowVersion,
      documentSha256: documentVersions.documentSha256,
      fileStorageKey: documentVersions.fileStorageKey,
      createdAt: documentVersions.createdAt,
      updatedAt: documentVersions.updatedAt,
      authorName: users.name,
    })
    .from(documentVersions)
    .leftJoin(users, eq(users.id, documentVersions.authorId))
    .where(eq(documentVersions.tenantId, tenantId));

  const assignedApproverMap =
    actor.role === "APPROVER_REVIEWER"
      ? await getAssignedApproverMapInTx(
          tx,
          tenantId,
          allVersions.map((v) => v.id)
        )
      : new Map<string, string[]>();

  const versionsByDoc = new Map<string, typeof allVersions>();
  for (const v of allVersions) {
    const isVisible = canViewDocumentVersion(actor, {
      authorId: v.authorId,
      lifecycleState: v.lifecycleState,
      assignedApproverIds: assignedApproverMap.get(v.id),
    });
    if (!isVisible) continue;

    const list = versionsByDoc.get(v.documentId) ?? [];
    list.push(v);
    versionsByDoc.set(v.documentId, list);
  }

  const items: DocumentListItem[] = [];
  for (const doc of allDocs) {
    const docVersions = versionsByDoc.get(doc.id);
    if (!docVersions || docVersions.length === 0) {
      continue;
    }

    docVersions.sort((a, b) => {
      if (b.versionMajor !== a.versionMajor) {
        return b.versionMajor - a.versionMajor;
      }
      return b.versionMinor - a.versionMinor;
    });

    const latest = docVersions[0];

    if (filters.status && latest.lifecycleState !== filters.status) {
      continue;
    }

    if (filters.search) {
      const query = filters.search.toLowerCase();
      const matchesCode = doc.documentCode.toLowerCase().includes(query);
      const matchesTitle = latest.title.toLowerCase().includes(query);
      if (!matchesCode && !matchesTitle) {
        continue;
      }
    }

    items.push({
      id: doc.id,
      tenantId: doc.tenantId,
      documentCode: doc.documentCode,
      title: latest.title,
      category: doc.category,
      contentFormat: latest.contentFormat,
      currentVersionLabel: `v${latest.versionMajor}.${latest.versionMinor}`,
      currentVersionId: latest.id,
      lifecycleState: latest.lifecycleState,
      documentSha256: latest.documentSha256,
      versionCount: docVersions.length,
      authorName: latest.authorName,
      authorId: latest.authorId,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: latest.updatedAt.toISOString(),
    });
  }

  items.sort((a, b) => {
    const order = filters.sortOrder === "asc" ? 1 : -1;
    switch (filters.sortBy) {
      case "documentCode":
        return a.documentCode.localeCompare(b.documentCode) * order;
      case "title":
        return a.title.localeCompare(b.title) * order;
      case "createdAt":
        return (
          (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) *
          order
        );
      case "updatedAt":
      default:
        return (
          (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) *
          order
        );
    }
  });

  const total = items.length;
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 20;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const paginated = items.slice((page - 1) * limit, page * limit);

  return {
    documents: paginated,
    total,
    page,
    limit,
    totalPages,
  };
}

export async function getDocumentDetailInTx(
  tx: TenantTransaction,
  actor: ActiveMembership,
  tenantId: string,
  documentId: string
): Promise<DocumentDetailResult> {
  const [doc] = await tx
    .select()
    .from(documents)
    .where(and(eq(documents.tenantId, tenantId), eq(documents.id, documentId)))
    .limit(1);

  if (!doc) {
    throw new DomainError("NOT_FOUND", "Document not found", 404);
  }

  const versions = await tx
    .select({
      id: documentVersions.id,
      documentId: documentVersions.documentId,
      parentVersionId: documentVersions.parentVersionId,
      versionMajor: documentVersions.versionMajor,
      versionMinor: documentVersions.versionMinor,
      title: documentVersions.title,
      contentFormat: documentVersions.contentFormat,
      markdownContent: documentVersions.markdownContent,
      fileStorageKey: documentVersions.fileStorageKey,
      fileMimeType: documentVersions.fileMimeType,
      fileSizeBytes: documentVersions.fileSizeBytes,
      fileSha256: documentVersions.fileSha256,
      documentSha256: documentVersions.documentSha256,
      lifecycleState: documentVersions.lifecycleState,
      authorId: documentVersions.authorId,
      effectiveDate: documentVersions.effectiveDate,
      publishedAt: documentVersions.publishedAt,
      publishedBy: documentVersions.publishedBy,
      rowVersion: documentVersions.rowVersion,
      createdAt: documentVersions.createdAt,
      updatedAt: documentVersions.updatedAt,
      authorName: users.name,
    })
    .from(documentVersions)
    .leftJoin(users, eq(users.id, documentVersions.authorId))
    .where(
      and(
        eq(documentVersions.tenantId, tenantId),
        eq(documentVersions.documentId, doc.id)
      )
    )
    .orderBy(
      desc(documentVersions.versionMajor),
      desc(documentVersions.versionMinor)
    );

  const assignedApproverMap =
    actor.role === "APPROVER_REVIEWER"
      ? await getAssignedApproverMapInTx(
          tx,
          tenantId,
          versions.map((v) => v.id)
        )
      : new Map<string, string[]>();

  const visibleVersions = versions.filter((v) =>
    canViewDocumentVersion(actor, {
      authorId: v.authorId,
      lifecycleState: v.lifecycleState,
      assignedApproverIds: assignedApproverMap.get(v.id),
    })
  );

  if (visibleVersions.length === 0) {
    throw new DomainError("NOT_FOUND", "Document not found", 404);
  }

  const activeVersion = visibleVersions[0];

  const summaries: DocumentVersionSummary[] = visibleVersions.map((v) => ({
    id: v.id,
    documentId: v.documentId,
    parentVersionId: v.parentVersionId,
    versionMajor: v.versionMajor,
    versionMinor: v.versionMinor,
    versionLabel: `v${v.versionMajor}.${v.versionMinor}`,
    title: v.title,
    contentFormat: v.contentFormat,
    markdownContent: v.markdownContent,
    fileMimeType: v.fileMimeType,
    fileSizeBytes: v.fileSizeBytes,
    fileSha256: v.fileSha256,
    lifecycleState: v.lifecycleState,
    authorId: v.authorId,
    authorName: v.authorName,
    effectiveDate: v.effectiveDate?.toISOString() ?? null,
    publishedAt: v.publishedAt?.toISOString() ?? null,
    rowVersion: v.rowVersion,
    documentSha256: v.documentSha256,
    fileStorageKey: v.fileStorageKey,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
  }));

  const activeDetail: DocumentVersionDetail = {
    ...summaries[0],
    markdownContent: activeVersion.markdownContent,
    fileMimeType: activeVersion.fileMimeType,
    fileSizeBytes: activeVersion.fileSizeBytes,
    fileSha256: activeVersion.fileSha256,
    effectiveDate: activeVersion.effectiveDate?.toISOString() ?? null,
    publishedAt: activeVersion.publishedAt?.toISOString() ?? null,
    publishedBy: activeVersion.publishedBy,
    authorName: activeVersion.authorName,
  };

  return {
    document: {
      id: doc.id,
      tenantId: doc.tenantId,
      documentCode: doc.documentCode,
      category: doc.category,
      createdBy: doc.createdBy,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    },
    versions: summaries,
    activeVersion: activeDetail,
  };
}
