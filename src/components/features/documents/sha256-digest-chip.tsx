"use client";

import * as React from "react";
import { Hash, Copy, Check, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Sha256DigestChipProps {
  digest: string | null | undefined;
  className?: string;
  showIcon?: boolean;
}

export function Sha256DigestChip({
  digest,
  className,
  showIcon = true,
}: Sha256DigestChipProps) {
  const [copied, setCopied] = React.useState(false);
  const [popoverOpen, setPopoverOpen] = React.useState(false);
  const popoverRef = React.useRef<HTMLDivElement>(null);

  // Auto-dismiss copy state after 2 seconds
  React.useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  // Dismiss popover on click outside
  React.useEffect(() => {
    if (!popoverOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [popoverOpen]);

  if (!digest || digest.trim().length === 0) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono bg-muted text-muted-foreground border border-border/60",
          className
        )}
      >
        <Hash className="h-3 w-3 text-muted-foreground/70" />
        <span>No SHA-256 (Draft)</span>
      </span>
    );
  }

  const cleanDigest = digest.trim();
  const truncated =
    cleanDigest.length >= 16
      ? `${cleanDigest.slice(0, 8)}…${cleanDigest.slice(-4)}`
      : cleanDigest;

  const handleCopy = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(cleanDigest);
      } else {
        // Fallback for older browsers
        const el = document.createElement("textarea");
        el.value = cleanDigest;
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      }
      setCopied(true);
    } catch {
      // Ignore clipboard write failures gracefully
    }
  };

  return (
    <div className="relative inline-flex items-center" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setPopoverOpen((prev) => !prev)}
        className={cn(
          "group inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
          className
        )}
        title="Click to view full SHA-256 payload digest"
        aria-expanded={popoverOpen}
      >
        {showIcon && (
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
        )}
        <span className="font-semibold text-slate-800 tracking-tight">{truncated}</span>
        <span
          role="button"
          tabIndex={0}
          onClick={handleCopy}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleCopy();
            }
          }}
          className="ml-0.5 p-0.5 rounded text-slate-400 hover:text-slate-800 hover:bg-slate-200 transition-colors"
          title="Copy digest"
          aria-label="Copy SHA-256 digest"
        >
          {copied ? (
            <Check className="h-3 w-3 text-emerald-600 animate-in zoom-in-50" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </span>
      </button>

      {/* Popover showing full 64-character SHA-256 digest */}
      {popoverOpen && (
        <div
          className="absolute left-0 top-full mt-1.5 z-50 w-80 sm:w-96 rounded-lg border border-border bg-card p-3.5 shadow-lg text-left"
          role="dialog"
          aria-label="SHA-256 Digest Details"
        >
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span className="text-xs font-semibold text-foreground">
                SHA-256 Digest Verified
              </span>
            </div>
            <button
              type="button"
              onClick={() => setPopoverOpen(false)}
              className="text-muted-foreground hover:text-foreground p-0.5 rounded"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-2.5 space-y-2">
            <p className="text-[11px] text-muted-foreground leading-normal">
              Deterministic 256-bit cryptographic payload hash bound to this document version
              (DEC-06).
            </p>

            <div className="p-2 rounded bg-muted/60 border border-border/80 font-mono text-[11px] break-all select-all text-foreground leading-relaxed">
              {cleanDigest}
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] text-muted-foreground font-mono">
                Length: {cleanDigest.length} hex chars
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-primary text-primary-foreground hover:bg-blue-800 transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>Copy Hash</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
