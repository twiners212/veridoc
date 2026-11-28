"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Markdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import {
  Shield,
  FileCheck,
  Clock,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  FileText,
  Lock,
  ArrowUpDown,
  AlertTriangle,
  History,
  FileDown,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sha256DigestChip } from "@/components/features/documents/sha256-digest-chip";
import { LifecycleStatusBadge } from "@/components/features/documents/lifecycle-status-badge";
import { SequentialStepper } from "./sequential-stepper";
import { SignOffReauthModal } from "./sign-off-reauth-modal";
import { AdminOverrideModal } from "./admin-override-modal";
import { cn } from "@/lib/utils";
import type {
  ApprovalQueueItem,
  ApprovalQueueStepItem,
  ApprovalQueueResponse,
} from "@/types/approvals";
import type { WorkspaceRole } from "@/types/roles";

export interface ApprovalsViewProps {
  initialItems?: ApprovalQueueItem[];
  currentUserRole?: WorkspaceRole;
  currentUserId?: string;
  currentUserName?: string;
  tenantId?: string;
  tenantName?: string;
  allowSingleAuthorOverride?: boolean;
  availableApprovers?: Array<{
    id: string;
    name: string;
    email: string;
    role: WorkspaceRole;
    status: "ACTIVE" | "INVITED" | "DEACTIVATED";
  }>;
}

