"use client";

import * as React from "react";
import { CheckCircle2, Copy, Check, ArrowRight, ShieldCheck, FileCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useModalA11y } from "@/components/ui/use-modal-a11y";

export interface AcknowledgmentReceiptModalProps {
  isOpen: boolean;
  onClose?: () => void;
  receiptId: string;
  documentCode: string;
  documentTitle: string;
  version: string;
  documentSha256: string;
  userId: string;
  userName: string;
  acknowledgedAt: string;
}

export function AcknowledgmentReceiptModal({
  isOpen,
  onClose,
  receiptId,
  documentCode,
  documentTitle,
  version,
  documentSha256,
  userId,
  userName,
  acknowledgedAt,
}: AcknowledgmentReceiptModalProps) {
  const router = useRouter();
  const [copiedReceipt, setCopiedReceipt] = React.useState(false);
  const [copiedHash, setCopiedHash] = React.useState(false);
  const modalRef = React.useRef<HTMLDivElement>(null);

  useModalA11y({
    isOpen,
    onClose,
    containerRef: modalRef,
  });

  if (!isOpen) return null;

  const handleCopyReceipt = async () => {
    try {
      await navigator.clipboard.writeText(receiptId);
      setCopiedReceipt(true);
      setTimeout(() => setCopiedReceipt(false), 2000);
    } catch {
      // Ignore
    }
  };

  const handleCopyHash = async () => {
    try {
      await navigator.clipboard.writeText(documentSha256);
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 2000);
    } catch {
      // Ignore
    }
  };

  const handleReturnToQueue = () => {
    if (onClose) onClose();
    router.push("/to-read");
    router.refresh();
  };

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="receipt-title"
    >
      <div className="bg-card rounded-2xl p-6 sm:p-7 max-w-md w-full border border-border shadow-2xl flex flex-col items-center text-center gap-4">
        {/* Seal Icon */}
        <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-inner">
          <CheckCircle2 className="h-9 w-9" />
        </div>

        {/* Heading */}
        <div className="space-y-1">
          <h3 id="receipt-title" className="text-lg font-bold text-foreground">
            Binding Acknowledgment Recorded
          </h3>
          <p className="text-xs text-muted-foreground">
            Committed to tenant immutable audit ledger
          </p>
        </div>

        {/* User & Time Details */}
        <p className="text-xs text-muted-foreground leading-relaxed">
          Signature committed for operator <strong className="text-foreground">{userName}</strong>{" "}
          <span className="font-mono text-[11px] text-muted-foreground">({userId.slice(0, 8)})</span> at{" "}
          <span className="font-mono font-semibold text-foreground">{acknowledgedAt}</span>.
        </p>

        {/* Receipt ID & Digest Card */}
        <div className="w-full bg-muted/50 rounded-xl p-3.5 border border-border flex flex-col gap-2.5 text-left text-xs font-mono">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-[11px]">Receipt Number:</span>
            <div className="flex items-center gap-1.5 font-bold text-primary">
              <span>{receiptId}</span>
              <button
                type="button"
                onClick={handleCopyReceipt}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Copy receipt number"
                aria-label="Copy receipt ID"
              >
                {copiedReceipt ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-[11px]">SOP Code:</span>
            <span className="font-semibold text-foreground">
              {documentCode} · {version}
            </span>
          </div>

          <div className="space-y-1 pt-1 border-t border-border/60">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Block Digest Seal (SHA-256):</span>
              <button
                type="button"
                onClick={handleCopyHash}
                className="flex items-center gap-1 text-[10px] text-primary hover:underline"
              >
                {copiedHash ? (
                  <span className="text-emerald-600 font-semibold">Copied!</span>
                ) : (
                  <span>Copy Full Hash</span>
                )}
              </button>
            </div>
            <div className="text-[11px] text-foreground bg-card p-2 rounded border border-border break-all select-all font-mono">
              {documentSha256}
            </div>
          </div>
        </div>

        {/* Return Button */}
        <button
          type="button"
          onClick={handleReturnToQueue}
          className="min-h-[44px] h-11 w-full bg-primary text-primary-foreground hover:bg-blue-800 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 shadow transition-all active:scale-[0.99] touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 mt-1"
        >
          <span>Return to To-Read Queue</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
