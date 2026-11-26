"use client";

import * as React from "react";
import { Undo2, X, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { recallApprovalAction } from "@/server/actions/approval.actions";

export interface RecallApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result: {
    versionId: string;
    lifecycleState: string;
    cycleStatus: string;
  }) => void;
  versionId: string;
  versionLabel: string;
  documentCode: string;
  documentTitle: string;
  expectedRowVersion?: number;
  tenantId?: string;
}

export function RecallApprovalModal({
  isOpen,
  onClose,
  onSuccess,
  versionId,
  versionLabel,
  documentCode,
  documentTitle,
  expectedRowVersion,
  tenantId,
}: RecallApprovalModalProps) {
  const [reason, setReason] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setReason("");
      setErrorMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanReason = reason.trim();
    if (cleanReason.length < 5) {
      setErrorMessage("Recall reason must be at least 5 characters long.");
      return;
    }
    if (cleanReason.length > 1000) {
      setErrorMessage("Recall reason cannot exceed 1000 characters.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await recallApprovalAction({
        versionId,
        reason: cleanReason,
        expectedRowVersion,
        tenantId,
      });

      if (!res.success) {
        setErrorMessage(res.error?.message || "Failed to recall approval workflow.");
        return;
      }

      onSuccess(res.data);
      onClose();
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "An unexpected error occurred while recalling the workflow."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recall-workflow-title"
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-border flex items-start justify-between bg-card">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-amber-700">
              <Undo2 className="h-5 w-5" />
              <h3
                id="recall-workflow-title"
                className="text-base font-bold text-foreground"
              >
                Recall Approval Workflow
              </h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Cancel active approvals for {documentCode} ({versionLabel}) and
              revert to editable DRAFT state.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {errorMessage && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive flex items-start gap-2 text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
            <p className="font-semibold">
              Warning: Recalling closes the active review cycle.
            </p>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              All currently pending or waiting steps will be cancelled, and the
              document will return to DRAFT.
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label
                htmlFor="recall-reason"
                className="block text-xs font-semibold text-foreground"
              >
                Recall Reason <span className="text-destructive">*</span>
              </label>
              <span className="text-[11px] text-muted-foreground font-mono">
                {reason.length}/1000
              </span>
            </div>
            <textarea
              id="recall-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={1000}
              placeholder="State why this workflow is being withdrawn back to DRAFT (min 5 characters)..."
              className="w-full p-2.5 bg-background border border-border rounded text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
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
              disabled={isSubmitting || reason.trim().length < 5}
              data-testid="confirm-recall-button"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Recalling...
                </>
              ) : (
                <>
                  <Undo2 className="h-3.5 w-3.5 mr-1.5" />
                  Confirm Recall
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
