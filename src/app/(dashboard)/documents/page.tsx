import * as React from "react";
import { redirect } from "next/navigation";
import { DocumentsView } from "@/components/features/documents/documents-view";
import type { DocumentTableRow } from "@/components/features/documents/documents-table";
import { loadDocumentsPageBundleAction } from "@/server/actions/dashboard-loaders.actions";

export default async function DocumentsPage() {
  const bundle = await loadDocumentsPageBundleAction();

  if (bundle.status === "UNAUTHENTICATED") {
    redirect("/auth/sign-in");
  }

  const { authContext: ctx } = bundle;
  const loadedDocuments: DocumentTableRow[] = bundle.documents.map((d) => ({
    id: d.id,
    documentCode: d.documentCode,
    title: d.title,
    category: d.category,
    contentFormat: d.contentFormat,
    currentVersionLabel: d.currentVersionLabel,
    currentVersionId: d.currentVersionId,
    lifecycleState: d.lifecycleState,
    documentSha256: d.documentSha256,
    versionCount: d.versionCount,
    updatedAt: d.updatedAt,
    authorName: d.authorName,
  }));

  return (
    <DocumentsView
      initialDocuments={loadedDocuments}
      tenantId={ctx.tenantId}
      tenantName={ctx.tenantName}
      currentUserRole={ctx.role}
      userName={ctx.userName}
      userEmail={ctx.userEmail}
    />
  );
}
