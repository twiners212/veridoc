"use client";

import * as React from "react";
import {
  Shield,
  X,
  Copy,
  Check,
  Eye,
  EyeOff,
  AlertTriangle,
  Loader2,
  Lock,
  FileCheck,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { executeApprovalDecisionAction } from "@/server/actions/approval.actions";
import { cn } from "@/lib/utils";
import type { WorkspaceRole } from "@/types/roles";

export interface SignOffReauthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result: {
    stepId: string;
    stepStatus: string;
    isFinalStep: boolean;
  }) => void;
  stepId: string;
  documentCode: string;
  documentTitle: string;
  versionLabel: string;
  documentSha256: string;
  decision: "APPROVE" | "REJECT";
  currentUserRole: WorkspaceRole;
  currentUserName: string;
  currentUserId: string;
  isAuthor: boolean;
  allowSingleAuthorOverride: boolean;
}

export function SignOffReauthModal({
  isOpen,
  onClose,
  onSuccess,
  stepId,
  documentCode,
  documentTitle,
  versionLabel,
  documentSha256,
  decision,
  currentUserRole,
  currentUserName,
  currentUserId,
  isAuthor,
  allowSingleAuthorOverride,
}: SignOffReauthModalProps) {
  const [decisionIntent, setDecisionIntent] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [copiedDigest, setCopiedDigest] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  // Reset form when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setDecisionIntent("");
      setPassword("");
      setShowPassword(false);
      setCopiedDigest(false);
      setErrorMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Separation of duties check
  const isSelfApprovalBlocked =
    decision === "APPROVE" && isAuthor && !allowSingleAuthorOverride;

  const handleCopyDigest = async () => {
    if (!documentSha256) return;
    try {
      await navigator.clipboard.writeText(documentSha256);
      setCopiedDigest(true);
      setTimeout(() => setCopiedDigest(false), 2000);
    } catch {
      // Ignore clipboard write failure
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (isSelfApprovalBlocked) {
      setErrorMessage(
        "Self-approval prohibited: Document author cannot approve their own controlled document (BR-APP-01)."
      );
      return;
    }

    const trimmedIntent = decisionIntent.trim();
    if (trimmedIntent.length < 5) {
      setErrorMessage("Decision Intent must be at least 5 characters long.");
      return;
    }
    if (trimmedIntent.length > 1000) {
      setErrorMessage("Decision Intent cannot exceed 1000 characters.");
      return;
    }
    if (!password) {
      setErrorMessage("Password re-authentication is required.");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await executeApprovalDecisionAction({
        approvalStepId: stepId,
        decision,
        decisionIntent: trimmedIntent,
        reauthPassword: password,
        expectedDocumentSha256: documentSha256 || undefined,
      });

      if (!res.success) {
        if (res.error?.code === "REAUTH_FAILED") {
          setErrorMessage(
            "Authentication failed: Invalid sign-off password. Please verify your credentials."
          );
        } else if (res.error?.code === "SELF_APPROVAL_PROHIBITED") {
          setErrorMessage(
            "Self-approval prohibited: Document author cannot approve their own document version (BR-APP-01)."
          );
        } else if (res.error?.code === "INTEGRITY_HASH_MISMATCH") {
          setErrorMessage(
            "Cryptographic digest mismatch: The document content has changed since this approval cycle was initiated."
          );
        } else {
          setErrorMessage(res.error?.message || "Failed to execute sign-off decision.");
        }
        return;
      }

      onSuccess({
        stepId: res.data.stepId,
        stepStatus: res.data.stepStatus,
        isFinalStep: res.data.isFinalStep,
      });
      onClose();
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "An unexpected error occurred during electronic signature."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const truncatedHash = documentSha256
    ? `${documentSha256.substring(0, 16)}...${documentSha256.substring(56)}`
    : "No Digest";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reauth-modal-title"
    >
      <div className="w-full max-w-xl rounded-xl border border-border bg-card shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="p-5 border-b border-border flex items-start justify-between bg-card">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "w-7 h-7 rounded flex items-center justify-center text-primary-foreground",
                  decision === "APPROVE" ? "bg-primary" : "bg-destructive"
                )}
              >
                {decision === "APPROVE" ? (
                  <FileCheck className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
              </div>
              <h3
                id="reauth-modal-title"
                className="text-base font-bold text-foreground tracking-tight"
              >
                {decision === "APPROVE"
                  ? "Digital Sign-Off Re-Authentication"
                  : "Reject Workflow with Feedback"}
              </h3>
            </div>
            <p className="text-xs text-muted-foreground">
              {decision === "APPROVE"
                ? "Complete electronic credential verification to record a legally binding digital approval."
                : "Submit structured rejection intent to reset this workflow cycle to DRAFT."}
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

        {/* Modal Body */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive flex items-start gap-2 text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Locked Governance Summary Box */}
          <div className="p-3.5 rounded-lg bg-muted/40 border border-border space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground font-medium">Document ID:</span>
              <span className="font-semibold text-foreground text-right truncate max-w-[320px]">
                {documentCode} ({documentTitle})
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground font-medium">Target Version:</span>
              <span className="font-mono font-bold text-foreground bg-muted px-1.5 py-0.5 rounded">
                {versionLabel}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground font-medium">Binding Digest:</span>
              <div className="font-mono text-[11px] text-primary flex items-center gap-1.5 font-semibold">
                <span>{truncatedHash}</span>
                <button
                  type="button"
                  onClick={handleCopyDigest}
                  className="p-0.5 text-muted-foreground hover:text-primary transition-colors"
                  title="Copy full 64-char SHA-256 digest"
                >
                  {copiedDigest ? (
                    <Check className="h-3 w-3 text-emerald-600" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
              </div>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-border">
              <span className="text-muted-foreground font-medium">Sign-Off Role:</span>
              <span className="font-semibold text-foreground">
                {currentUserRole.replace(/_/g, " ")} ({currentUserName})
              </span>
            </div>

            {/* Separation of Duties Status Indicator */}
            {isSelfApprovalBlocked ? (
              <div className="flex items-center gap-1.5 text-xs font-semibold text-destructive pt-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>
                  BR-APP-01 Separation of Duties Violation (Author cannot approve)
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 pt-1">
                <Check className="h-3.5 w-3.5" />
                <span>BR-APP-01 Separation of Duties Verified (Actor is not Author)</span>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Field 1: Sign-Off Intent / Justification */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label
                  htmlFor="sign-intent"
                  className="block text-xs font-semibold text-foreground"
                >
                  {decision === "APPROVE"
                    ? "Sign-Off Intent / Approval Justification"
                    : "Rejection Reason & Required Remediation"}{" "}
                  <span className="text-destructive">*</span>
                </label>
                <span className="text-[11px] text-muted-foreground font-mono">
                  {decisionIntent.length}/1000
                </span>
              </div>
              <textarea
                id="sign-intent"
                rows={3}
                value={decisionIntent}
                onChange={(e) => setDecisionIntent(e.target.value)}
                maxLength={1000}
                placeholder={
                  decision === "APPROVE"
                    ? "State operational or quality rationale (e.g. Reviewed and verified against QA standards...)"
                    : "Detail specific defects or missing sections that require author remediation before re-submission..."
                }
                className="w-full p-2.5 bg-background border border-border rounded text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
              <span className="block text-[11px] text-muted-foreground">
                Intent statements are permanently bound to the audit transaction.
              </span>
            </div>

            {/* Field 2: Password Re-Authentication */}
            <div className="space-y-1.5">
              <label
                htmlFor="sign-password"
                className="block text-xs font-semibold text-foreground"
              >
                Password Re-Authentication (REQ-FR-401){" "}
                <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <input
                  id="sign-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your account password"
                  autoComplete="current-password"
                  className="w-full pl-3 pr-10 py-2 bg-background border border-border rounded text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary tracking-wider"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <span className="block text-[11px] text-muted-foreground">
                Re-authentication required per electronic signature compliance standards.
              </span>
            </div>

            {/* Security Notice Banner (no false claims) */}
            <div className="p-3 rounded-lg bg-muted/30 border border-border flex items-start gap-2.5 text-xs text-muted-foreground">
              <Lock className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
              <p className="leading-relaxed">
                <strong className="text-foreground">Append-Only Audit Log:</strong>{" "}
                Sign-off records Full Name, User ID, Role, IP Address, UTC
                Timestamp, and SHA-256 Payload Digest into the hash-chained audit
                trail.
              </p>
            </div>

            {/* Modal Actions */}
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
                variant={decision === "APPROVE" ? "default" : "destructive"}
                disabled={
                  isSubmitting ||
                  isSelfApprovalBlocked ||
                  decisionIntent.trim().length < 5 ||
                  !password
                }
                data-testid="confirm-sign-off-button"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    Executing Sign-Off...
                  </>
                ) : decision === "APPROVE" ? (
                  <>
                    <Shield className="h-3.5 w-3.5 mr-1.5" />
                    Confirm Digital Sign-Off
                  </>
                ) : (
                  <>
                    <XCircle className="h-3.5 w-3.5 mr-1.5" />
                    Confirm Rejection
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
