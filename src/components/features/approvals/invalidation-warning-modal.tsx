"use client";

import * as React from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface InvalidationWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isInvalidating?: boolean;
  documentTitle?: string;
  versionLabel?: string;
  actionType?: "edit" | "upload";
}

export function InvalidationWarningModal({
  isOpen,
  onClose,
  onConfirm,
  isInvalidating = false,
  documentTitle,
  versionLabel,
  actionType = "edit",
}: InvalidationWarningModalProps) {
  const [confirmed, setConfirmed] = React.useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setConfirmed(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="invalidation-dialog-title"
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center gap-3 text-amber-600 mb-3">
          <AlertTriangle className="h-6 w-6 shrink-0" />
          <h3
            id="invalidation-dialog-title"
            className="text-base font-semibold text-foreground"
          >
            Approval Invalidation Warning (DEC-04)
          </h3>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed">
          {documentTitle ? (
            <>
              <strong>{documentTitle}</strong> ({versionLabel || "active version"}) is
              currently in <strong>PENDING_APPROVAL</strong>.
            </>
          ) : (
            <>
              This document version is currently in{" "}
              <strong>PENDING_APPROVAL</strong>.
            </>
          )}{" "}
          {actionType === "upload"
            ? "Replacing the underlying PDF attachment"
            : "Modifying the controlled title or procedure content"}{" "}
          will:
        </p>

        <ul className="mt-3 list-disc pl-5 space-y-1 text-xs text-muted-foreground">
          <li>Invalidate all collected approver signatures.</li>
          <li>
            Atomically reset the workflow cycle to <strong>DRAFT</strong>.
          </li>
          <li>Increment the draft minor version revision.</li>
          <li>
            Append an{" "}
            <code className="font-mono text-[11px] bg-muted px-1 py-0.5 rounded">
              APPROVAL_INVALIDATED_BY_EDIT
            </code>{" "}
            audit log event.
          </li>
        </ul>

        <div className="mt-4 flex items-start gap-2 p-3 rounded bg-amber-50 border border-amber-200">
          <input
            id="invalidation-modal-confirm-check"
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
            data-testid="invalidation-confirm-checkbox"
          />
          <label
            htmlFor="invalidation-modal-confirm-check"
            className="text-xs font-medium text-amber-900 cursor-pointer select-none"
          >
            I confirm that I want to invalidate existing approval signatures and
            return this document to DRAFT.
          </label>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isInvalidating}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={!confirmed || isInvalidating}
            onClick={onConfirm}
            data-testid="confirm-invalidation-button"
          >
            {isInvalidating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                Invalidating &amp; Saving...
              </>
            ) : (
              "Confirm & Invalidate"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
