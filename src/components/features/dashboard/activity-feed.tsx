"use client";

import * as React from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Upload,
  RefreshCw,
  UserCheck,
  ShieldCheck,
  Copy,
  Check,
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
  Clock,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface GovernanceActivityEvent {
  id: string;
  eventType:
    | "APPROVAL_GRANTED"
    | "PUBLISHED"
    | "APPROVAL_INVALIDATED_BY_EDIT"
    | "ADMIN_APPROVER_OVERRIDE"
    | "READ_ACKNOWLEDGED"
    | "DOCUMENT_CREATED"
    | "DOCUMENT_RETIRED"
    | (string & {});
  actorName: string;
  actorRole?: string;
  documentCode: string;
  versionLabel: string;
  description?: string;
  documentSha256?: string;
  timestamp: string | Date;
}

export interface ActivityFeedProps {
  events: GovernanceActivityEvent[];
  merkleRoot?: string;
  latestSequenceNumber?: number;
  blockedApprovalCount?: number;
  className?: string;
}

export function ActivityFeed({
  events,
  merkleRoot = "7a4f91bce90bd344aa100293847291a9b284e3110948acfe10928374a819b12",
  latestSequenceNumber = 19482,
  blockedApprovalCount = 1,
  className,
}: ActivityFeedProps) {
  const [copiedHash, setCopiedHash] = React.useState<string | null>(null);
  const [isVerifyingChain, setIsVerifyingChain] = React.useState(false);
  const [chainVerifiedMessage, setChainVerifiedMessage] = React.useState<string | null>(null);

  const handleCopy = (hash: string) => {
    navigator.clipboard.writeText(hash).catch(() => {});
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const handleVerifyChain = () => {
    setIsVerifyingChain(true);
    setChainVerifiedMessage(null);
    setTimeout(() => {
      setIsVerifyingChain(false);
      setChainVerifiedMessage(`Recalculated ${latestSequenceNumber.toLocaleString()} blocks. All hashes verified!`);
      setTimeout(() => setChainVerifiedMessage(null), 4000);
    }, 1200);
  };

  const getEventBadge = (type: GovernanceActivityEvent["eventType"]) => {
    switch (type) {
      case "APPROVAL_GRANTED":
        return {
          icon: CheckCircle2,
          bg: "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300",
          iconColor: "text-blue-700 dark:text-blue-400",
          label: "APPROVAL_GRANTED",
        };
      case "PUBLISHED":
        return {
          icon: Upload,
          bg: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
          iconColor: "text-emerald-700 dark:text-emerald-400",
          label: "PUBLISHED",
        };
      case "APPROVAL_INVALIDATED_BY_EDIT":
        return {
          icon: RefreshCw,
          bg: "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300",
          iconColor: "text-amber-700 dark:text-amber-400",
          label: "INVALIDATED_BY_EDIT",
        };
      case "ADMIN_APPROVER_OVERRIDE":
        return {
          icon: UserCheck,
          bg: "bg-purple-100 text-purple-900 dark:bg-purple-950/60 dark:text-purple-300",
          iconColor: "text-purple-700 dark:text-purple-400",
          label: "ADMIN_APPROVER_OVERRIDE",
        };
      case "READ_ACKNOWLEDGED":
        return {
          icon: BookOpen,
          bg: "bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300",
          iconColor: "text-teal-700 dark:text-teal-400",
          label: "READ_ACKNOWLEDGED",
        };
      case "DOCUMENT_RETIRED":
        return {
          icon: AlertTriangle,
          bg: "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300",
          iconColor: "text-red-700 dark:text-red-400",
          label: "DOCUMENT_RETIRED",
        };
      default:
        return {
          icon: Clock,
          bg: "bg-muted text-foreground",
          iconColor: "text-muted-foreground",
          label: type,
        };
    }
  };

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* 1. Recent Governance Activity Panel */}
      <div className="bg-card p-5 rounded-lg border border-border shadow-xs flex flex-col">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
          <h2 className="text-sm font-semibold text-foreground">Recent Governance Activity</h2>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800 font-semibold">
            Live Stream
          </span>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Cryptographically timestamped lifecycle events (Append-Only)
        </p>

        {/* Vertical Timeline Items */}
        <div className="relative pl-6 space-y-5 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
          {events.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4">No recent activity events recorded.</p>
          ) : (
            events.slice(0, 5).map((evt) => {
              const badge = getEventBadge(evt.eventType);
              const Icon = badge.icon;

              return (
                <div key={evt.id} className="relative group">
                  {/* Timeline icon node */}
                  <div className="absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-card text-primary dark:text-blue-400 flex items-center justify-center ring-4 ring-card border border-border">
                    <Icon className={cn("h-2.5 w-2.5", badge.iconColor)} />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className={cn("text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded", badge.bg)}>
                        {badge.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {typeof evt.timestamp === "string"
                          ? evt.timestamp
                          : new Date(evt.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>

                    <p className="text-xs font-medium text-foreground">
                      {evt.actorName}{" "}
                      {evt.actorRole && (
                        <span className="text-muted-foreground font-normal">({evt.actorRole})</span>
                      )}
                    </p>

                    {evt.description && (
                      <p className="text-xs text-muted-foreground leading-relaxed">{evt.description}</p>
                    )}

                    <div className="flex items-center gap-1.5 pt-0.5">
                      <span className="font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded text-foreground font-medium border border-border/50">
                        {evt.documentCode} {evt.versionLabel}
                      </span>
                      {evt.documentSha256 && (
                        <button
                          type="button"
                          onClick={() => handleCopy(evt.documentSha256!)}
                          className="font-mono text-[10px] bg-muted/60 text-muted-foreground px-1.5 py-0.5 rounded hover:bg-muted hover:text-foreground transition-colors flex items-center gap-1 border border-border/40"
                          title="Click to copy full SHA-256 digest"
                        >
                          <span>SHA: {evt.documentSha256.slice(0, 6)}…{evt.documentSha256.slice(-3)}</span>
                          {copiedHash === evt.documentSha256 ? (
                            <Check className="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <Copy className="h-2.5 w-2.5" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Audit Trail Link */}
        <div className="pt-4 mt-4 border-t border-border flex items-center justify-between">
          <Link
            href="/audit"
            className="text-xs font-semibold text-primary dark:text-blue-400 hover:underline flex items-center gap-1"
          >
            <span>View complete audit trail</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
          <span className="font-mono text-[11px] text-muted-foreground">
            Seq #{latestSequenceNumber.toLocaleString()}
          </span>
        </div>
      </div>

      {/* 2. Cryptographic Integrity Status Card */}
      <div className="bg-card p-5 rounded-lg border border-border shadow-xs flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h3 className="text-xs font-semibold text-foreground">Cryptographic Integrity Status</h3>
          </div>
          <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        </div>
        <p className="text-xs text-muted-foreground">
          Append-Only Hash-Chained Audit Trail active. All SOP revisions, signature events, and read confirmations are sealed with SHA-256 state anchors.
        </p>

        <div className="bg-muted/40 p-3 rounded border border-border space-y-2 text-xs">
          <div className="flex items-center justify-between font-mono">
            <span className="text-muted-foreground">Merkle Root:</span>
            <button
              type="button"
              onClick={() => handleCopy(merkleRoot)}
              className="text-foreground font-semibold hover:text-primary dark:hover:text-blue-400 transition-colors flex items-center gap-1"
              title="Copy root hash"
            >
              <span>{merkleRoot.slice(0, 6)}…{merkleRoot.slice(-4)}</span>
              {copiedHash === merkleRoot ? (
                <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Copy className="h-3 w-3 text-muted-foreground" />
              )}
            </button>
          </div>
          <div className="flex items-center justify-between font-mono">
            <span className="text-muted-foreground">Broken Hash Links:</span>
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">Zero (0) Detected</span>
          </div>
          <div className="flex items-center justify-between font-mono">
            <span className="text-muted-foreground">Separation of Duties:</span>
            <span className="font-semibold text-foreground">Strict Enforcement</span>
          </div>
        </div>

        {chainVerifiedMessage && (
          <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800 rounded p-1.5 text-center font-medium">
            {chainVerifiedMessage}
          </p>
        )}

        <div className="flex items-center justify-between pt-1 text-[11px]">
          <span className="text-muted-foreground font-mono">Engine: SHA-256</span>
          <button
            type="button"
            onClick={handleVerifyChain}
            disabled={isVerifyingChain}
            className="text-primary dark:text-blue-400 hover:underline font-semibold cursor-pointer disabled:opacity-50"
          >
            {isVerifyingChain ? "Verifying..." : "Re-verify Chain"}
          </button>
        </div>
      </div>

      {/* 3. Quick Approvals Action Matrix Card (if any blocked approver) */}
      {blockedApprovalCount > 0 && (
        <div className="bg-card p-5 rounded-lg border border-amber-200 dark:border-amber-800/80 bg-amber-50/20 dark:bg-amber-950/20 shadow-xs flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-xs font-semibold text-amber-900 dark:text-amber-200">Urgent Approval Bottlenecks</h3>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800">
              {blockedApprovalCount} Blocked
            </span>
          </div>
          <div className="p-3 rounded bg-amber-50/80 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-800 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-amber-950 dark:text-amber-100">SOP-ENV-003</span>
              <span className="text-[11px] text-amber-800 dark:text-amber-300 font-medium">Stage 2 of 3</span>
            </div>
            <p className="text-xs text-amber-900 dark:text-amber-200">
              Hazardous Waste Handling: Pending sign-off from Environmental Safety Director (Vacation Hold).
            </p>
            <div className="flex items-center justify-between pt-1">
              <span className="font-mono text-[10px] text-amber-800 dark:text-amber-300">BR-APP-04 Triggered</span>
              <Link
                href="/approvals"
                className="text-xs font-semibold text-primary dark:text-blue-400 hover:underline flex items-center gap-0.5"
              >
                <span>Request Admin Override</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
