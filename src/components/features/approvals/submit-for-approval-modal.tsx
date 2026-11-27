"use client";

import * as React from "react";
import {
  Send,
  X,
  Plus,
  Trash2,
  AlertTriangle,
  Loader2,
  Check,
  ArrowDown,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useModalA11y } from "@/components/ui/use-modal-a11y";
import { submitForApprovalAction } from "@/server/actions/approval.actions";
import type { WorkspaceRole } from "@/types/roles";

export interface SubmitForApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result: { cycleId: string; stepsCount: number }) => void;
  versionId: string;
  versionLabel: string;
  documentCode: string;
  documentTitle: string;
  authorId: string;
  expectedRowVersion?: number;
  tenantId?: string;
  allowSingleAuthorOverride?: boolean;
  availableApprovers?: Array<{
    id: string;
    name: string;
    email: string;
    role: WorkspaceRole;
    status: "ACTIVE" | "INVITED" | "DEACTIVATED";
  }>;
}

export function SubmitForApprovalModal({
  isOpen,
  onClose,
  onSuccess,
  versionId,
  versionLabel,
  documentCode,
  documentTitle,
  authorId,
  expectedRowVersion,
  tenantId,
  allowSingleAuthorOverride = false,
  availableApprovers = [],
}: SubmitForApprovalModalProps) {
  const [steps, setSteps] = React.useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const modalRef = React.useRef<HTMLDivElement>(null);

  useModalA11y({
    isOpen,
    onClose,
    disabled: isSubmitting,
    containerRef: modalRef,
  });

  // Eligible approvers for selection
  const eligibleApprovers = React.useMemo(() => {
    const validRoles: WorkspaceRole[] = [
      "WORKSPACE_ADMIN",
      "QUALITY_MANAGER",
      "APPROVER_REVIEWER",
    ];
    return availableApprovers.filter(
      (m) =>
        m.status === "ACTIVE" &&
        validRoles.includes(m.role) &&
        (allowSingleAuthorOverride || m.id !== authorId)
    );
  }, [availableApprovers, authorId, allowSingleAuthorOverride]);

  // Initialize steps when opened
  React.useEffect(() => {
    if (isOpen) {
      if (eligibleApprovers.length > 0) {
        setSteps([eligibleApprovers[0].id]);
      } else {
        setSteps([]);
      }
      setErrorMessage(null);
    }
  }, [isOpen, eligibleApprovers]);

  if (!isOpen) return null;

  const handleAddStep = () => {
    if (steps.length >= 10) return;
    // Pick the first candidate not equal to the last step's candidate
    const lastStep = steps[steps.length - 1];
    const candidate =
      eligibleApprovers.find((a) => a.id !== lastStep) || eligibleApprovers[0];
    if (candidate) {
      setSteps([...steps, candidate.id]);
    }
  };

  const handleRemoveStep = (index: number) => {
    if (steps.length <= 1) return;
    setSteps(steps.filter((_, i) => i !== index));
  };

  const handleApproverChange = (index: number, newId: string) => {
    const next = [...steps];
    next[index] = newId;
    setSteps(next);
  };

  // Validation
  let validationError: string | null = null;
  if (steps.length === 0) {
    validationError = "At least one approver is required.";
  } else if (steps.length > 10) {
    validationError = "Maximum of 10 approvers permitted.";
  } else {
    for (let i = 0; i < steps.length; i++) {
      if (!allowSingleAuthorOverride && steps[i] === authorId) {
        validationError =
          "Author cannot be assigned as an approver (Separation of Duties BR-APP-01).";
        break;
      }
      if (i > 0 && steps[i] === steps[i - 1]) {
        validationError = `Consecutive duplicate approvers are not allowed at steps ${i} and ${i + 1} (BR-SEQ-03).`;
        break;
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await submitForApprovalAction({
        versionId,
        approverIds: steps,
        expectedRowVersion,
        tenantId,
      });

      if (!res.success) {
        setErrorMessage(
          res.error?.message || "Failed to submit document for approval."
        );
        return;
      }

      onSuccess({
        cycleId: res.data.cycleId,
        stepsCount: res.data.stepsCount,
      });
      onClose();
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "An unexpected error occurred during workflow submission."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="submit-workflow-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-border flex items-start justify-between bg-card">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-primary">
              <Send className="h-5 w-5" />
              <h3
                id="submit-workflow-title"
                className="text-base font-bold text-foreground"
              >
                Submit for Sequential Approval
              </h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Configure 1 to 10 sequential review stages for {documentCode}{" "}
              ({versionLabel}).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Close dialog"
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

          {/* Document Summary */}
          <div className="p-3 rounded-lg bg-muted/40 border border-border text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Document:</span>
              <span className="font-semibold text-foreground truncate max-w-[320px]">
                {documentCode} — {documentTitle}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Version:</span>
              <span className="font-mono font-bold text-foreground bg-muted px-1.5 py-0.5 rounded">
                {versionLabel}
              </span>
            </div>
            <div className="text-[11px] text-emerald-700 font-medium pt-1 flex items-center gap-1">
              <Shield className="h-3 w-3" />
              <span>
                Submission computes and locks the canonical SHA-256 document digest.
              </span>
            </div>
          </div>

          {/* Sequential Stages */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wider font-mono">
                Approval Pipeline ({steps.length}/10 Stages)
              </label>
              {steps.length < 10 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddStep}
                  disabled={isSubmitting || eligibleApprovers.length === 0}
                  className="h-7 text-xs"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Stage
                </Button>
              )}
            </div>

            {eligibleApprovers.length === 0 ? (
              <div className="p-4 rounded border border-border bg-muted/20 text-xs text-muted-foreground text-center">
                No active approvers available in this workspace. Please invite or assign
                approvers with Quality Manager or Approver/Reviewer roles.
              </div>
            ) : (
              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                {steps.map((approverId, idx) => (
                  <div key={idx} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0">
                        {idx + 1}
                      </div>
                      <select
                        aria-label={`Approver for stage ${idx + 1}`}
                        value={approverId}
                        onChange={(e) =>
                          handleApproverChange(idx, e.target.value)
                        }
                        className="flex-1 p-2 bg-background border border-border rounded text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        {eligibleApprovers.map((approver) => (
                          <option key={approver.id} value={approver.id}>
                            {approver.name} ({approver.role.replace(/_/g, " ")}) —{" "}
                            {approver.email}
                          </option>
                        ))}
                      </select>
                      {steps.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveStep(idx)}
                          className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-muted rounded"
                          title="Remove stage"
                          aria-label={`Remove stage ${idx + 1}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    {idx < steps.length - 1 && (
                      <div className="flex items-center justify-center py-0.5 text-muted-foreground">
                        <ArrowDown className="h-3 w-3" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {validationError && (
              <p className="text-[11px] text-destructive font-medium">
                {validationError}
              </p>
            )}
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
              disabled={
                isSubmitting ||
                steps.length === 0 ||
                Boolean(validationError)
              }
              data-testid="submit-workflow-confirm-button"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Initiating Workflow...
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5 mr-1.5" />
                  Initiate Approval Workflow
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
