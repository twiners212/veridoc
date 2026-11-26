import * as React from "react";
import {
  FileEdit,
  Clock,
  CheckCircle2,
  ShieldCheck,
  History,
  Archive,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DocumentLifecycleState } from "@/types/roles";

export interface LifecycleStatusBadgeProps {
  state: DocumentLifecycleState | string;
  className?: string;
  showIcon?: boolean;
  size?: "sm" | "md" | "lg";
}

interface StateConfig {
  label: string;
  icon: React.ElementType;
  classes: string;
  iconClasses: string;
}

const STATE_CONFIG: Record<string, StateConfig> = {
  DRAFT: {
    label: "DRAFT",
    icon: FileEdit,
    classes:
      "bg-[#F1F5F9] text-[#334155] border-[#CBD5E1] dark:bg-slate-800/80 dark:text-slate-200 dark:border-slate-700",
    iconClasses: "text-[#334155] dark:text-slate-300",
  },
  PENDING_APPROVAL: {
    label: "PENDING APPROVAL",
    icon: Clock,
    classes:
      "bg-[#FEF3C7] text-[#92400E] border-[#FCD34D] dark:bg-amber-950/70 dark:text-amber-200 dark:border-amber-700/80",
    iconClasses: "text-[#92400E] dark:text-amber-300",
  },
  APPROVED: {
    label: "APPROVED",
    icon: CheckCircle2,
    classes:
      "bg-[#E0F2FE] text-[#075985] border-[#7DD3FC] dark:bg-sky-950/70 dark:text-sky-200 dark:border-sky-700/80",
    iconClasses: "text-[#075985] dark:text-sky-300",
  },
  PUBLISHED: {
    label: "PUBLISHED",
    icon: ShieldCheck,
    classes:
      "bg-[#DCFCE7] text-[#166534] border-[#86EFAC] dark:bg-emerald-950/70 dark:text-emerald-200 dark:border-emerald-700/80",
    iconClasses: "text-[#166534] dark:text-emerald-300",
  },
  SUPERSEDED: {
    label: "SUPERSEDED",
    icon: History,
    classes:
      "bg-[#F3E8FF] text-[#6B21A8] border-[#D8B4FE] dark:bg-purple-950/70 dark:text-purple-200 dark:border-purple-700/80",
    iconClasses: "text-[#6B21A8] dark:text-purple-300",
  },
  RETIRED: {
    label: "RETIRED",
    icon: Archive,
    classes:
      "bg-[#FEE2E2] text-[#991B1B] border-[#FCA5A5] dark:bg-red-950/70 dark:text-red-200 dark:border-red-700/80",
    iconClasses: "text-[#991B1B] dark:text-red-300",
  },
};

export function LifecycleStatusBadge({
  state,
  className,
  showIcon = true,
  size = "md",
}: LifecycleStatusBadgeProps) {
  const normalizedState = (state || "DRAFT").toUpperCase();
  const config = STATE_CONFIG[normalizedState] || STATE_CONFIG.DRAFT;
  const Icon = config.icon;

  const sizeClasses = {
    sm: "px-2 py-0.5 text-[11px] gap-1",
    md: "px-2.5 py-0.5 text-xs gap-1.5",
    lg: "px-3 py-1 text-sm gap-2",
  }[size];

  const iconSizes = {
    sm: "h-3 w-3",
    md: "h-3.5 w-3.5",
    lg: "h-4 w-4",
  }[size];

  return (
    <span
      className={cn(
        "inline-flex items-center font-medium border rounded select-none shrink-0 tracking-wide",
        config.classes,
        sizeClasses,
        className
      )}
      data-lifecycle-state={normalizedState}
    >
      {showIcon && <Icon className={cn(iconSizes, config.iconClasses)} aria-hidden="true" />}
      <span className="font-semibold">{config.label}</span>
    </span>
  );
}
