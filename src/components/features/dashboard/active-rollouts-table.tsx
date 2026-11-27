"use client";

import * as React from "react";
import Link from "next/link";
import {
  Search,
  FileDown,
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  ShieldAlert,
  Megaphone,
} from "lucide-react";
import { LifecycleStatusBadge } from "@/components/features/documents/lifecycle-status-badge";
import { Sha256DigestChip } from "@/components/features/documents/sha256-digest-chip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface SopRolloutItem {
  documentId: string;
  versionId: string;
  documentCode: string;
  title: string;
  versionLabel: string;
  lifecycleState: "PUBLISHED" | "APPROVED" | "DRAFT" | "PENDING_APPROVAL" | "SUPERSEDED" | "RETIRED";
  targetAudienceGroupNames: string[];
  acknowledgedCount: number;
  totalAssignedCount: number;
  completionPercent: number; // 0..100
  overdueCount: number;
  dueDate?: string | null;
  documentSha256?: string | null;
  facilityLocation?: string | null;
}

export interface ActiveRolloutsTableProps {
  rollouts: SopRolloutItem[];
  availableGroups?: string[];
  recentEventsCount?: number;
  selectedFilterTab?: "all" | "overdue" | "completed";
  onFilterTabChange?: (tab: "all" | "overdue" | "completed") => void;
  onExportAuditPacket?: (rollout: SopRolloutItem) => void;
  className?: string;
}

