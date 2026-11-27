"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Upload, FileText, ShieldCheck, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TopUtilityBar } from "@/components/layout/top-utility-bar";
import { DocumentsTable, type DocumentTableRow } from "./documents-table";
import { CreateDocumentModal } from "./create-document-modal";
import type { WorkspaceRole } from "@/types/roles";

export interface DocumentsViewProps {
  initialDocuments: DocumentTableRow[];
  tenantId?: string;
  tenantName?: string;
  currentUserRole?: WorkspaceRole;
  userName?: string;
  userEmail?: string;
}

export function DocumentsView({
  initialDocuments,
  tenantId,
  tenantName = "VeriDoc Workspace",
  currentUserRole = "QUALITY_MANAGER",
  userName,
  userEmail,
}: DocumentsViewProps) {
  const router = useRouter();
  const [documents, setDocuments] = React.useState<DocumentTableRow[]>(initialDocuments);
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);

  React.useEffect(() => {
    setDocuments(initialDocuments);
  }, [initialDocuments]);

  const canCreate =
    currentUserRole === "WORKSPACE_ADMIN" ||
    currentUserRole === "QUALITY_MANAGER" ||
    currentUserRole === "DOCUMENT_AUTHOR";

  return (
    <div className="flex-1 flex flex-col">
      {/* Top Utility Bar */}
      <TopUtilityBar
        breadcrumbs={[
          { label: currentUserRole === "READER" ? "To Read" : tenantName, href: currentUserRole === "READER" ? "/to-read" : "/dashboard" },
          { label: "Controlled Documents" },
        ]}
        userName={userName}
        userEmail={userEmail}
        role={currentUserRole}
      />

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 px-4 py-6 sm:px-8 max-w-7xl w-full mx-auto space-y-6">
        {/* 1. Header & Actions Strip (matching .stitch-ref/07-controlled-documents.html) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Controlled Documents
            </h1>
            <p className="text-sm text-muted-foreground">
              Author, review, and manage standard operating procedures across all lifecycle states.
            </p>
          </div>

          {canCreate && (
            <div className="flex items-center gap-2.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCreateModalOpen(true)}
                className="gap-1.5"
              >
                <Upload className="h-4 w-4 text-muted-foreground" />
                <span>Import PDF <span className="text-[11px] text-muted-foreground">(Max 50MB)</span></span>
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={() => setIsCreateModalOpen(true)}
                className="gap-1.5 bg-primary hover:bg-blue-800 text-primary-foreground shadow-sm"
              >
                <Plus className="h-4 w-4" />
                <span>New SOP</span>
              </Button>
            </div>
          )}
        </div>

        {/* 2. Documents Table with Lifecycle Filters */}
        <DocumentsTable documents={documents} />
      </div>

      {/* 3. New Document Modal */}
      <CreateDocumentModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        tenantId={tenantId}
        onSuccess={(doc) => {
          const newDoc: DocumentTableRow = {
            id: doc.documentId,
            documentCode: doc.documentCode,
            title: doc.title,
            category: doc.category,
            contentFormat: doc.contentFormat,
            currentVersionLabel: "v1.0",
            currentVersionId: doc.versionId,
            lifecycleState: "DRAFT",
            documentSha256: null,
            versionCount: 1,
            updatedAt: new Date().toISOString(),
          };
          setDocuments((prev) => [newDoc, ...prev]);
          router.refresh();
        }}
      />
    </div>
  );
}
