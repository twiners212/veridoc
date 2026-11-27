"use client";

import * as React from "react";
import { Copy, Check, Link as LinkIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface HashChipPopoverProps {
  hash: string;
  prevHash?: string;
  sequenceNumber: number;
  className?: string;
}

export function HashChipPopover({
  hash,
  prevHash,
  sequenceNumber,
  className,
}: HashChipPopoverProps) {
  const [copied, setCopied] = React.useState(false);
  const [isOpen, setIsOpen] = React.useState(false);
  const popoverRef = React.useRef<HTMLDivElement>(null);

  const truncatedHash =
    hash.length > 12 ? `${hash.slice(0, 6)}...${hash.slice(-4)}` : hash;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className={cn("relative inline-block", className)} ref={popoverRef}>
      <div className="inline-flex items-center rounded bg-muted/70 border border-border text-xs font-mono text-foreground transition-colors group">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="px-1.5 py-0.5 hover:bg-muted rounded-l text-left transition-colors"
          title="Click to view full cryptographic hash proof"
        >
          {truncatedHash}
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="p-1 pr-1.5 hover:bg-muted rounded-r text-muted-foreground hover:text-foreground transition-colors"
          title="Copy full 64-character SHA-256 hash"
        >
          {copied ? (
            <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </button>
      </div>

      {isOpen && (
        <div className="absolute left-0 bottom-full mb-2 z-50 w-80 p-3 rounded-lg shadow-xl bg-popover text-popover-foreground border border-border text-xs flex flex-col gap-2">
          <div className="flex items-center justify-between border-b border-border pb-1.5">
            <span className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <LinkIcon className="h-3 w-3 text-primary dark:text-blue-400" />
              <span>Block #{sequenceNumber} SHA-256 Digest</span>
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="text-[11px] text-primary dark:text-blue-400 hover:underline flex items-center gap-1 font-medium"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground font-medium">
              Entry Hash (Canonical SHA-256):
            </span>
            <span className="font-mono text-[11px] break-all bg-muted/60 p-1.5 rounded border border-border/70 select-all">
              {hash}
            </span>
          </div>

          {prevHash && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-muted-foreground font-medium">
                Cryptographically Chained to Block #{Math.max(1, sequenceNumber - 1)}:
              </span>
              <span className="font-mono text-[10px] break-all text-muted-foreground bg-muted/30 p-1 rounded">
                {prevHash}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
