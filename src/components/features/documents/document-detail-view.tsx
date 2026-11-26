"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileText,
  FileCode,
  ShieldCheck,
  Save,
  Send,
  PlusCircle,
  Clock,
  Eye,
  GitCompare,
  Upload,
  Calendar,
  User,
  History,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  ExternalLink,
  Lock,
  Layers,
  ChevronRight,
  Undo2,
  Archive,
} from "lucide-react";
import { LifecycleStatusBadge } from "./lifecycle-status-badge";
import { Sha256DigestChip } from "./sha256-digest-chip";
import { MarkdownEditor } from "./markdown-editor";
import { PdfUploader } from "./pdf-uploader";
import { MarkdownDiffViewer } from "./markdown-diff-viewer";
import { InvalidationWarningModal } from "@/components/features/approvals/invalidation-warning-modal";
import { SubmitForApprovalModal } from "@/components/features/approvals/submit-for-approval-modal";
import { RecallApprovalModal } from "@/components/features/approvals/recall-approval-modal";
import { PublishDocumentModal } from "./publish-document-modal";
import { RetireDocumentModal } from "./retire-document-modal";
import { Button } from "@/components/ui/button";
import { TopUtilityBar } from "@/components/layout/top-utility-bar";
import { cn } from "@/lib/utils";
import { updateDocumentVersionAction } from "@/server/actions/documents.actions";
import type { DocumentLifecycleState, WorkspaceRole } from "@/types/roles";

export interface DocumentVersionDetail {
  id: string;
  documentId: string;
  parentVersionId?: string | null;
  versionMajor: number;
  versionMinor: number;
  versionLabel: string;
  title: string;
  contentFormat: "MARKDOWN" | "PDF";
  markdownContent?: string | null;
  fileStorageKey?: string | null;
  fileMimeType?: string | null;
  fileSizeBytes?: number | null;
  fileSha256?: string | null;
  documentSha256?: string | null;
  lifecycleState: DocumentLifecycleState;
  authorId: string;
  authorName?: string | null;
  rowVersion: number;
  effectiveDate?: string | Date | null;
  publishedAt?: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface DocumentDetailData {
  id: string;
  tenantId: string;
  documentCode: string;
  category: string | null;
  createdBy: string;
  createdByName?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  versions: DocumentVersionDetail[];
  currentVersion: DocumentVersionDetail;
}

export interface DocumentDetailViewProps {
  initialData: DocumentDetailData;
  currentUserRole?: WorkspaceRole;
  currentUserId?: string;
  userName?: string;
  userEmail?: string;
  className?: string;
  availableApprovers?: Array<{
    id: string;
    name: string;
    email: string;
    role: WorkspaceRole;
    status: "ACTIVE" | "INVITED" | "DEACTIVATED";
  }>;
  allowSingleAuthorOverride?: boolean;
}

export function DocumentDetailView({
  initialData,
  currentUserRole = "DOCUMENT_AUTHOR",
  currentUserId,
  userName,
  userEmail,
  className,
  availableApprovers = [],
  allowSingleAuthorOverride = false,
}: DocumentDetailViewProps) {
  const router = useRouter();
  const [data, setData] = React.useState<DocumentDetailData>(initialData);

  React.useEffect(() => {
    setData(initialData);
  }, [initialData]);
  const [selectedVersionId, setSelectedVersionId] = React.useState<string>(
    initialData.currentVersion?.id || initialData.versions[0]?.id || ""
  );

  // Active version based on selectedVersionId
  const activeVersion = React.useMemo(() => {
    return (
      data.versions.find((v) => v.id === selectedVersionId) ||
      data.currentVersion ||
      data.versions[0]
    );
  }, [data, selectedVersionId]);

  // Form edit states
  const [title, setTitle] = React.useState(activeVersion?.title || "");
  const [markdownContent, setMarkdownContent] = React.useState(
    activeVersion?.markdownContent || ""
  );
  const [activeTab, setActiveTab] = React.useState<
    "editor" | "pdf" | "diff" | "metadata"
  >(activeVersion?.contentFormat === "PDF" ? "pdf" : "editor");

  // Keep local editor state in sync when switching versions
  React.useEffect(() => {
    if (activeVersion) {
      setTitle(activeVersion.title);
      setMarkdownContent(activeVersion.markdownContent || "");
      if (activeVersion.contentFormat === "PDF") {
        setActiveTab("pdf");
      }
    }
  }, [activeVersion]);

  // UI state for mutations
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveSuccess, setSaveSuccess] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  // Signed URL preview state
  const [signedPreviewUrl, setSignedPreviewUrl] = React.useState<string | null>(null);
  const [signedUrlExpiresAt, setSignedUrlExpiresAt] = React.useState<string | null>(null);
  const [isLoadingSignedUrl, setIsLoadingSignedUrl] = React.useState(false);

