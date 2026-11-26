"use client";

import * as React from "react";
import {
  ShieldAlert,
  X,
  AlertTriangle,
  Loader2,
  UserCheck,
  UserX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { adminOverrideApproverAction } from "@/server/actions/approval.actions";
import type { WorkspaceRole } from "@/types/roles";

export interface AdminOverrideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result: {
    stepId: string;
    previousApproverId: string;
    newApproverId: string;
  }) => void;
  stepId: string;
  stepOrder: number;
  currentApproverId: string;
  currentApproverName: string;
  currentApproverRole?: WorkspaceRole | null;
  isBlockedInactive: boolean;
  documentCode: string;
  documentTitle: string;
  authorId: string;
  availableApprovers?: Array<{
    id: string;
    name: string;
    email: string;
    role: WorkspaceRole;
    status: "ACTIVE" | "INVITED" | "DEACTIVATED";
  }>;
}

export function AdminOverrideModal({
  isOpen,
  onClose,
  onSuccess,
  stepId,
  stepOrder,
  currentApproverId,
  currentApproverName,
  currentApproverRole,
  isBlockedInactive,
  documentCode,
  documentTitle,
  authorId,
  availableApprovers = [],
}: AdminOverrideModalProps) {
  const [selectedApproverId, setSelectedApproverId] = React.useState("");
  const [justification, setJustification] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  // Eligible replacement approvers: active status, approval role, not author, not current approver
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
        m.id !== currentApproverId &&
        m.id !== authorId
    );
  }, [availableApprovers, currentApproverId, authorId]);

  React.useEffect(() => {
    if (isOpen) {
      setSelectedApproverId(eligibleApprovers[0]?.id || "");
      setJustification(
        isBlockedInactive
          ? "Approver reassigned due to assigned member deactivation (BR-APP-04)."
          : ""
      );
      setErrorMessage(null);
    }
  }, [isOpen, eligibleApprovers, isBlockedInactive]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!selectedApproverId) {
      setErrorMessage("Please select a qualified replacement approver.");
      return;
    }

    const trimmedJustification = justification.trim();
    if (trimmedJustification.length < 5) {
      setErrorMessage("Justification must be at least 5 characters long.");
      return;
    }
    if (trimmedJustification.length > 1000) {
      setErrorMessage("Justification cannot exceed 1000 characters.");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await adminOverrideApproverAction({
        approvalStepId: stepId,
        newApproverId: selectedApproverId,
        justification: trimmedJustification,
      });

      if (!res.success) {
        setErrorMessage(res.error?.message || "Failed to execute approver override.");
        return;
      }

      onSuccess(res.data);
      onClose();
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to override approver."
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
      aria-labelledby="override-modal-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-border flex items-start justify-between bg-card">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-amber-700">
              <ShieldAlert className="h-5 w-5" />
              <h3
                id="override-modal-title"
                className="text-base font-bold text-foreground"
              >
                Workspace Admin Approver Override (BR-APP-04)
              </h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Reassign Step {stepOrder} to an active member with approval authority.
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

          {/* Current Step Context */}
          <div className="p-3 rounded-lg bg-muted/40 border border-border space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Document:</span>
              <span className="font-semibold text-foreground">
                {documentCode} ({documentTitle})
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Current Approver:</span>
              <span className="font-semibold text-foreground flex items-center gap-1">
                {isBlockedInactive && (
                  <UserX className="h-3.5 w-3.5 text-amber-600" />
                )}
                {currentApproverName} (
                {currentApproverRole?.replace(/_/g, " ") || "Approver"})
              </span>
            </div>
            {isBlockedInactive && (
              <div className="p-2 rounded bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-medium">
                Assigned member is currently inactive/deactivated. Reassignment is
                required to unblock the sequential pipeline.
              </div>
            )}
          </div>

          {/* Replacement Approver Selection */}
          <div className="space-y-1.5">
            <label
              htmlFor="replacement-approver"
              className="block text-xs font-semibold text-foreground"
            >
              Select Replacement Approver <span className="text-destructive">*</span>
            </label>
            {eligibleApprovers.length > 0 ? (
              <select
                id="replacement-approver"
                value={selectedApproverId}
                onChange={(e) => setSelectedApproverId(e.target.value)}
                className="w-full p-2.5 bg-background border border-border rounded text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {eligibleApprovers.map((approver) => (
                  <option key={approver.id} value={approver.id}>
                    {approver.name} — {approver.role.replace(/_/g, " ")} ({approver.email})
                  </option>
                ))}
              </select>
            ) : (
              <div className="p-3 rounded border border-border bg-muted/20 text-xs text-muted-foreground">
                No other active approvers available in this workspace. Invite or activate
                an Approver/Reviewer first.
              </div>
            )}
            <span className="block text-[11px] text-muted-foreground">
              Candidate must have role Workspace Admin, Quality Manager, or Approver.
              Author cannot be assigned.
            </span>
          </div>

          {/* Mandatory Justification */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label
                htmlFor="override-justification"
                className="block text-xs font-semibold text-foreground"
              >
                Administrative Justification <span className="text-destructive">*</span>
              </label>
              <span className="text-[11px] text-muted-foreground font-mono">
                {justification.length}/1000
              </span>
            </div>
            <textarea
              id="override-justification"
              rows={3}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              maxLength={1000}
              placeholder="State governance reason for approver reassignment (min 5 characters)..."
              className="w-full p-2.5 bg-background border border-border rounded text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
            <span className="block text-[11px] text-muted-foreground">
              Override action is logged to the immutable audit trail with previous and new approver IDs.
            </span>
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
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={
                isSubmitting ||
                !selectedApproverId ||
                justification.trim().length < 5
              }
              data-testid="confirm-admin-override-button"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Reassigning...
                </>
              ) : (
                <>
                  <UserCheck className="h-3.5 w-3.5 mr-1.5" />
                  Confirm Reassignment
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