export function ApprovalsView({
  initialItems: initialItemsProp,
  currentUserRole = "APPROVER_REVIEWER",
  currentUserId = "",
  currentUserName = "",
  tenantId,
  tenantName = "VeriDoc Workspace",
  allowSingleAuthorOverride = false,
  availableApprovers = [],
}: ApprovalsViewProps) {
  const router = useRouter();
  const hasSuppliedInitialItems = initialItemsProp !== undefined;
  const initialItems = initialItemsProp ?? [];
  const hasInteractedRef = React.useRef(false);

  const [scope, setScope] = React.useState<"active" | "upcoming">("active");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [sortOrder, setSortOrder] = React.useState<"asc" | "desc">("asc");
  const [items, setItems] = React.useState<ApprovalQueueItem[]>(initialItems);
  const [selectedStepId, setSelectedStepId] = React.useState<string | null>(
    initialItems[0]?.stepId || null
  );
  const [isLoading, setIsLoading] = React.useState(false);
  const [pdfPreviewLoading, setPdfPreviewLoading] = React.useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = React.useState<string | null>(null);

  // Modals state
  const [reauthModalState, setReauthModalState] = React.useState<{
    isOpen: boolean;
    decision: "APPROVE" | "REJECT";
  }>({
    isOpen: false,
    decision: "APPROVE",
  });

  const [adminOverrideState, setAdminOverrideState] = React.useState<{
    isOpen: boolean;
    step: ApprovalQueueStepItem | null;
  }>({
    isOpen: false,
    step: null,
  });

  // Fetch queue from API
  const fetchQueue = React.useCallback(
    async (targetScope: "active" | "upcoming", search: string) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          scope: targetScope,
          page: "1",
          limit: "50",
        });
        if (search.trim()) {
          params.set("search", search.trim());
        }

        const res = await fetch(`/api/approvals/queue?${params.toString()}`);
        if (!res.ok) {
          throw new Error("Failed to load approvals queue");
        }
        const json: ApprovalQueueResponse = await res.json();
        const fetchedItems = json.data?.items || [];
        setItems(fetchedItems);
        if (fetchedItems.length > 0) {
          setSelectedStepId((prev) =>
            fetchedItems.some((i) => i.stepId === prev)
              ? prev
              : fetchedItems[0].stepId
          );
        } else {
          setSelectedStepId(null);
        }
      } catch (err) {
        console.error("Queue fetch error:", err);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Re-fetch on scope or search change; skip initial mount fetch when SSR supplied initialItems
  React.useEffect(() => {
    if (
      hasSuppliedInitialItems &&
      !hasInteractedRef.current &&
      scope === "active" &&
      searchQuery === ""
    ) {
      return;
    }
    fetchQueue(scope, searchQuery);
  }, [scope, fetchQueue, searchQuery, hasSuppliedInitialItems]);

  // Selected item
  const selectedItem = React.useMemo(() => {
    if (!selectedStepId) return items[0] || null;
    return items.find((i) => i.stepId === selectedStepId) || items[0] || null;
  }, [items, selectedStepId]);

  // Sort items
  const sortedItems = React.useMemo(() => {
    return [...items].sort((a, b) => {
      const timeA = new Date(a.submittedAt).getTime();
      const timeB = new Date(b.submittedAt).getTime();
      return sortOrder === "asc" ? timeA - timeB : timeB - timeA;
    });
  }, [items, sortOrder]);

  // PDF Preview fetch
  const handlePreviewPdf = async () => {
    if (!selectedItem) return;
    setPdfPreviewLoading(true);
    try {
      const res = await fetch(
        `/api/documents/${selectedItem.documentId}/versions/${selectedItem.versionId}/preview-url`
      );
      if (res.ok) {
        const json = await res.json();
        const previewUrl = json.data?.signedUrl || json.data?.previewUrl;
        if (previewUrl) {
          setPdfPreviewUrl(previewUrl);
          window.open(previewUrl, "_blank", "noopener,noreferrer");
        } else {
          console.error("Preview response missing signedUrl");
        }
      } else {
        console.error("Failed to fetch signed preview URL:", res.status);
      }
    } catch (err) {
      console.error("Failed to load PDF preview URL:", err);
    } finally {
      setPdfPreviewLoading(false);
    }
  };

  const handleDecisionSuccess = () => {
    fetchQueue(scope, searchQuery);
    router.refresh();
  };

  const handleOverrideSuccess = () => {
    fetchQueue(scope, searchQuery);
    router.refresh();
  };

  return (
    <div className="flex flex-col w-full min-h-screen bg-background">
      {/* Top Command & Filter Bar */}
      <div className="px-4 sm:px-6 lg:px-8 pt-6 pb-4 bg-card border-b border-border">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-foreground font-sans">
                Approvals &amp; Sign-Offs
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-mono bg-blue-100 text-primary dark:bg-blue-950/60 dark:text-blue-300 font-semibold">
                <Shield className="h-3 w-3" />
                BR-APP-01 Enforced
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Deterministic sequential review workflows and digest-bound digital approvals.
            </p>
          </div>

          {/* Quick Governance Status Indicator */}
          <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 border border-border">
            <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
            <span className="font-mono text-xs text-muted-foreground">
              Separation of Duties Active
            </span>
            <span className="text-muted-foreground/60 text-xs">•</span>
            <span className="font-mono text-xs text-foreground font-medium">
              Chain v4.19
            </span>
          </div>
        </div>

        {/* Segmented Navigation Tabs & Context Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-6 pt-1">
          <div
            className="inline-flex w-full sm:w-auto overflow-x-auto p-1 bg-muted/60 rounded-lg border border-border"
            role="tablist"
          >
            <button
              type="button"
              role="tab"
              aria-selected={scope === "active"}
              onClick={() => {
                hasInteractedRef.current = true;
                setScope("active");
              }}
              className={cn(
                "flex-1 sm:flex-initial justify-center flex items-center gap-2 px-4 py-1.5 rounded text-xs font-semibold transition-all whitespace-nowrap",
                scope === "active"
                  ? "bg-card text-primary dark:text-blue-400 shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              data-testid="tab-action-required"
            >
              <span>Action Required</span>
              <span
                className={cn(
                  "inline-flex items-center justify-center px-1.5 py-0.2 rounded-full font-mono text-[11px] font-semibold",
                  scope === "active"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {scope === "active" ? items.length : "•"}
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={scope === "upcoming"}
              onClick={() => {
                hasInteractedRef.current = true;
                setScope("upcoming");
              }}
              className={cn(
                "flex-1 sm:flex-initial justify-center flex items-center gap-2 px-4 py-1.5 rounded text-xs font-semibold transition-all whitespace-nowrap",
                scope === "upcoming"
                  ? "bg-card text-primary dark:text-blue-400 shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              data-testid="tab-upcoming-steps"
            >
              <span>Upcoming Sequential Steps</span>
              <span
                className={cn(
                  "inline-flex items-center justify-center px-1.5 py-0.2 rounded-full font-mono text-[11px] font-semibold",
                  scope === "upcoming"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {scope === "upcoming" ? items.length : "•"}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="relative flex-1 min-w-0 sm:w-64 sm:flex-initial">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground h-3.5 w-3.5" />
              <input
                type="text"
                placeholder="Filter by SOP code or title..."
                value={searchQuery}
                onChange={(e) => {
                  hasInteractedRef.current = true;
                  setSearchQuery(e.target.value);
                }}
                className="w-full pl-8 pr-3 py-1.5 bg-card border border-border rounded text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <button
              type="button"
              onClick={() =>
                setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))
              }
              className="inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 px-3 py-1.5 rounded bg-card border border-border text-xs text-foreground hover:bg-muted transition-colors"
            >
              <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
              <span>{sortOrder === "asc" ? "Oldest First" : "Newest First"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Master-Detail Split Workspace */}
      <div className="flex flex-col lg:flex-row flex-1 px-4 sm:px-6 lg:px-8 py-6 lg:py-8 gap-6 max-w-[1720px] mx-auto w-full">
        {/* Left Column: Master Queue List (approx 380px) */}
        <div className="w-full lg:w-[380px] shrink-0 flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Pending Signature Matrix ({sortedItems.length})
            </span>
            {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary dark:text-blue-400" />}
          </div>

          {sortedItems.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-border rounded-lg bg-card space-y-2">
              <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400 mx-auto" />
              <p className="text-sm font-semibold text-foreground">
                Queue Clear
              </p>
              <p className="text-xs text-muted-foreground">
                {scope === "active"
                  ? "No active approval steps awaiting sign-off."
                  : "No upcoming sequential steps currently queued."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedItems.map((item) => {
                const isSelected = item.stepId === selectedItem?.stepId;
                return (
                  <div
                    key={item.stepId}
                    onClick={() => setSelectedStepId(item.stepId)}
                    className={cn(
                      "relative rounded-lg p-4 cursor-pointer transition-all",
                      isSelected
                        ? "bg-card border-2 border-primary shadow-sm"
                        : "bg-card border border-border hover:border-primary/50 shadow-sm"
                    )}
                    data-testid={`queue-card-${item.documentCode}`}
                  >
                    {isSelected && (
                      <div className="absolute left-0 top-3 bottom-3 w-1.5 bg-primary rounded-r" />
                    )}

                    <div className="flex items-center justify-between mb-1.5 pl-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-primary dark:text-blue-400 tracking-tight">
                          {item.documentCode}
                        </span>
                        <span className="px-1.5 py-0.5 rounded font-mono text-[10px] bg-muted text-foreground font-semibold">
                          {item.versionLabel}
                        </span>
                      </div>
                      <LifecycleStatusBadge
                        state={item.lifecycleState}
                        size="sm"
                      />
                    </div>

                    <h3 className="text-sm font-semibold text-foreground pl-1 leading-snug line-clamp-2">
                      {item.documentTitle}
                    </h3>

                    <p className="text-xs text-muted-foreground mt-1.5 pl-1">
                      Submitted by{" "}
                      <span className="font-medium text-foreground">
                        {item.authorName}
                      </span>{" "}
                      •{" "}
                      {new Date(item.submittedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </p>

                    <div className="mt-3 pt-2.5 border-t border-border flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-muted-foreground pl-1">
                      <span className="flex items-center gap-1 text-primary dark:text-blue-400 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
                        Step {item.stepOrder} of {item.totalSteps} •{" "}
                        {item.assignedApproverRole
                          ? item.assignedApproverRole.replace(/_/g, " ")
                          : "Approver"}
                      </span>
                      <span className="truncate min-w-0">
                        {item.assignedApproverName}
                      </span>
                    </div>

                    {item.isBlockedInactiveApprover && (
                      <div className="mt-2 p-1.5 rounded bg-amber-50 border border-amber-200 text-amber-900 dark:bg-amber-950/50 dark:border-amber-800 dark:text-amber-200 text-[10px] font-semibold flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                        <span>BLOCKED_INACTIVE_APPROVER</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Selected SOP Review Panel */}
        {selectedItem ? (
          <div className="flex-1 min-w-0 bg-card rounded-lg border border-border shadow-sm flex flex-col overflow-hidden">
            {/* Review Panel Header */}
            <div className="p-4 sm:p-6 border-b border-border bg-card">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-bold text-primary dark:text-blue-400 tracking-wide">
                      {selectedItem.documentCode}
                    </span>
                    <span className="px-2 py-0.5 rounded font-mono text-xs bg-muted text-foreground font-semibold">
                      {selectedItem.versionLabel}
                    </span>
                    <LifecycleStatusBadge
                      state={selectedItem.lifecycleState}
                      size="sm"
                    />
                    <Sha256DigestChip digest={selectedItem.documentSha256} />
                  </div>

                  <h2 className="text-xl font-bold text-foreground tracking-tight mt-1 break-words">
                    {selectedItem.documentTitle}
                  </h2>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground pt-1">
                    <span>
                      Author:{" "}
                      <strong className="text-foreground font-semibold">
                        {selectedItem.authorName}
                      </strong>
                    </span>
                    <span>
                      Category:{" "}
                      <strong className="text-foreground font-semibold">
                        {selectedItem.category || "General"}
                      </strong>
                    </span>
                    <span className="text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-1">
                      <Lock className="h-3 w-3" /> Effective Upon Final Sign-off
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start lg:self-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      window.open(
                        `/documents/${selectedItem.documentId}`,
                        "_blank"
                      );
                    }}
                    className="h-8 text-xs"
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1" />
                    Open SOP Detail
                  </Button>
                </div>
              </div>

              {/* Embedded Sequential Stepper */}
              <div className="mt-6 pt-5 border-t border-border">
                <SequentialStepper
                  steps={selectedItem.stepsInCycle}
                  currentUserId={currentUserId}
                  currentUserRole={currentUserRole}
                  documentAuthorId={selectedItem.authorId}
                  onAdminOverrideClick={(step) => {
                    setAdminOverrideState({
                      isOpen: true,
                      step,
                    });
                  }}
                />
              </div>
            </div>

            {/* Diff / Digest Summary Notice Bar */}
            <div className="px-4 sm:px-6 py-2.5 bg-muted/30 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <FileCheck className="h-4 w-4 text-primary dark:text-blue-400 shrink-0" />
                <span className="text-foreground font-medium">
                  Controlled Content Format:
                </span>
                <span className="font-mono font-bold text-primary dark:text-blue-400">
                  {selectedItem.contentFormat}
                </span>
                <span className="text-muted-foreground">
                  (Cycle #{selectedItem.cycleNumber})
                </span>
              </div>
              <span className="font-mono text-[11px] text-muted-foreground">
                Submitted Hash:{" "}
                {selectedItem.submittedSha256
                  ? `${selectedItem.submittedSha256.substring(0, 16)}...`
                  : "Pending"}
              </span>
            </div>

            {/* Scrollable Document Preview Body */}
            <div
              tabIndex={0}
              role="region"
              aria-label="Document preview"
              className="p-4 sm:p-6 lg:p-8 overflow-y-auto max-h-[580px] space-y-6 bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
            >
              {/* Metadata Grid */}
              <div className="border border-border rounded-lg overflow-hidden bg-muted/20">
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-px bg-border text-xs">
                  <div className="p-3 min-w-0 bg-card">
                    <span className="text-muted-foreground block text-[11px]">
                      Document Code
                    </span>
                    <span className="font-mono font-semibold text-foreground block break-words">
                      {selectedItem.documentCode}
                    </span>
                  </div>
                  <div className="p-3 min-w-0 bg-card">
                    <span className="text-muted-foreground block text-[11px]">
                      Author
                    </span>
                    <span className="font-medium text-foreground block break-words">
                      {selectedItem.authorName}
                    </span>
                  </div>
                  <div className="p-3 min-w-0 bg-card">
                    <span className="text-muted-foreground block text-[11px]">
                      Target Department
                    </span>
                    <span className="font-medium text-foreground block break-words">
                      {selectedItem.category || "General Quality"}
                    </span>
                  </div>
                  <div className="p-3 min-w-0 bg-card">
                    <span className="text-muted-foreground block text-[11px]">
                      Lifecycle State
                    </span>
                    <div className="mt-1">
                      <LifecycleStatusBadge
                        state={selectedItem.lifecycleState}
                        size="sm"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Document Body Preview */}
              {selectedItem.contentFormat === "MARKDOWN" ? (
                <div className="prose prose-slate max-w-none text-foreground text-sm leading-6 border border-border rounded-lg p-6 bg-card">
                  {selectedItem.markdownContent ? (
                    <Markdown
                      rehypePlugins={[rehypeSanitize]}
                      components={{
                        h1: ({ ...props }) => (
                          <h1
                            className="text-xl font-bold tracking-tight text-foreground border-b border-border pb-1 mt-4 mb-2"
                            {...props}
                          />
                        ),
                        h2: ({ ...props }) => (
                          <h2
                            className="text-lg font-semibold text-foreground border-b border-border/50 pb-1 mt-3 mb-2"
                            {...props}
                          />
                        ),
                        h3: ({ ...props }) => (
                          <h3
                            className="text-base font-semibold text-foreground mt-2 mb-1"
                            {...props}
                          />
                        ),
                        p: ({ ...props }) => (
                          <p
                            className="text-sm leading-6 text-foreground my-2"
                            {...props}
                          />
                        ),
                        ul: ({ ...props }) => (
                          <ul
                            className="list-disc pl-5 my-2 space-y-1 text-sm text-foreground"
                            {...props}
                          />
                        ),
                        ol: ({ ...props }) => (
                          <ol
                            className="list-decimal pl-5 my-2 space-y-1 text-sm text-foreground"
                            {...props}
                          />
                        ),
                        table: ({ ...props }) => (
                          <div className="overflow-x-auto my-3">
                            <table
                              className="min-w-full divide-y divide-border border border-border text-xs text-left"
                              {...props}
                            />
                          </div>
                        ),
                      }}
                    >
                      {selectedItem.markdownContent}
                    </Markdown>
                  ) : (
                    <p className="text-muted-foreground italic text-xs">
                      No markdown content recorded for this draft.
                    </p>
                  )}
                </div>
              ) : (
                <div className="p-8 border border-border rounded-lg bg-muted/20 text-center space-y-3">
                  <FileText className="h-10 w-10 text-primary dark:text-blue-400 mx-auto" />
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">
                      Controlled PDF Document Attachment
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Storage Key: {selectedItem.fileStorageKey || "N/A"}
                    </p>
                    {selectedItem.fileSizeBytes && (
                      <p className="text-[11px] text-muted-foreground font-mono">
                        {(selectedItem.fileSizeBytes / (1024 * 1024)).toFixed(2)}{" "}
                        MB • Validated %PDF- Magic Bytes
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handlePreviewPdf}
                    disabled={pdfPreviewLoading}
                  >
                    {pdfPreviewLoading ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                        Generating Signed Preview URL...
                      </>
                    ) : (
                      <>
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                        Preview Signed PDF (120s TTL)
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* Embedded Cryptographic Seal */}
              <div className="p-4 rounded-lg bg-muted/40 border border-border space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-[11px] text-muted-foreground uppercase font-semibold">
                    Document Cryptographic Seal
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    Payload Hash: SHA-256
                  </span>
                </div>
                <p className="font-mono text-xs text-foreground break-all bg-card p-2.5 rounded border border-border select-all">
                  {selectedItem.documentSha256 || "Digest Not Yet Computed"}
                </p>
              </div>
            </div>

            {/* Sticky Action Bottom Bar (Master Review Controls) */}
            <div className="p-4 sm:px-6 bg-card border-t border-border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mt-auto">
              <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
                <Lock className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="min-w-0 break-words">
                  Sign-off binds your authenticated identity to payload digest{" "}
                  <span className="font-mono text-foreground font-semibold">
                    {selectedItem.documentSha256
                      ? `${selectedItem.documentSha256.substring(0, 8)}...`
                      : "N/A"}
                  </span>
                </span>
              </div>

              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 w-full sm:w-auto sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setReauthModalState({ isOpen: true, decision: "REJECT" })
                  }
                  className="w-full sm:w-auto min-h-[44px] sm:min-h-0 border-destructive text-destructive hover:bg-destructive/10 dark:border-red-500/60 dark:text-red-400 dark:hover:bg-red-950/40 text-xs font-semibold"
                  data-testid="reject-workflow-button"
                >
                  <XCircle className="h-3.5 w-3.5 mr-1.5" />
                  Reject with Feedback
                </Button>

                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    setReauthModalState({ isOpen: true, decision: "APPROVE" })
                  }
                  disabled={
                    !selectedItem.canApprove ||
                    selectedItem.isBlockedInactiveApprover
                  }
                  className="w-full sm:w-auto min-h-[44px] sm:min-h-0 bg-primary hover:bg-blue-700 text-primary-foreground text-xs font-semibold shadow-sm"
                  data-testid="approve-sign-off-button"
                  title={
                    selectedItem.isBlockedInactiveApprover
                      ? "Assigned approver is inactive"
                      : !selectedItem.canApprove
                      ? "You cannot approve this step (author self-approval or assigned to another approver)"
                      : undefined
                  }
                >
                  <Shield className="h-3.5 w-3.5 mr-1.5" />
                  Approve &amp; Sign Off
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 bg-card rounded-lg border border-border p-12 flex flex-col items-center justify-center text-center">
            <FileText className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <h3 className="text-base font-semibold text-foreground">
              No Document Selected
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Select an approval item from the matrix on the left to review the
              procedure, inspect the sequential stepper, and perform digital sign-off.
            </p>
          </div>
        )}
      </div>

      {/* Sign-Off Re-Authentication Modal */}
      {selectedItem && (
        <SignOffReauthModal
          isOpen={reauthModalState.isOpen}
          decision={reauthModalState.decision}
          stepId={selectedItem.stepId}
          documentCode={selectedItem.documentCode}
          documentTitle={selectedItem.documentTitle}
          versionLabel={selectedItem.versionLabel}
          documentSha256={selectedItem.documentSha256 || ""}
          currentUserRole={currentUserRole}
          currentUserName={currentUserName}
          currentUserId={currentUserId}
          isAuthor={selectedItem.authorId === currentUserId}
          allowSingleAuthorOverride={allowSingleAuthorOverride}
          onClose={() =>
            setReauthModalState((prev) => ({ ...prev, isOpen: false }))
          }
          onSuccess={handleDecisionSuccess}
        />
      )}

      {/* Admin Override Modal */}
      {selectedItem && adminOverrideState.step && (
        <AdminOverrideModal
          isOpen={adminOverrideState.isOpen}
          stepId={adminOverrideState.step.id}
          stepOrder={adminOverrideState.step.stepOrder}
          currentApproverId={adminOverrideState.step.assignedApproverId}
          currentApproverName={adminOverrideState.step.assignedApproverName}
          currentApproverRole={adminOverrideState.step.assignedApproverRole}
          isBlockedInactive={adminOverrideState.step.isBlockedInactiveApprover}
          documentCode={selectedItem.documentCode}
          documentTitle={selectedItem.documentTitle}
          authorId={selectedItem.authorId}
          availableApprovers={availableApprovers}
          onClose={() =>
            setAdminOverrideState({ isOpen: false, step: null })
          }
          onSuccess={handleOverrideSuccess}
        />
      )}
    </div>
  );
}
