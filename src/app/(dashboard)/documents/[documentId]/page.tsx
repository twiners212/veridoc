import * as React from "react";
import { notFound, redirect } from "next/navigation";
import {
  DocumentDetailView,
  type DocumentDetailData,
  type DocumentVersionDetail,
} from "@/components/features/documents/document-detail-view";
import { loadDocumentDetailPageBundleAction } from "@/server/actions/dashboard-loaders.actions";
import type { DocumentLifecycleState } from "@/types/roles";

interface DocumentDetailPageProps {
  params: Promise<{ documentId: string }>;
}

export default async function DocumentDetailPage({
  params,
}: DocumentDetailPageProps) {
  const { documentId } = await params;
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      documentId
    );
  if (!isUuid) {
    notFound();
  }

  const bundle = await loadDocumentDetailPageBundleAction(documentId);

  if (bundle.status === "UNAUTHENTICATED") {
    redirect("/auth/sign-in");
  }

  if (bundle.status === "NOT_FOUND" || !bundle.detail.activeVersion) {
    notFound();
  }

  const { authContext: ctx, detail } = bundle;
  const mappedVersions: DocumentVersionDetail[] = detail.versions.map((v) => {
    const isActive = v.id === detail.activeVersion?.id;
    return {
      id: v.id,
      documentId: v.documentId,
      parentVersionId: v.parentVersionId,
      versionMajor: v.versionMajor,
      versionMinor: v.versionMinor,
      versionLabel: v.versionLabel || `v${v.versionMajor}.${v.versionMinor}`,
      title: v.title,
      contentFormat: v.contentFormat,
      markdownContent:
        v.markdownContent ??
        (isActive ? detail.activeVersion?.markdownContent : null),
      fileStorageKey: v.fileStorageKey,
      fileMimeType:
        v.fileMimeType ?? (isActive ? detail.activeVersion?.fileMimeType : null),
      fileSizeBytes:
        v.fileSizeBytes ??
        (isActive ? detail.activeVersion?.fileSizeBytes : null),
      fileSha256:
        v.fileSha256 ?? (isActive ? detail.activeVersion?.fileSha256 : null),
      documentSha256: v.documentSha256,
      lifecycleState: v.lifecycleState as DocumentLifecycleState,
      authorId: v.authorId,
      authorName:
        v.authorName ?? (isActive ? detail.activeVersion?.authorName : null),
      rowVersion: v.rowVersion,
      effectiveDate:
        v.effectiveDate ??
        (isActive ? detail.activeVersion?.effectiveDate : null),
      publishedAt:
        v.publishedAt ?? (isActive ? detail.activeVersion?.publishedAt : null),
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
    };
  });

  const docData: DocumentDetailData = {
    id: detail.document.id,
    tenantId: detail.document.tenantId,
    documentCode: detail.document.documentCode,
    category: detail.document.category,
    createdBy: detail.document.createdBy,
    createdAt: detail.document.createdAt,
    updatedAt: detail.document.updatedAt,
    versions: mappedVersions,
    currentVersion:
      mappedVersions.find((v) => v.id === detail.activeVersion?.id) ||
      mappedVersions[0],
  };

  return (
    <DocumentDetailView
      initialData={docData}
      currentUserRole={ctx.role}
      currentUserId={ctx.userId}
      userName={ctx.userName}
      userEmail={ctx.userEmail}
      allowSingleAuthorOverride={bundle.allowSingleAuthorOverride}
      availableApprovers={bundle.availableApprovers}
    />
  );
}
