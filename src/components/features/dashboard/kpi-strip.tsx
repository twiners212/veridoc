"use client";

import * as React from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Hourglass,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GsapStaggerGroup, GsapHoverCard } from "@/components/motion/gsap-motion";

export interface GovernanceKpis {
  publishedActiveSops: number;
  publishedTrend?: string;
  pendingApprovals: number;
  pendingApprovalsBlockedCount: number;
  readAcknowledgmentRate: number; // 0..100
  acknowledgedCount: number;
  totalAssignedCount: number;
  overdueAcknowledgments: number;
  overdueGroupsCount?: number;
}

export interface KpiStripProps {
  kpis: GovernanceKpis;
  onFilterOverdue?: () => void;
  className?: string;
}

export function KpiStrip({ kpis, onFilterOverdue, className }: KpiStripProps) {
  const isAboveTarget = kpis.readAcknowledgmentRate >= 85;

  return (
    <GsapStaggerGroup
      stagger={0.06}
      duration={0.35}
      className={cn(
        "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4",
        className
      )}
    >
      {/* Card 1: Published Active SOPs */}
      <GsapHoverCard
        data-gsap-item
        className="bg-gradient-to-br from-card via-card to-emerald-50/40 dark:to-emerald-950/20 p-5 rounded-lg border border-border shadow-xs flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-shadow"
      >
        <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500" />
        <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Published Active SOPs
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800 flex items-center justify-center">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-3xl font-bold tracking-tight text-foreground">
              {kpis.publishedActiveSops}
            </span>
            {kpis.publishedTrend && (
              <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 flex items-center gap-0.5">
                <TrendingUp className="h-3 w-3" />
                {kpis.publishedTrend}
              </span>
            )}
          </div>
        </div>
        <div className="pt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>All SHA-256 Digest Verified</span>
        </div>
      </GsapHoverCard>

      {/* Card 2: Pending Approvals */}
      <GsapHoverCard
        data-gsap-item
        className="bg-gradient-to-br from-card via-card to-amber-50/40 dark:to-amber-950/20 p-5 rounded-lg border border-border shadow-xs flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-shadow"
      >
        <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-amber-500 via-orange-500 to-amber-400" />
        <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Pending Approvals
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800 flex items-center justify-center">
              <Hourglass className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-3xl font-bold tracking-tight text-foreground">
              {kpis.pendingApprovals}
            </span>
            <span className="text-xs text-muted-foreground font-mono">
              in sequential queue
            </span>
          </div>
        </div>
        <div className="pt-2">
          {kpis.pendingApprovalsBlockedCount > 0 ? (
            <Link
              href="/approvals"
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950/70 dark:text-amber-200 dark:border-amber-800 text-xs font-semibold hover:opacity-90 transition-opacity"
            >
              <AlertTriangle className="h-3 w-3 text-amber-700 dark:text-amber-400" />
              <span>{kpis.pendingApprovalsBlockedCount} Blocked Approver (BR-APP-04)</span>
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs font-medium">
              <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              <span>Queue progressing normally</span>
            </span>
          )}
        </div>
      </GsapHoverCard>

      {/* Card 3: Read Acknowledgment Rate */}
      <GsapHoverCard
        data-gsap-item
        className="bg-gradient-to-br from-card via-card to-blue-50/50 dark:to-blue-950/25 p-5 rounded-lg border border-border shadow-xs flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-shadow"
      >
        <div className="absolute inset-x-0 top-0 h-[3px] bg-brand-gradient" />
        <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Read Acknowledgment Rate
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800 flex items-center justify-center">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-3xl font-bold tracking-tight text-foreground">
              {kpis.readAcknowledgmentRate.toFixed(1)}%
            </span>
            <span
              className={cn(
                "text-xs font-semibold px-1.5 py-0.5 rounded",
                isAboveTarget
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300"
                  : "bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300"
              )}
            >
              {isAboveTarget ? "Above 85% Target" : "Below 85% Target"}
            </span>
          </div>
        </div>
        <div className="pt-2 space-y-1.5">
          <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
            <div
              className={cn(
                "h-1.5 rounded-full transition-all duration-700",
                isAboveTarget ? "bg-brand-gradient" : "bg-destructive"
              )}
              style={{
                width: `${Math.min(100, Math.max(0, kpis.readAcknowledgmentRate))}%`,
              }}
            />
          </div>
          <div className="flex justify-between items-center text-xs text-muted-foreground font-mono">
            <span>
              {kpis.acknowledgedCount} / {kpis.totalAssignedCount} assigned
            </span>
            <span className="font-semibold text-foreground">Target: 85%</span>
          </div>
        </div>
      </GsapHoverCard>

      {/* Card 4: Overdue Acknowledgments */}
      <GsapHoverCard
        data-gsap-item
        className="bg-gradient-to-br from-card via-card to-red-50/40 dark:to-red-950/20 p-5 rounded-lg border border-border shadow-xs flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-shadow"
      >
        <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-red-600 via-rose-500 to-amber-500" />
        <div className="absolute right-0 bottom-0 opacity-5 pointer-events-none text-destructive">
          <ShieldAlert className="h-24 w-24" />
        </div>
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Overdue Acknowledgments
            </span>
            <div className="w-8 h-8 rounded-lg bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2 mb-2">
            <span
              className={cn(
                "text-3xl font-bold tracking-tight",
                kpis.overdueAcknowledgments > 0 ? "text-destructive dark:text-red-400" : "text-foreground"
              )}
            >
              {kpis.overdueAcknowledgments}
            </span>
            {kpis.overdueAcknowledgments > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded bg-red-100 text-red-800 dark:bg-red-950/70 dark:text-red-300">
                Requires Escalation
              </span>
            )}
          </div>
        </div>
        <div className="pt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {kpis.overdueGroupsCount
              ? `Across ${kpis.overdueGroupsCount} frontline groups`
              : "Across active facilities"}
          </span>
          {onFilterOverdue && kpis.overdueAcknowledgments > 0 && (
            <button
              type="button"
              onClick={onFilterOverdue}
              className="text-primary dark:text-blue-400 hover:underline font-semibold inline-flex items-center gap-0.5 cursor-pointer"
            >
              <span>Filter</span>
              <ArrowRight className="h-3 w-3" />
            </button>
          )}
        </div>
      </GsapHoverCard>
    </GsapStaggerGroup>
  );
}
