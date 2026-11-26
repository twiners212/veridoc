"use client";

import * as React from "react";
import Link from "next/link";
import Markdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import {
  ChevronLeft,
  ShieldCheck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  FileQuestion,
  ExternalLink,
  Loader2,
  Copy,
  Check,
  Calendar,
  Layers,
  Building,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Sha256DigestChip } from "@/components/features/documents/sha256-digest-chip";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { ReaderAcknowledgmentBar } from "./reader-acknowledgment-bar";
import { AcknowledgmentModal } from "./acknowledgment-modal";
import { AcknowledgmentReceiptModal } from "./acknowledgment-receipt-modal";
import type { ReadAssignmentItem, AcknowledgmentReceipt } from "./reader.types";

export interface SopReaderViewProps {
  documentId: string;
  versionId: string;
  assignmentId?: string;
  documentCode: string;
  title: string;
  versionNumber: string;
  category?: string | null;
  targetGroupName?: string | null;
  effectiveDate?: string | null;
  documentSha256: string;
  contentFormat: "MARKDOWN" | "PDF";
  markdownContent?: string | null;
  fileStorageKey?: string | null;
  isAlreadyAcknowledged?: boolean;
  initialReceipt?: AcknowledgmentReceipt | null;
  currentUser?: {
    id: string;
    name: string;
    role: string;
  };
  onAcknowledge?: (payload: {
    readAssignmentId: string;
    documentVersionId: string;
    dwellTimeSeconds: number;
    maxScrollPercent: number;
    bindingConfirmation: true;
    expectedDocumentSha256: string;
  }) => Promise<{
    success: boolean;
    data?: {
      acknowledgmentId: string;
      acknowledgedAt: string;
      documentSha256: string;
    };
    error?: {
      code: string;
      message: string;
    };
  }>;
}