export function ActiveRolloutsTable({
  rollouts,
  availableGroups = [],
  recentEventsCount,
  selectedFilterTab = "all",
  onFilterTabChange,
  onExportAuditPacket,
  className,
}: ActiveRolloutsTableProps) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedGroup, setSelectedGroup] = React.useState("ALL");
  const [selectedState, setSelectedState] = React.useState("ALL");
  const [activeTab, setActiveTab] = React.useState<"all" | "overdue" | "completed">(selectedFilterTab);

  React.useEffect(() => {
    setActiveTab(selectedFilterTab);
  }, [selectedFilterTab]);

  const handleTabChange = (tab: "all" | "overdue" | "completed") => {
    setActiveTab(tab);
    onFilterTabChange?.(tab);
  };

  // Derive unique groups if none passed
  const allGroups = React.useMemo(() => {
    if (availableGroups.length > 0) return availableGroups;
    const groupsSet = new Set<string>();
    rollouts.forEach((r) => r.targetAudienceGroupNames.forEach((g) => groupsSet.add(g)));
    return Array.from(groupsSet);
  }, [availableGroups, rollouts]);

  // Filtered rollouts
  const filteredRollouts = React.useMemo(() => {
    return rollouts.filter((item) => {
      // Tab filter
      if (activeTab === "overdue" && item.overdueCount <= 0) return false;
      if (activeTab === "completed" && item.completionPercent < 100) return false;

      // Group filter
      if (selectedGroup !== "ALL") {
        if (!item.targetAudienceGroupNames.includes(selectedGroup)) return false;
      }

      // Lifecycle filter
      if (selectedState !== "ALL" && item.lifecycleState !== selectedState) {
        return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const codeMatch = item.documentCode.toLowerCase().includes(q);
        const titleMatch = item.title.toLowerCase().includes(q);
        const groupMatch = item.targetAudienceGroupNames.some((g) =>
          g.toLowerCase().includes(q)
        );
        if (!codeMatch && !titleMatch && !groupMatch) return false;
      }

      return true;
    });
  }, [rollouts, activeTab, selectedGroup, selectedState, searchQuery]);

  // Overdue item for escalation banner
  const criticalOverdueItem = React.useMemo(() => {
    return rollouts
      .filter((r) => r.overdueCount > 0 && r.completionPercent < 85)
      .sort((a, b) => b.overdueCount - a.overdueCount)[0];
  }, [rollouts]);

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* Table Header & Controls Bar */}
      <div className="bg-card p-4 rounded-lg border border-border shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="text-base font-semibold text-foreground">Active SOP Rollouts</h2>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            {rollouts.length} Active
          </span>
          <span className="hidden sm:inline-block w-1.5 h-1.5 rounded-full bg-border" />
          <span className="hidden sm:inline-block text-xs font-mono text-muted-foreground">
            Append-Only Hash Chained
          </span>
        </div>

        {/* Filter Controls Strip */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Live Search Filter */}
          <div className="relative min-w-[180px] sm:min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter title or code..."
              className="w-full pl-8 pr-3 py-1.5 bg-muted/50 border border-border rounded text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:bg-background focus:ring-1 focus:ring-primary transition-colors"
            />
          </div>

          {/* Group Filter */}
          <select
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            className="bg-muted/50 border border-border text-foreground text-xs rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
            title="Filter by target audience group"
          >
            <option value="ALL">All Target Groups</option>
            {allGroups.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </select>

          {/* Lifecycle Filter */}
          <select
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value)}
            className="bg-muted/50 border border-border text-foreground text-xs rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
            title="Filter by lifecycle state"
          >
            <option value="ALL">Lifecycle: All</option>
            <option value="PUBLISHED">PUBLISHED</option>
            <option value="APPROVED">APPROVED</option>
          </select>

          {/* Filter Tabs Button Pills */}
          <div className="inline-flex rounded-md border border-border p-0.5 bg-muted/40">
            <button
              type="button"
              onClick={() => handleTabChange("all")}
              className={cn(
                "px-2.5 py-1 text-xs font-medium rounded transition-colors",
                activeTab === "all"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => handleTabChange("overdue")}
              className={cn(
                "px-2.5 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1",
                activeTab === "overdue"
                  ? "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200 shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span>Overdue Only</span>
            </button>
            <button
              type="button"
              onClick={() => handleTabChange("completed")}
              className={cn(
                "px-2.5 py-1 text-xs font-medium rounded transition-colors",
                activeTab === "completed"
                  ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200 shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Completed
            </button>
          </div>
        </div>
      </div>

      {/* Compliance Table Container */}
      <div className="bg-card rounded-lg border border-border shadow-xs overflow-hidden min-w-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted/60 text-muted-foreground text-[11px] font-mono uppercase tracking-wider border-b border-border">
                <th className="py-3 px-2.5 2xl:px-4 font-semibold">Document Code</th>
                <th className="py-3 px-2.5 2xl:px-4 font-semibold">Document Title</th>
                <th className="hidden 2xl:table-cell py-3 px-3 font-semibold">Ver</th>
                <th className="hidden 2xl:table-cell py-3 px-3 font-semibold">Lifecycle State</th>
                <th className="hidden 2xl:table-cell py-3 px-4 font-semibold">Target Audience</th>
                <th className="py-3 px-2.5 2xl:px-4 min-w-[110px] 2xl:min-w-[150px] font-semibold">Read Completion</th>
                <th className="py-3 px-2.5 2xl:px-3 font-semibold">Status / Due</th>
                <th className="py-3 px-2.5 2xl:px-4 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-xs">
              {filteredRollouts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">
                    <p className="text-sm font-medium">No active SOP rollouts match the selected filters.</p>
                    <p className="text-xs mt-1">Try resetting the group or search term.</p>
                  </td>
                </tr>
              ) : (
                filteredRollouts.map((row) => {
                  const is100 = row.completionPercent >= 100;
                  const isLow = row.completionPercent < 85 && row.overdueCount > 0;

                  return (
                    <tr
                      key={row.versionId || row.documentId}
                      className={cn(
                        "hover:bg-muted/40 transition-colors group",
                        isLow && "bg-red-50/30 dark:bg-red-950/20"
                      )}
                    >
                      {/* Document Code */}
                      <td className="py-3 px-2.5 2xl:px-4 font-mono font-bold text-foreground whitespace-nowrap">
                        <Link
                          href={`/documents/${row.documentId}`}
                          className="px-2 py-1 rounded bg-muted hover:bg-muted/80 text-foreground transition-colors inline-block"
                        >
                          {row.documentCode}
                        </Link>
                      </td>

                      {/* Document Title */}
                      <td className="py-3 px-2.5 2xl:px-4 min-w-0 max-w-[200px] 2xl:max-w-[260px]">
                        <div className="flex flex-col min-w-0">
                          <Link
                            href={`/documents/${row.documentId}`}
                            className="font-medium text-foreground hover:text-primary transition-colors line-clamp-1"
                          >
                            {row.title}
                          </Link>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5 font-mono text-[10px] text-muted-foreground">
                            <span className="2xl:hidden font-semibold text-foreground/80">
                              {row.versionLabel}
                            </span>
                            {row.targetAudienceGroupNames[0] && (
                              <span className="2xl:hidden truncate max-w-[120px]">
                                • {row.targetAudienceGroupNames[0]}
                              </span>
                            )}
                            {row.documentSha256 && (
                              <span className="hidden sm:inline">
                                SHA: {row.documentSha256.slice(0, 6)}…{row.documentSha256.slice(-4)}
                              </span>
                            )}
                            {row.facilityLocation && (
                              <span className="hidden 2xl:inline">
                                • {row.facilityLocation}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Version Label */}
                      <td className="hidden 2xl:table-cell py-3 px-3 whitespace-nowrap font-mono text-muted-foreground font-semibold">
                        {row.versionLabel}
                      </td>

                      {/* Lifecycle State */}
                      <td className="hidden 2xl:table-cell py-3 px-3 whitespace-nowrap">
                        <LifecycleStatusBadge state={row.lifecycleState} size="sm" />
                      </td>

                      {/* Target Audience Groups */}
                      <td className="hidden 2xl:table-cell py-3 px-4">
                        <div className="flex flex-wrap gap-1">
                          {row.targetAudienceGroupNames.map((g) => (
                            <span
                              key={g}
                              className="px-2 py-0.5 rounded bg-muted text-foreground text-[11px] font-medium whitespace-nowrap border border-border/50"
                            >
                              {g}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Read Completion Progress */}
                      <td className="py-3 px-2.5 2xl:px-4">
                        <div className="space-y-1">
                          <div className="flex justify-between font-mono text-[11px] text-muted-foreground">
                            <span>
                              {row.acknowledgedCount}/{row.totalAssignedCount}
                            </span>
                            <span
                              className={cn(
                                "font-semibold",
                                is100 && "text-emerald-700 dark:text-emerald-400",
                                isLow && "text-destructive",
                                !is100 && !isLow && "text-foreground"
                              )}
                            >
                              {row.completionPercent.toFixed(0)}%
                            </span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                            <div
                              className={cn(
                                "h-1.5 rounded-full transition-all duration-500",
                                is100 && "bg-emerald-600",
                                isLow && "bg-destructive",
                                !is100 && !isLow && "bg-primary"
                              )}
                              style={{ width: `${Math.min(100, Math.max(0, row.completionPercent))}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Status / Overdue Badge */}
                      <td className="py-3 px-2.5 2xl:px-3 whitespace-nowrap">
                        {row.overdueCount > 0 ? (
                          <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-800 border border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800 inline-flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            <span>{row.overdueCount} overdue</span>
                          </span>
                        ) : is100 ? (
                          <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>Completed</span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground font-mono inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>{row.dueDate ? `Due ${new Date(row.dueDate).toLocaleDateString()}` : "On track"}</span>
                          </span>
                        )}
                      </td>

                      {/* Action CTAs */}
                      <td className="py-3 px-2.5 2xl:px-4 text-right whitespace-nowrap">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2.5 text-xs font-medium gap-1"
                          onClick={() => onExportAuditPacket?.(row)}
                        >
                          <FileDown className="h-3 w-3 text-muted-foreground" />
                          <span>Audit Packet</span>
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer / Summary Metadata */}
        <div className="px-4 py-3 bg-muted/30 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>
              Showing <strong className="text-foreground">{filteredRollouts.length}</strong> of{" "}
              {rollouts.length} live rollouts
            </span>
            <span>•</span>
            <span className="font-mono">
              {recentEventsCount !== undefined
                ? `Recent Audit Events: ${recentEventsCount}`
                : "SHA-256 Append-Only Ledger"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">VeriDoc Monitored Queue</span>
          </div>
        </div>
      </div>

      {/* Frontline Escalation Banner (Visual Enrichment if any SOP is critical) */}
      {criticalOverdueItem && (
        <div className="bg-card p-4 rounded-lg border border-red-200 dark:border-red-900 bg-red-50/40 dark:bg-red-950/30 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-100 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 flex items-center justify-center shrink-0 mt-0.5">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-red-900 dark:text-red-200">
                Escalation Threshold Triggered for {criticalOverdueItem.documentCode}
              </h3>
              <p className="text-xs text-red-800 dark:text-red-300 mt-0.5">
                {criticalOverdueItem.targetAudienceGroupNames.join(", ")} completion is at{" "}
                {criticalOverdueItem.completionPercent.toFixed(0)}% (&lt;85% required threshold).{" "}
                {criticalOverdueItem.overdueCount} personnel are overdue. Automatic shift-gate suspension will engage in 18 hours.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="bg-red-100 hover:bg-red-200 text-red-900 border-red-300 dark:bg-red-950/60 dark:hover:bg-red-900/60 dark:text-red-200 dark:border-red-800 text-xs gap-1"
              onClick={() => alert(`Broadcast notice dispatched to ${criticalOverdueItem.targetAudienceGroupNames.join(", ")} supervisors.`)}
            >
              <Megaphone className="h-3.5 w-3.5" />
              <span>Broadcast Shift Notice</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
