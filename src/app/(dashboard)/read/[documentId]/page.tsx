import * as React from "react";
import { notFound, redirect } from "next/navigation";
import { SopReaderView } from "@/components/features/reader/sop-reader-view";
import { loadReadDocumentPageBundleAction } from "@/server/actions/dashboard-loaders.actions";
import { acknowledgeDocumentAction } from "@/server/actions/reader.actions";

interface ReadDocumentPageProps {
  params: Promise<{ documentId: string }>;
  searchParams?: Promise<{
    versionId?: string;
    assignmentId?: string;
    readOnly?: string;
  }>;
}

export default async function ReadDocumentPage({
  params,
  searchParams,
}: ReadDocumentPageProps) {
  const [{ documentId }, sParams] = await Promise.all([params, searchParams]);
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      documentId
    );
  if (!isUuid) {
    notFound();
  }

  const bundle = await loadReadDocumentPageBundleAction(documentId);

  if (bundle.status === "UNAUTHENTICATED") {
    redirect("/auth/sign-in");
  }

  if (bundle.status === "NOT_FOUND") {
    notFound();
  }

  const { authContext: ctx, detail } = bundle;
  const requestedVersionId = sParams?.versionId;
  const assignmentId = sParams?.assignmentId;
  const isReadOnly = sParams?.readOnly === "true";

  const doc = detail.document;
  const version =
    (requestedVersionId
      ? detail.versions.find((v) => v.id === requestedVersionId)
      : null) ||
    detail.activeVersion ||
    detail.versions[0];

  if (!version) {
    notFound();
  }

  const documentData = {
    documentId: doc.id,
    versionId: version.id,
    documentCode: doc.documentCode,
    title: version.title,
    versionNumber:
      version.versionLabel || `v${version.versionMajor}.${version.versionMinor}`,
    category: doc.category,
    targetGroupName: ctx.tenantName,
    effectiveDate:
      version.effectiveDate ||
      detail.activeVersion?.effectiveDate ||
      new Date(doc.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    documentSha256: version.documentSha256 || "",
    contentFormat: version.contentFormat,
    markdownContent:
      version.markdownContent ??
      (version.id === detail.activeVersion?.id
        ? detail.activeVersion?.markdownContent
        : null),
    fileStorageKey: version.fileStorageKey,
  };

  const tenantId = ctx.tenantId;

  async function handleAcknowledgeAction(payload: {
    readAssignmentId: string;
    documentVersionId: string;
    dwellTimeSeconds: number;
    maxScrollPercent: number;
    bindingConfirmation: true;
    expectedDocumentSha256: string;
  }) {
    "use server";

    try {
      const ackRes = await acknowledgeDocumentAction({
        ...payload,
        tenantId,
      });
      if (ackRes.success) {
        return {
          success: true,
          data: {
            acknowledgmentId: ackRes.data.acknowledgmentId,
            acknowledgedAt: ackRes.data.acknowledgedAt,
            documentSha256: ackRes.data.documentSha256,
          },
        };
      }
      return {
        success: false,
        error: {
          code: ackRes.error.code,
          message: ackRes.error.message,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error
              ? err.message
              : "Failed to record acknowledgment",
        },
      };
    }
  }

  return (
    <SopReaderView
      documentId={documentData.documentId}
      versionId={documentData.versionId}
      assignmentId={assignmentId}
      documentCode={documentData.documentCode}
      title={documentData.title}
      versionNumber={documentData.versionNumber}
      category={documentData.category}
      targetGroupName={documentData.targetGroupName}
      effectiveDate={documentData.effectiveDate}
      documentSha256={documentData.documentSha256}
      contentFormat={documentData.contentFormat}
      markdownContent={documentData.markdownContent}
      fileStorageKey={documentData.fileStorageKey}
      isAlreadyAcknowledged={isReadOnly}
      currentUser={{
        id: ctx.userId,
        name: ctx.userName,
        role: ctx.role,
      }}
      onAcknowledge={handleAcknowledgeAction}
    />
  );
}