  // Invalidation modal for PENDING_APPROVAL edits (DEC-04)
  const [showInvalidationModal, setShowInvalidationModal] = React.useState(false);

  // Approval workflow modals
  const [showSubmitModal, setShowSubmitModal] = React.useState(false);
  const [showRecallModal, setShowRecallModal] = React.useState(false);
  const [showPublishModal, setShowPublishModal] = React.useState(false);
  const [showRetireModal, setShowRetireModal] = React.useState(false);

  const currentPublishedVersion = React.useMemo(() => {
    return (
      data.versions.find(
        (v) => v.lifecycleState === "PUBLISHED" && v.id !== activeVersion?.id
      ) || null
    );
  }, [data.versions, activeVersion?.id]);

  const isDraft = activeVersion?.lifecycleState === "DRAFT";
  const isPendingApproval = activeVersion?.lifecycleState === "PENDING_APPROVAL";
  const isApproved = activeVersion?.lifecycleState === "APPROVED";
  const isPublished = activeVersion?.lifecycleState === "PUBLISHED";
  const isImmutable = isApproved || isPublished || activeVersion?.lifecycleState === "SUPERSEDED" || activeVersion?.lifecycleState === "RETIRED";

  // Check if content was modified
  const isDirty =
    title !== activeVersion?.title ||
    markdownContent !== (activeVersion?.markdownContent || "");