export function SopReaderView({
  documentId,
  versionId,
  assignmentId,
  documentCode,
  title,
  versionNumber,
  category = "Operational Safety",
  targetGroupName = "CIP Facility B · Shift A",
  effectiveDate = "Oct 24, 2024",
  documentSha256,
  contentFormat,
  markdownContent,
  fileStorageKey,
  isAlreadyAcknowledged = false,
  initialReceipt = null,
  currentUser = {
    id: "usr-reader-default",
    name: "Frontline Reader",
    role: "READER",
  },
  onAcknowledge,
}: SopReaderViewProps) {
  // Dwell time & Scroll progress tracking
  const [dwellTimeSeconds, setDwellTimeSeconds] = React.useState(0);
  const [maxScrollPercent, setMaxScrollPercent] = React.useState(0);

  // Modals state
  const [isConfirmationOpen, setIsConfirmationOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  // Receipt state
  const [isReceiptOpen, setIsReceiptOpen] = React.useState(false);
  const [receiptData, setReceiptData] = React.useState<AcknowledgmentReceipt | null>(
    initialReceipt
  );
  const [acknowledged, setAcknowledged] = React.useState(isAlreadyAcknowledged);

  // Signed PDF preview state
  const [signedPdfUrl, setSignedPdfUrl] = React.useState<string | null>(null);
  const [isLoadingPdf, setIsLoadingPdf] = React.useState(false);
  const [pdfLoadError, setPdfLoadError] = React.useState<string | null>(null);

  // Track active dwell time (pauses when tab is blurred/hidden)
  React.useEffect(() => {
    if (acknowledged) return;

    let isDocumentVisible = true;
    const handleVisibilityChange = () => {
      isDocumentVisible = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const interval = setInterval(() => {
      if (isDocumentVisible) {
        setDwellTimeSeconds((prev) => prev + 1);
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [acknowledged]);

  // Track scroll depth
  React.useEffect(() => {
    if (acknowledged) {
      setMaxScrollPercent(100);
      return;
    }

    const calculateScroll = () => {
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      const currentScrollTop = window.scrollY || document.documentElement.scrollTop;

      // If page has no scrollbar or content fits viewport, count as 100%
      if (documentHeight <= windowHeight + 10) {
        setMaxScrollPercent(100);
        return;
      }

      const totalScrollable = documentHeight - windowHeight;
      const percent = Math.min(100, Math.round((currentScrollTop / totalScrollable) * 100));

      setMaxScrollPercent((prev) => Math.max(prev, percent));
    };

    calculateScroll();
    window.addEventListener("scroll", calculateScroll, { passive: true });
    window.addEventListener("resize", calculateScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", calculateScroll);
      window.removeEventListener("resize", calculateScroll);
    };
  }, [acknowledged]);

  // Fetch signed PDF URL if format is PDF
  React.useEffect(() => {
    if (contentFormat !== "PDF" || !fileStorageKey) return;

    let isMounted = true;
    const fetchSignedUrl = async () => {
      setIsLoadingPdf(true);
      setPdfLoadError(null);
      try {
        const res = await fetch(
          `/api/documents/${documentId}/versions/${versionId}/preview-url`,
          {
            cache: "no-store", // DEC-07: NEVER cache signed URLs
          }
        );
        if (!res.ok) {
          throw new Error(`Failed to load PDF preview (Status ${res.status})`);
        }
        const data = await res.json();
        const url = data.data?.signedUrl || data.signedUrl;
        if (isMounted) setSignedPdfUrl(url);
      } catch (err) {
        if (isMounted) {
          setPdfLoadError(err instanceof Error ? err.message : "Failed to load PDF preview");
        }
      } finally {
        if (isMounted) setIsLoadingPdf(false);
      }
    };

    fetchSignedUrl();
    return () => {
      isMounted = false;
    };
  }, [contentFormat, documentId, versionId, fileStorageKey]);

  // Acknowledgment Submission Handler
  const handleConfirmAcknowledgment = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    if (!onAcknowledge || !assignmentId) {
      setErrorMessage(
        "A valid reading assignment and acknowledgment handler are required to sign this SOP."
      );
      setIsSubmitting(false);
      return;
    }

    try {
      const result = await onAcknowledge({
        readAssignmentId: assignmentId,
        documentVersionId: versionId,
        dwellTimeSeconds,
        maxScrollPercent,
        bindingConfirmation: true,
        expectedDocumentSha256: documentSha256,
      });

      if (!result.success) {
        setErrorMessage(result.error?.message || "Failed to record acknowledgment.");
        setIsSubmitting(false);
        return;
      }

      if (!result.data?.acknowledgmentId) {
        setErrorMessage("Acknowledgment completed without a binding receipt ID.");
        setIsSubmitting(false);
        return;
      }

      const nowUtc =
        result.data.acknowledgedAt ||
        new Date().toISOString().replace("T", " ").substring(0, 19) + " UTC";
      const newReceipt: AcknowledgmentReceipt = {
        acknowledgmentId: result.data.acknowledgmentId,
        documentVersionId: versionId,
        documentCode,
        title,
        version: versionNumber,
        documentSha256: result.data.documentSha256 || documentSha256,
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentUser.role,
        acknowledgedAt: nowUtc,
        dwellTimeSeconds,
        maxScrollPercent,
      };

      setReceiptData(newReceipt);
      setAcknowledged(true);
      setIsConfirmationOpen(false);
      setIsReceiptOpen(true);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "An unexpected error occurred during submission."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const isReadingReqsMet = dwellTimeSeconds >= 10 && maxScrollPercent >= 90;

  return (
    <div className="min-h-screen bg-background text-foreground font-sans antialiased flex flex-col">
      {/* Zero-Clutter Compact Sticky Top Header */}
      <header className="fixed top-0 left-0 right-0 z-50 pt-safe bg-card/90 backdrop-blur-xl border-b border-border shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
        <div className="h-14 px-3 flex items-center justify-between gap-2 max-w-4xl mx-auto w-full">
          {/* Back Button to /to-read */}
          <div className="flex items-center min-w-0 gap-1.5">
            <Link
              href="/to-read"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center text-foreground hover:text-primary rounded-xl active:bg-muted transition-colors touch-manipulation"
              aria-label="Back to To-Read Queue"
            >
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <div className="flex flex-col min-w-0">
              <span className="font-mono text-xs font-bold text-foreground truncate">
                {documentCode} · {versionNumber}
              </span>
              <span className="text-[11px] text-muted-foreground truncate">
                Frontline SOP Reader
              </span>
            </div>
          </div>

          {/* SHA-256 Badge, Theme Toggle & User Status */}
          <div className="flex items-center gap-2 shrink-0">
            <ThemeToggle />
            <div className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-mono text-[11px] font-semibold border border-emerald-200 dark:border-emerald-800">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>SHA-256 Binding</span>
            </div>
            <div className="w-8 h-8 rounded-full bg-brand-gradient text-white flex items-center justify-center font-bold text-xs shrink-0 select-none">
              {currentUser.name.charAt(0)}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area (Distraction-Free Mode) */}
      <main className="flex-1 flex flex-col pt-14 pb-36 max-w-3xl mx-auto w-full px-4 sm:px-6">
        {/* Sticky Live Progress Indicator / Reading Depth Gauge */}
        <div className="sticky top-14 z-30 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2 bg-muted/90 backdrop-blur-sm border-b border-border shadow-xs flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-1.5">
            {isReadingReqsMet ? (
              <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                <CheckCircle2 className="h-4 w-4" />
                <span>Reading Requirements Fulfilled</span>
              </span>
            ) : (
              <span className="flex items-center gap-1 text-amber-600 font-medium">
                <Clock className="h-3.5 w-3.5 animate-pulse" />
                <span>Scroll: {Math.min(100, Math.round(maxScrollPercent))}%/90% • Time: {dwellTimeSeconds}s/10s</span>
              </span>
            )}
          </div>
          <span className="text-muted-foreground font-medium text-[11px]">
            {isReadingReqsMet ? "READY TO SIGN" : `${Math.min(100, Math.round(((Math.min(1, maxScrollPercent / 90) + Math.min(1, dwellTimeSeconds / 10)) / 2) * 100))}%`}
          </span>
        </div>

        {/* Document Header & Metadata Banner Card */}
        <section className="bg-card rounded-2xl p-5 border border-border shadow-sm mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-semibold text-xs border border-emerald-300 dark:border-emerald-800">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Active Standard</span>
            </span>
            <span className="font-mono text-xs bg-muted text-foreground px-2 py-0.5 rounded">
              {targetGroupName}
            </span>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight leading-snug">
            {title}
          </h1>

          {/* Metadata Pill Strip */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-mono bg-muted px-2 py-0.5 rounded font-semibold text-foreground">
              {documentCode} · {versionNumber}
            </span>
            <span className="font-mono bg-muted px-2 py-0.5 rounded text-muted-foreground">
              {category}
            </span>
            <span className="font-mono bg-muted px-2 py-0.5 rounded text-muted-foreground">
              Effective: {effectiveDate}
            </span>
          </div>

          {/* Cryptographic Digest Integrity Chip */}
          <div className="pt-2 border-t border-border/80 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs text-muted-foreground font-mono">Payload Digest:</span>
              <Sha256DigestChip digest={documentSha256} />
            </div>
          </div>
        </section>

        {/* Controlled Content Body */}
        <article className="mt-6 bg-card rounded-2xl p-5 sm:p-7 border border-border shadow-sm space-y-6">
          {contentFormat === "PDF" ? (
            /* PDF Controlled Preview */
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold text-foreground">
                    Controlled PDF Specification
                  </span>
                </div>
                {signedPdfUrl && (
                  <a
                    href={signedPdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline"
                  >
                    <span>Open in New Tab</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>

              {isLoadingPdf ? (
                <div className="h-96 flex flex-col items-center justify-center gap-3 bg-muted/30 rounded-xl border border-dashed border-border text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-xs">Fetching short-lived signed PDF preview...</p>
                </div>
              ) : pdfLoadError ? (
                <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs space-y-2">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="h-4 w-4" />
                    <span>Unable to load signed PDF preview</span>
                  </div>
                  <p>{pdfLoadError}</p>
                </div>
              ) : signedPdfUrl ? (
                <div className="relative w-full rounded-xl overflow-hidden border border-border bg-slate-900 aspect-[3/4] sm:aspect-[4/3] max-h-[750px]">
                  <iframe
                    src={signedPdfUrl}
                    className="w-full h-full border-0"
                    title={`${documentCode} PDF Document`}
                  />
                </div>
              ) : (
                <div className="p-8 text-center bg-muted/40 rounded-xl border border-border text-xs text-muted-foreground">
                  No preview URL generated.
                </div>
              )}
            </div>
          ) : (
            /* Sanitized Markdown Rendering Pipeline */
            <div className="prose dark:prose-invert max-w-none text-foreground text-sm sm:text-base leading-relaxed space-y-4">
              {markdownContent ? (
                <Markdown
                  rehypePlugins={[rehypeSanitize]}
                  components={{
                    h1: ({ ...props }) => (
                      <h1
                        className="text-xl sm:text-2xl font-bold text-foreground border-b border-border pb-2 mt-6 mb-3"
                        {...props}
                      />
                    ),
                    h2: ({ ...props }) => (
                      <h2
                        className="text-lg sm:text-xl font-bold text-foreground mt-5 mb-2.5 flex items-center gap-2"
                        {...props}
                      />
                    ),
                    h3: ({ ...props }) => (
                      <h3
                        className="text-base sm:text-lg font-semibold text-foreground mt-4 mb-2"
                        {...props}
                      />
                    ),
                    p: ({ ...props }) => (
                      <p className="leading-7 text-foreground/90 my-2" {...props} />
                    ),
                    ul: ({ ...props }) => (
                      <ul className="list-disc pl-5 my-2.5 space-y-1.5" {...props} />
                    ),
                    ol: ({ ...props }) => (
                      <ol className="list-decimal pl-5 my-2.5 space-y-1.5 font-medium" {...props} />
                    ),
                    li: ({ ...props }) => <li className="pl-1" {...props} />,
                    blockquote: ({ ...props }) => (
                      <aside
                        className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border-l-4 border-amber-500 text-amber-900 dark:text-amber-200 my-4 text-xs sm:text-sm font-medium shadow-xs"
                        {...props}
                      />
                    ),
                    table: ({ ...props }) => (
                      <div className="overflow-x-auto my-4 rounded-lg border border-border">
                        <table className="min-w-full divide-y divide-border text-xs sm:text-sm" {...props} />
                      </div>
                    ),
                    th: ({ ...props }) => (
                      <th className="px-3.5 py-2.5 bg-muted font-semibold text-foreground text-left" {...props} />
                    ),
                    td: ({ ...props }) => (
                      <td className="px-3.5 py-2.5 border-t border-border/60 text-foreground" {...props} />
                    ),
                    code: ({ inline, ...props }: { inline?: boolean } & React.HTMLAttributes<HTMLElement>) =>
                      inline ? (
                        <code
                          className="px-1.5 py-0.5 rounded bg-muted font-mono text-xs text-foreground border border-border/70"
                          {...props}
                        />
                      ) : (
                        <pre className="p-3.5 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto my-3">
                          <code {...props} />
                        </pre>
                      ),
                    hr: () => <hr className="my-6 border-border" />,
                  }}
                >
                  {markdownContent}
                </Markdown>
              ) : (
                <div className="rounded-xl border border-border bg-muted/30 p-6 text-center space-y-2">
                  <AlertTriangle className="h-6 w-6 text-amber-600 mx-auto" />
                  <p className="text-sm font-semibold text-foreground">
                    Controlled Procedure Text Unavailable
                  </p>
                  <p className="text-xs text-muted-foreground">
                    No Markdown body is stored for this SOP version. Contact your Quality Manager before proceeding.
                  </p>
                </div>
              )}
            </div>
          )}
        </article>
      </main>

      {/* Sticky Bottom Reader Acknowledgment Bar */}
      <ReaderAcknowledgmentBar
        scrollPercent={maxScrollPercent}
        dwellTimeSeconds={dwellTimeSeconds}
        isAlreadyAcknowledged={acknowledged}
        onOpenConfirmation={() => setIsConfirmationOpen(true)}
      />

      {/* Confirmation Modal */}
      <AcknowledgmentModal
        isOpen={isConfirmationOpen}
        onClose={() => setIsConfirmationOpen(false)}
        onConfirm={handleConfirmAcknowledgment}
        documentCode={documentCode}
        documentTitle={title}
        version={versionNumber}
        documentSha256={documentSha256}
        userName={currentUser.name}
        userRole={currentUser.role}
        dwellTimeSeconds={dwellTimeSeconds}
        maxScrollPercent={maxScrollPercent}
        isSubmitting={isSubmitting}
        errorMessage={errorMessage}
      />

      {/* Instant Acknowledgment Receipt Modal */}
      {receiptData && (
        <AcknowledgmentReceiptModal
          isOpen={isReceiptOpen}
          onClose={() => setIsReceiptOpen(false)}
          receiptId={receiptData.acknowledgmentId}
          documentCode={receiptData.documentCode}
          documentTitle={receiptData.title}
          version={receiptData.version}
          documentSha256={receiptData.documentSha256}
          userId={receiptData.userId}
          userName={receiptData.userName}
          acknowledgedAt={receiptData.acknowledgedAt}
        />
      )}
    </div>
  );
}
