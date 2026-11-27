"use client";

import * as React from "react";
import { ShieldAlert, ShieldCheck, X, Loader2, FileText, Fingerprint, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useModalA11y } from "@/components/ui/use-modal-a11y";

export interface AcknowledgmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  documentCode: string;
  documentTitle: string;
  version: string;
  documentSha256: string;
  userName?: string;
  userRole?: string;
  dwellTimeSeconds: number;
  maxScrollPercent: number;
  isSubmitting?: boolean;
  errorMessage?: string | null;
}

export function AcknowledgmentModal({
  isOpen,
  onClose,
  onConfirm,
  documentCode,
  documentTitle,
  version,
  documentSha256,
  userName = "Frontline Reader",
  userRole = "READER",
  dwellTimeSeconds,
  maxScrollPercent,
  isSubmitting = false,
  errorMessage = null,
}: AcknowledgmentModalProps) {
  const [confirmedCheckbox, setConfirmedCheckbox] = React.useState(true);
  const modalRef = React.useRef<HTMLDivElement>(null);

  useModalA11y({
    isOpen,
    onClose,
    disabled: isSubmitting,
    containerRef: modalRef,
  });

  if (!isOpen) return null;

  const currentUtcTime = new Date().toISOString().replace("T", " ").substring(0, 19) + " UTC";

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ack-modal-title"
    >
      <div className="bg-card w-full max-w-lg rounded-t-2xl sm:rounded-2xl border border-border shadow-2xl p-5 sm:p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-full bg-blue-50 text-primary border border-blue-200 flex items-center justify-center shrink-0">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 id="ack-modal-title" className="text-base font-bold text-foreground leading-tight">
                Confirm SOP Read Acknowledgment
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Cryptographically bound compliance record
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Close confirmation dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Document & Reader Verification Details */}
        <div className="bg-muted/40 rounded-xl p-3.5 border border-border space-y-2.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-muted-foreground">Document:</span>
            <span className="font-semibold text-foreground truncate max-w-[260px]">
              {documentCode} · {version}
            </span>
          </div>

          <div className="flex items-start justify-between gap-2">
            <span className="font-mono text-muted-foreground shrink-0">Title:</span>
            <span className="font-medium text-foreground text-right truncate">
              {documentTitle}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-muted-foreground">Operator:</span>
            <span className="font-medium text-foreground">
              {userName} ({userRole})
            </span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-muted-foreground">Verification:</span>
            <span className="font-mono text-emerald-600 font-semibold">
              Scroll: {Math.round(maxScrollPercent)}% • Dwell: {dwellTimeSeconds}s
            </span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-muted-foreground">Effective UTC:</span>
            <span className="font-mono text-muted-foreground">{currentUtcTime}</span>
          </div>
        </div>

        {/* SHA-256 Digest Card */}
        <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-mono text-[11px] font-semibold">
            <Fingerprint className="h-3.5 w-3.5 text-primary" />
            <span>Bound Payload Digest (SHA-256)</span>
          </div>
          <div className="font-mono text-[11px] text-slate-600 dark:text-slate-400 break-all select-all leading-tight bg-white dark:bg-slate-950 p-2 rounded border border-slate-200 dark:border-slate-800">
            {documentSha256 || "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"}
          </div>
        </div>

        {/* Binding Attestation Declaration */}
        <label className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card cursor-pointer select-none">
          <input
            type="checkbox"
            checked={confirmedCheckbox}
            onChange={(e) => setConfirmedCheckbox(e.target.checked)}
            disabled={isSubmitting}
            className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
          <div className="text-xs text-foreground leading-relaxed">
            <span className="font-semibold block text-slate-900 dark:text-slate-100 mb-0.5">
              Binding Attestation
            </span>
            I attest that I have fully read, understand, and agree to adhere to all instructions,
            safety precautions, and protocols specified in this Standard Operating Procedure.
          </div>
        </label>

        {/* Error Alert */}
        {errorMessage && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5 pt-2 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="min-h-[44px] h-11 w-full sm:w-auto px-4 rounded-xl border border-border bg-card hover:bg-muted text-foreground text-xs font-semibold transition-colors disabled:opacity-50"
          >
            Cancel & Return
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={!confirmedCheckbox || isSubmitting}
            className={cn(
              "min-h-[44px] h-11 w-full sm:w-auto px-5 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 shadow transition-all active:scale-[0.98]",
              confirmedCheckbox && !isSubmitting
                ? "bg-primary text-primary-foreground hover:bg-blue-800 cursor-pointer"
                : "bg-muted text-muted-foreground opacity-60 cursor-not-allowed border border-border"
            )}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Recording in Ledger...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" />
                <span>Sign & Record Acknowledgment</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