  // Request signed preview URL (120s TTL)
  const handleFetchSignedPreviewUrl = async () => {
    if (!activeVersion) return;
    setIsLoadingSignedUrl(true);
    setErrorMessage(null);

    try {
      const res = await fetch(
        `/api/documents/${data.id}/versions/${activeVersion.id}/preview-url`
      );
      const json = await res.json();

      if (!res.ok) {
        throw new Error(
          json?.error?.message || `Failed to fetch preview URL (${res.status})`
        );
      }

      const payload = json.data || json;
      setSignedPreviewUrl(payload.signedUrl);
      setSignedUrlExpiresAt(payload.expiresAt);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Unable to generate signed preview URL."
      );
    } finally {
      setIsLoadingSignedUrl(false);
    }
  };

  // Handle Save Draft / Mid-Approval Edit
  const handleSave = async (confirmedInvalidate: boolean = false) => {
    if (!activeVersion) return;

    // Guard: If editing a PENDING_APPROVAL document without confirmation, trigger modal (DEC-04)
    if (isPendingApproval && !confirmedInvalidate) {
      setShowInvalidationModal(true);
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setSaveSuccess(false);

    try {
      const res = await updateDocumentVersionAction({
        tenantId: data.tenantId,
        documentId: data.id,
        versionId: activeVersion.id,
        title: title.trim(),
        markdownContent,
        expectedRowVersion: activeVersion.rowVersion,
        confirmInvalidateApprovals: confirmedInvalidate,
      });

      if (!res.success) {
        if (res.error.code === "INVALIDATION_CONFIRMATION_REQUIRED") {
          setShowInvalidationModal(true);
          return;
        }
        if (
          res.error.code === "CONCURRENT_MODIFICATION" ||
          res.error.code === "OPTIMISTIC_LOCK_CONFLICT"
        ) {
          throw new Error(
            "Concurrent modification detected (row version conflict). Please refresh the document."
          );
        }
        throw new Error(res.error.message || "Failed to save document version changes.");
      }

      const nextMinor = res.data.versionMinor ?? activeVersion.versionMinor;
      const nextLifecycleState =
        (res.data.lifecycleState as DocumentLifecycleState | undefined) ??
        (confirmedInvalidate ? "DRAFT" : activeVersion.lifecycleState);

      const updatedVersion: DocumentVersionDetail = {
        ...activeVersion,
        title: title.trim(),
        markdownContent,
        versionMinor: nextMinor,
        versionLabel: `v${activeVersion.versionMajor}.${nextMinor}`,
        rowVersion: res.data.rowVersion,
        documentSha256: res.data.documentSha256,
        lifecycleState: nextLifecycleState,
        updatedAt: new Date().toISOString(),
      };

      setData((prev) => ({
        ...prev,
        versions: prev.versions.map((v) =>
          v.id === updatedVersion.id ? updatedVersion : v
        ),
        currentVersion:
          prev.currentVersion.id === updatedVersion.id
            ? updatedVersion
            : prev.currentVersion,
      }));

      setSaveSuccess(true);
      setShowInvalidationModal(false);
      router.refresh();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to save document version changes."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={cn("flex flex-col min-h-screen", className)}>
      {/* Top Utility Bar */}
      <TopUtilityBar
        breadcrumbs={[
          { label: "Documents", href: "/documents" },
          { label: data.documentCode },
        ]}
        userName={userName}
        userEmail={userEmail}
        role={currentUserRole}
      />

      <div className="flex-1 px-4 py-6 sm:px-8 max-w-7xl w-full mx-auto space-y-6">
        {/* 1. Header Bar with Document Code, Title, Lifecycle Badge, & Actions */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Document Code Chip */}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded font-mono text-xs font-bold bg-muted text-foreground border border-border">
                {data.documentCode}
              </span>

              {/* Version Selector Dropdown */}
              <div className="relative inline-flex items-center">
                <select
                  value={selectedVersionId}
                  onChange={(e) => setSelectedVersionId(e.target.value)}
                  className="h-7 rounded border border-border bg-background px-2 font-mono text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                  title="Select version revision"
                >
                  {data.versions.map((ver) => (
                    <option key={ver.id} value={ver.id}>
                      {ver.versionLabel} ({ver.lifecycleState})
                    </option>
                  ))}
                </select>
              </div>

              {/* Lifecycle Badge */}
              <LifecycleStatusBadge state={activeVersion.lifecycleState} size="sm" />

              {/* SHA-256 Digest Chip */}
              <Sha256DigestChip digest={activeVersion.documentSha256} />
            </div>

            {/* Document Title (Editable if DRAFT, else Read-Only Heading) */}
            {isDraft ? (
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter SOP Document Title..."
                className="w-full text-xl sm:text-2xl font-bold tracking-tight bg-transparent text-foreground border-b border-transparent hover:border-border focus:border-primary focus:outline-none py-0.5"
              />
            ) : (
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground truncate">
                {activeVersion.title}
              </h1>
            )}

            {/* Metadata Info Line */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground pt-0.5">
              {data.category && (
                <span className="inline-flex items-center gap-1">
                  <Layers className="h-3.5 w-3.5" />
                  Category: <strong className="text-foreground">{data.category}</strong>
                </span>
              )}
              {activeVersion.authorName && (
                <span className="inline-flex items-center gap-1">
                  <User className="h-3.5 w-3.5" />
                  Author: <strong className="text-foreground">{activeVersion.authorName}</strong>
                </span>
              )}
              <span className="inline-flex items-center gap-1 font-mono">
                <Clock className="h-3.5 w-3.5" />
                Row Version: v.{activeVersion.rowVersion}
              </span>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Signed PDF Preview Trigger */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleFetchSignedPreviewUrl}
              disabled={isLoadingSignedUrl}
            >
              {isLoadingSignedUrl ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  Generating...
                </>
              ) : (
                <>
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  Preview Signed PDF
                </>
              )}
            </Button>

            {/* Save Draft Button (if not immutable) */}
            {!isImmutable && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleSave(false)}
                disabled={isSaving || !isDirty}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5 mr-1" />
                    Save Draft
                  </>
                )}
              </Button>
            )}

            {/* Submit for Approval Action (if DRAFT) */}
            {isDraft && (
              <Button
                type="button"
                size="sm"
                className="bg-primary hover:bg-blue-800 text-primary-foreground"
                onClick={() => setShowSubmitModal(true)}
              >
                <Send className="h-3.5 w-3.5 mr-1" />
                Submit for Approval
              </Button>
            )}

            {/* Recall Workflow (if PENDING_APPROVAL) */}
            {isPendingApproval && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-amber-400 text-amber-800 hover:bg-amber-50"
                onClick={() => setShowRecallModal(true)}
              >
                <Undo2 className="h-3.5 w-3.5 mr-1" />
                Recall Workflow
              </Button>
            )}

            {/* Publish Document (if APPROVED) */}
            {isApproved && (
              <Button
                type="button"
                size="sm"
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-medium shadow-xs"
                onClick={() => setShowPublishModal(true)}
              >
                <Upload className="h-3.5 w-3.5 mr-1" />
                Publish Document
              </Button>
            )}

            {/* Retire Document (if PUBLISHED) */}
            {isPublished && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800 font-medium"
                onClick={() => setShowRetireModal(true)}
              >
                <Archive className="h-3.5 w-3.5 mr-1" />
                Retire Document
              </Button>
            )}

            {/* New Revision (if PUBLISHED) */}
            {isPublished && (
              <Button
                type="button"
                size="sm"
                variant="default"
                onClick={() => {
                  alert(
                    "Create New Revision: This will clone this published version into a new DRAFT (v" +
                      (activeVersion.versionMajor + 1) +
                      ".0 or v" +
                      activeVersion.versionMajor +
                      "." +
                      (activeVersion.versionMinor + 1) +
                      ")."
                  );
                }}
              >
                <PlusCircle className="h-3.5 w-3.5 mr-1" />
                New Revision
              </Button>
            )}
          </div>
        </div>

        {/* Signed Preview URL Banner (120s TTL, DEC-06 / REQ-FR-101) */}
        {signedPreviewUrl && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border border-sky-300 bg-sky-50 text-sky-950">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-sky-700 shrink-0" />
              <div>
                <p className="text-sm font-semibold">
                  Secure Signed Preview URL Generated (120s TTL)
                </p>
                <p className="text-xs text-sky-800 font-mono mt-0.5">
                  Valid until: {signedUrlExpiresAt ? new Date(signedUrlExpiresAt).toLocaleTimeString() : "120s"}
                </p>
              </div>
            </div>
            <a
              href={signedPreviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-sky-700 hover:bg-sky-800 text-white text-xs font-medium transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Open PDF in New Window</span>
            </a>
          </div>
        )}

        {/* Success & Error Banners */}
        {saveSuccess && (
          <div className="flex items-center gap-2 p-3 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 text-sm">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>Document version saved successfully.</span>
          </div>
        )}

        {errorMessage && (
          <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* 2. Workspace Navigation Tabs */}
        <div className="border-b border-border">
          <nav className="flex space-x-6">
            <button
              type="button"
              onClick={() => setActiveTab("editor")}
              className={cn(
                "flex items-center gap-2 py-3 border-b-2 text-sm font-medium transition-colors",
                activeTab === "editor"
                  ? "border-primary text-primary font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <FileCode className="h-4 w-4" />
              <span>Procedure Content</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("pdf")}
              className={cn(
                "flex items-center gap-2 py-3 border-b-2 text-sm font-medium transition-colors",
                activeTab === "pdf"
                  ? "border-primary text-primary font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Upload className="h-4 w-4" />
              <span>PDF Attachment</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("diff")}
              className={cn(
                "flex items-center gap-2 py-3 border-b-2 text-sm font-medium transition-colors",
                activeTab === "diff"
                  ? "border-primary text-primary font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <GitCompare className="h-4 w-4" />
              <span>Version Diff</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("metadata")}
              className={cn(
                "flex items-center gap-2 py-3 border-b-2 text-sm font-medium transition-colors",
                activeTab === "metadata"
                  ? "border-primary text-primary font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <ShieldCheck className="h-4 w-4" />
              <span>Governance & Audit</span>
            </button>
          </nav>
        </div>

        {/* 3. Active Tab Content */}
        <div className="pt-2">
          {/* Tab 1: Markdown Editor */}
          {activeTab === "editor" && (
            <div className="space-y-4">
              <MarkdownEditor
                value={markdownContent}
                onChange={setMarkdownContent}
                readOnly={isImmutable}
                minHeight="520px"
              />
            </div>
          )}

          {/* Tab 2: PDF Uploader */}
          {activeTab === "pdf" && (
            <div className="space-y-4">
              <PdfUploader
                documentId={data.id}
                versionId={activeVersion.id}
                expectedRowVersion={activeVersion.rowVersion}
                lifecycleState={activeVersion.lifecycleState}
                existingPdf={{
                  fileName: activeVersion.fileStorageKey ? "Controlled_SOP.pdf" : null,
                  fileSizeBytes: activeVersion.fileSizeBytes,
                  fileSha256: activeVersion.fileSha256,
                  mimeType: activeVersion.fileMimeType,
                }}
                readOnly={isImmutable}
                onUploadSuccess={(res) => {
                  setData((prev) => ({
                    ...prev,
                    versions: prev.versions.map((v) =>
                      v.id === activeVersion.id
                        ? {
                            ...v,
                            fileSizeBytes: res.fileSizeBytes,
                            fileSha256: res.fileSha256,
                            rowVersion: res.rowVersion,
                            lifecycleState: res.lifecycleState as DocumentLifecycleState,
                          }
                        : v
                    ),
                  }));
                }}
              />
            </div>
          )}

          {/* Tab 3: Version Diff */}
          {activeTab === "diff" && (
            <MarkdownDiffViewer
              documentId={data.id}
              versions={data.versions.map((v) => ({
                id: v.id,
                versionLabel: v.versionLabel,
                title: v.title,
              }))}
            />
          )}

          {/* Tab 4: Governance & Metadata */}
          {activeTab === "metadata" && (
            <div className="rounded-lg border border-border bg-card p-6 shadow-sm space-y-6">
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  Document Governance Record
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Immutable version lineage and technical control metadata.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 text-sm">
                <div className="p-3.5 rounded bg-muted/40 border border-border space-y-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Document Code
                  </span>
                  <p className="font-mono font-bold text-foreground">{data.documentCode}</p>
                </div>

                <div className="p-3.5 rounded bg-muted/40 border border-border space-y-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Format & Engine
                  </span>
                  <p className="font-medium text-foreground">
                    {activeVersion.contentFormat === "PDF" ? "PDF Attachment" : "Sanitized Markdown"}
                  </p>
                </div>

                <div className="p-3.5 rounded bg-muted/40 border border-border space-y-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Lifecycle State
                  </span>
                  <div>
                    <LifecycleStatusBadge state={activeVersion.lifecycleState} size="sm" />
                  </div>
                </div>

                <div className="p-3.5 rounded bg-muted/40 border border-border space-y-1 col-span-1 sm:col-span-2 lg:col-span-3">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Canonical SHA-256 Digest (DEC-06)
                  </span>
                  <div className="mt-1">
                    <Sha256DigestChip digest={activeVersion.documentSha256} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Invalidation Confirmation Modal (DEC-04) */}
      <InvalidationWarningModal
        isOpen={showInvalidationModal}
        onClose={() => setShowInvalidationModal(false)}
        onConfirm={() => handleSave(true)}
        isInvalidating={isSaving}
        documentTitle={data.documentCode}
        versionLabel={activeVersion?.versionLabel}
        actionType="edit"
      />

      {/* Submit for Approval Modal */}
      {activeVersion && (
        <SubmitForApprovalModal
          isOpen={showSubmitModal}
          onClose={() => setShowSubmitModal(false)}
          versionId={activeVersion.id}
          versionLabel={activeVersion.versionLabel}
          documentCode={data.documentCode}
          documentTitle={activeVersion.title}
          authorId={activeVersion.authorId}
          expectedRowVersion={activeVersion.rowVersion}
          tenantId={data.tenantId}
          allowSingleAuthorOverride={allowSingleAuthorOverride}
          availableApprovers={availableApprovers}
          onSuccess={({ cycleId, stepsCount }) => {
            setData((prev) => ({
              ...prev,
              versions: prev.versions.map((v) =>
                v.id === activeVersion.id
                  ? {
                      ...v,
                      lifecycleState: "PENDING_APPROVAL" as const,
                      rowVersion: v.rowVersion + 1,
                    }
                  : v
              ),
              currentVersion:
                prev.currentVersion.id === activeVersion.id
                  ? {
                      ...prev.currentVersion,
                      lifecycleState: "PENDING_APPROVAL" as const,
                      rowVersion: prev.currentVersion.rowVersion + 1,
                    }
                  : prev.currentVersion,
            }));
            router.refresh();
          }}
        />
      )}

      {/* Recall Approval Workflow Modal */}
      {activeVersion && (
        <RecallApprovalModal
          isOpen={showRecallModal}
          onClose={() => setShowRecallModal(false)}
          versionId={activeVersion.id}
          versionLabel={activeVersion.versionLabel}
          documentCode={data.documentCode}
          documentTitle={activeVersion.title}
          expectedRowVersion={activeVersion.rowVersion}
          tenantId={data.tenantId}
          onSuccess={() => {
            setData((prev) => ({
              ...prev,
              versions: prev.versions.map((v) =>
                v.id === activeVersion.id
                  ? {
                      ...v,
                      lifecycleState: "DRAFT" as const,
                      rowVersion: v.rowVersion + 1,
                    }
                  : v
              ),
              currentVersion:
                prev.currentVersion.id === activeVersion.id
                  ? {
                      ...prev.currentVersion,
                      lifecycleState: "DRAFT" as const,
                      rowVersion: prev.currentVersion.rowVersion + 1,
                    }
                  : prev.currentVersion,
            }));
            router.refresh();
          }}
        />
      )}

      {/* Publish Document Modal */}
      {activeVersion && (
        <PublishDocumentModal
          isOpen={showPublishModal}
          onClose={() => setShowPublishModal(false)}
          documentId={data.id}
          versionId={activeVersion.id}
          versionLabel={activeVersion.versionLabel}
          documentCode={data.documentCode}
          documentTitle={activeVersion.title}
          expectedRowVersion={activeVersion.rowVersion}
          tenantId={data.tenantId}
          currentPublishedVersion={currentPublishedVersion}
          onSuccess={() => {
            const now = new Date().toISOString();
            setData((prev) => ({
              ...prev,
              versions: prev.versions.map((v) => {
                if (v.id === activeVersion.id) {
                  return {
                    ...v,
                    lifecycleState: "PUBLISHED" as const,
                    publishedAt: now,
                    rowVersion: v.rowVersion + 1,
                  };
                }
                // Atomically supersede any previously published version (BR-VER-01)
                if (v.lifecycleState === "PUBLISHED") {
                  return {
                    ...v,
                    lifecycleState: "SUPERSEDED" as const,
                    rowVersion: v.rowVersion + 1,
                  };
                }
                return v;
              }),
              currentVersion:
                prev.currentVersion.id === activeVersion.id
                  ? {
                      ...prev.currentVersion,
                      lifecycleState: "PUBLISHED" as const,
                      publishedAt: now,
                      rowVersion: prev.currentVersion.rowVersion + 1,
                    }
                  : prev.currentVersion.lifecycleState === "PUBLISHED"
                  ? {
                      ...prev.currentVersion,
                      lifecycleState: "SUPERSEDED" as const,
                      rowVersion: prev.currentVersion.rowVersion + 1,
                    }
                  : prev.currentVersion,
            }));
            router.refresh();
          }}
        />
      )}

      {/* Retire Document Modal */}
      {activeVersion && (
        <RetireDocumentModal
          isOpen={showRetireModal}
          onClose={() => setShowRetireModal(false)}
          documentId={data.id}
          versionId={activeVersion.id}
          versionLabel={activeVersion.versionLabel}
          documentCode={data.documentCode}
          documentTitle={activeVersion.title}
          tenantId={data.tenantId}
          onSuccess={() => {
            setData((prev) => ({
              ...prev,
              versions: prev.versions.map((v) =>
                v.id === activeVersion.id
                  ? {
                      ...v,
                      lifecycleState: "RETIRED" as const,
                      rowVersion: v.rowVersion + 1,
                    }
                  : v
              ),
              currentVersion:
                prev.currentVersion.id === activeVersion.id
                  ? {
                      ...prev.currentVersion,
                      lifecycleState: "RETIRED" as const,
                      rowVersion: prev.currentVersion.rowVersion + 1,
                    }
                  : prev.currentVersion,
            }));
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
