"use client";

import * as React from "react";
import {
  Archive,
  X,
  AlertTriangle,
  Loader2,
  ShieldAlert,
  FileX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useModalA11y } from "@/components/ui/use-modal-a11y";
import { retireDocumentVersionAction } from "@/server/actions/reader.actions";
import { cn } from "@/lib/utils";

export interface RetireDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result: { versionId: string }) => void;
  documentId: string;
  versionId: string;
  versionLabel: string;
  documentCode: string;
  documentTitle: string;
  tenantId?: string;
}

export function RetireDocumentModal({
  isOpen,
  onClose,
  onSuccess,
  documentId,
  versionId,
  versionLabel,
  documentCode,
  documentTitle,
  tenantId,
}: RetireDocumentModalProps) {
  const [reason, setReason] = React.useState("");
  const [confirmed, setConfirmed] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const modalRef = React.useRef<HTMLDivElement>(null);

  useModalA11y({
    isOpen,
    onClose,
    disabled: isSubmitting,
    containerRef: modalRef,
  });

  React.useEffect(() => {
    if (isOpen) {
      setReason("");
      setConfirmed(false);
      setErrorMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanReason = reason.trim();
    if (cleanReason.length < 5) {
      setErrorMessage("Retirement reason must be at least 5 characters long.");
      return;
    }

    if (!confirmed) {
      setErrorMessage("Please check the confirmation box to authorize retirement.");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await retireDocumentVersionAction({
        versionId,
        tenantId,
        reason: cleanReason,
      });

      if (res.success) {
        onClose();
        onSuccess({ versionId: res.data.versionId });
      } else {
        setErrorMessage(res.error.message || "Failed to retire document version.");
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "An unexpected error occurred while retiring."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="retire-modal-title"
    >
      <div className="bg-card rounded-lg border border-border shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-destructive/10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-red-100 text-red-800 flex items-center justify-center border border-red-300">
              <Archive className="h-4 w-4" />
            </div>
            <div>
              <h2 id="retire-modal-title" className="text-sm font-semibold text-foreground">
                Retire SOP Document Version
              </h2>
              <p className="text-xs text-muted-foreground font-mono">
                {documentCode} • {versionLabel}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Destructive Invariant Warning Banner (BR-VER-01) */}
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-950 space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-red-900">
              <ShieldAlert className="h-4 w-4 text-red-700 shrink-0" />
              <span>Permanent Retirement Warning (BR-VER-01)</span>
            </div>
            <p className="leading-relaxed">
              Retiring this document version will transition its lifecycle status to{" "}
              <strong>RETIRED</strong>:
            </p>
            <ul className="list-disc pl-4 space-y-0.5 text-red-900">
              <li>Permanently removed from active frontline reader queues.</li>
              <li>Pending reader assignments will be marked <code>EXPIRED_RETIRED</code>.</li>
              <li>Audit trails and past digital sign-off records remain permanently intact.</li>
            </ul>
          </div>

          {/* Document Summary */}
          <div className="bg-muted/40 rounded p-2.5 border border-border text-xs">
            <p className="font-medium text-foreground">{documentTitle}</p>
          </div>

          {/* Justification Textarea */}
          <div className="space-y-1.5">
            <label
              htmlFor="retire-reason"
              className="text-xs font-semibold text-foreground flex items-center justify-between"
            >
              <span>Retirement Reason / Justification *</span>
              <span className="text-[10px] text-muted-foreground font-normal">Min 5 chars</span>
            </label>
            <textarea
              id="retire-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Superseded by new global facility standard ISO-9001:2015 overhaul; operational equipment decommissioned..."
              rows={3}
              required
              className="w-full rounded-md border border-border bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-destructive resize-none"
            />
          </div>

          {/* Confirmation Checkbox */}
          <label className="flex items-start gap-2 text-xs text-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 rounded border-border text-destructive focus:ring-destructive h-3.5 w-3.5"
            />
            <span className="text-muted-foreground">
              I understand that retiring this version removes it from operational use and expires all active assignments.
            </span>
          </label>

          {/* Error Banner */}
          {errorMessage && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Footer CTAs */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              variant="destructive"
              className="font-medium gap-1.5"
              disabled={isSubmitting || !confirmed || reason.trim().length < 5}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Retiring Version...
                </>
              ) : (
                <>
                  <Archive className="h-3.5 w-3.5" />
                  Confirm Retirement
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
