"use client";

import * as React from "react";
import { CheckCircle2, Clock, ScrollText, ShieldCheck, PenTool } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ReaderAcknowledgmentBarProps {
  scrollPercent: number;
  dwellTimeSeconds: number;
  requiredScrollPercent?: number;
  requiredDwellSeconds?: number;
  isAlreadyAcknowledged?: boolean;
  onOpenConfirmation: () => void;
  className?: string;
}

export function ReaderAcknowledgmentBar({
  scrollPercent,
  dwellTimeSeconds,
  requiredScrollPercent = 90,
  requiredDwellSeconds = 10,
  isAlreadyAcknowledged = false,
  onOpenConfirmation,
  className,
}: ReaderAcknowledgmentBarProps) {
  const isScrollMet = scrollPercent >= requiredScrollPercent;
  const isDwellMet = dwellTimeSeconds >= requiredDwellSeconds;
  const isReady = isScrollMet && isDwellMet;

  // Calculate composite progress towards 100%
  const scrollRatio = Math.min(1, scrollPercent / requiredScrollPercent);
  const dwellRatio = Math.min(1, dwellTimeSeconds / requiredDwellSeconds);
  const compositeProgressPercent = Math.round(((scrollRatio + dwellRatio) / 2) * 100);

  return (
    <aside
      aria-label="Document Acknowledgment Bar"
      className={cn(
        "fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-md border-t border-border shadow-[0_-4px_20px_rgba(0,0,0,0.06)] px-4 pt-3 pb-safe",
        className
      )}
    >
      <div className="max-w-md mx-auto w-full flex flex-col gap-2.5 pb-2">
        {/* Engagement Progress Feedback Strip */}
        <div className="flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2">
            {isReady ? (
              <span className="flex items-center gap-1.5 text-emerald-600 font-semibold">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>Reading Requirements Fulfilled</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-amber-600 font-medium">
                <Clock className="h-3.5 w-3.5 shrink-0 animate-pulse text-amber-600" />
                <span>
                  Scroll: {Math.min(100, Math.round(scrollPercent))}%/{requiredScrollPercent}% • Time: {dwellTimeSeconds}s/{requiredDwellSeconds}s
                </span>
              </span>
            )}
          </div>

          <div>
            {isAlreadyAcknowledged ? (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800">
                SIGNED
              </span>
            ) : isReady ? (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800 animate-in fade-in">
                READY
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
                {compositeProgressPercent}%
              </span>
            )}
          </div>
        </div>

        {/* Dual Progress Bar */}
        <div
          className="w-full h-1.5 bg-muted rounded-full overflow-hidden"
          role="progressbar"
          aria-valuenow={compositeProgressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={cn(
              "h-full rounded-full transition-all duration-300",
              isReady ? "bg-emerald-600" : "bg-brand-gradient"
            )}
            style={{ width: `${compositeProgressPercent}%` }}
          />
        </div>

        {/* Primary CTA Button */}
        {isAlreadyAcknowledged ? (
          <div className="min-h-[48px] h-12 w-full rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 dark:bg-emerald-950/50 dark:border-emerald-800 dark:text-emerald-300 font-semibold text-sm flex items-center justify-center gap-2 select-none">
            <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <span>SOP Already Acknowledged</span>
          </div>
        ) : (
          <button
            type="button"
            disabled={!isReady}
            onClick={onOpenConfirmation}
            className={cn(
              "min-h-[48px] h-12 w-full font-semibold text-sm rounded-xl shadow-md flex items-center justify-center gap-2 transition-all active:scale-[0.99] touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
              isReady
                ? "bg-brand-gradient text-white hover:opacity-95 cursor-pointer shadow-blue-500/20"
                : "bg-muted text-muted-foreground cursor-not-allowed opacity-60 shadow-none border border-border"
            )}
            aria-disabled={!isReady}
            title={
              !isReady
                ? `Scroll to >= ${requiredScrollPercent}% and spend >= ${requiredDwellSeconds}s reviewing the document to unlock sign-off`
                : "Tap to record your binding digital acknowledgment"
            }
          >
            <PenTool className="h-4 w-4 shrink-0" />
            <span className="truncate">
              {isReady
                ? "I Acknowledge That I Have Read & Understand This SOP"
                : `Review SOP to Unlock Sign-Off (${compositeProgressPercent}%)`}
            </span>
          </button>
        )}

        {/* Legal & Governance Micro-Copy */}
        <p className="text-[11px] text-muted-foreground text-center leading-tight">
          By tapping, your user ID, UTC timestamp, and SHA-256 payload digest are bound to the tenant audit ledger.
        </p>
      </div>
    </aside>
  );
}
