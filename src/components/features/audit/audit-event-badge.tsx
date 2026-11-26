import * as React from "react";
import {
  CheckCircle2,
  ShieldCheck,
  UserCheck,
  AlertTriangle,
  ShieldAlert,
  Send,
  XCircle,
  FileText,
  Archive,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AuditEventBadgeProps {
  eventType: string;
  className?: string;
}

export function AuditEventBadge({ eventType, className }: AuditEventBadgeProps) {
  switch (eventType) {
    case "APPROVAL_GRANTED":
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold tracking-wide",
            "bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
            className
          )}
        >
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>APPROVAL_GRANTED</span>
        </span>
      );

    case "DOCUMENT_PUBLISHED":
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold tracking-wide",
            "bg-sky-50 text-sky-800 border border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800",
            className
          )}
        >
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
          <span>DOCUMENT_PUBLISHED</span>
        </span>
      );

    case "READ_ACKNOWLEDGED":
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold tracking-wide",
            "bg-slate-100 text-slate-800 border border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700",
            className
          )}
        >
          <UserCheck className="h-3.5 w-3.5 shrink-0 text-slate-600 dark:text-slate-400" />
          <span>READ_ACKNOWLEDGED</span>
        </span>
      );

    case "APPROVAL_INVALIDATED_BY_EDIT":
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold tracking-wide",
            "bg-amber-50 text-amber-800 border border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
            className
          )}
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>APPROVAL_INVALIDATED_BY_EDIT</span>
        </span>
      );

    case "ADMIN_APPROVER_OVERRIDE":
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold tracking-wide",
            "bg-purple-50 text-purple-800 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800",
            className
          )}
        >
          <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-purple-600 dark:text-purple-400" />
          <span>ADMIN_APPROVER_OVERRIDE</span>
        </span>
      );

    case "WORKFLOW_SUBMITTED":
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold tracking-wide",
            "bg-blue-50 text-blue-800 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
            className
          )}
        >
          <Send className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
          <span>WORKFLOW_SUBMITTED</span>
        </span>
      );

    case "APPROVAL_REJECTED":
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold tracking-wide",
            "bg-red-50 text-red-800 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800",
            className
          )}
        >
          <XCircle className="h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" />
          <span>APPROVAL_REJECTED</span>
        </span>
      );

    case "DOCUMENT_RETIRED":
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold tracking-wide",
            "bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
            className
          )}
        >
          <Archive className="h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
          <span>DOCUMENT_RETIRED</span>
        </span>
      );

    case "DOCUMENT_VERSION_UPDATED":
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold tracking-wide",
            "bg-slate-50 text-slate-700 border border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800",
            className
          )}
        >
          <RefreshCw className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          <span>DOCUMENT_VERSION_UPDATED</span>
        </span>
      );

    default:
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium tracking-wide",
            "bg-muted text-muted-foreground border border-border",
            className
          )}
        >
          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span>{eventType}</span>
        </span>
      );
  }
}
