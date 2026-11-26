"use client";

import * as React from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  BookOpen,
  Folder,
  Check,
  Copy,
  ArrowRight,
  ShieldCheck,
  Building2,
  Flame,
  Search,
  Filter,
  CheckCircle,
  Sparkles,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Sha256DigestChip } from "@/components/features/documents/sha256-digest-chip";
import type { ReadAssignmentItem } from "./reader.types";

export interface ToReadQueueProps {
  initialAssignments?: ReadAssignmentItem[];
  initialTab?: "pending" | "completed";
  currentUser?: {
    id: string;
    name: string;
    role: string;
    department?: string;
    site?: string;
  };
}

// Default realistic sample data matching .stitch-ref/03-to-read-queue.html
const DEFAULT_ASSIGNMENTS: ReadAssignmentItem[] = [
  {
    id: "assign-saf-004",
    documentId: "doc-saf-004",
    documentVersionId: "ver-saf-004-v20",
    documentCode: "SOP-SAF-004",
    title: "Chemical Handling & Emergency Spill Response",
    version: "v2.0",
    category: "Safety",
    targetGroupName: "Apex Chemicals Unit",
    contentFormat: "MARKDOWN",
    documentSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    dueAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    isOverdue: false,
    daysUntilDue: 2,
    status: "PENDING",
    estimatedMinutes: 3,
    wordCount: 485,
    effectiveDate: "Oct 24, 2024",
  },
  {
    id: "assign-ops-012",
    documentId: "doc-ops-012",
    documentVersionId: "ver-ops-012-v11",
    documentCode: "SOP-OPS-012",
    title: "Shift A Automated Line Startup Checklist",
    version: "v1.1",
    category: "Operations",
    targetGroupName: "Conveyor Systems 4 & 5",
    contentFormat: "MARKDOWN",
    documentSha256: "9f8a3c10a30b65f7c32b56e6d1e9f02931a298cbfa1924198cfa1034ab12b012",
    dueAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
    isOverdue: false,
    daysUntilDue: 6,
    status: "PENDING",
    estimatedMinutes: 5,
    wordCount: 720,
    effectiveDate: "Oct 22, 2024",
  },
  {
    id: "assign-log-002",
    documentId: "doc-log-002",
    documentVersionId: "ver-log-002-v10",
    documentCode: "SOP-LOG-002",
    title: "Cold Storage Staging and Pallet Temperature Verification",
    version: "v1.0",
    category: "Logistics",
    targetGroupName: "Cold Storage Staging",
    contentFormat: "MARKDOWN",
    documentSha256: "3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855a",
    dueAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    isOverdue: false,
    daysUntilDue: -2,
    status: "COMPLETED",
    estimatedMinutes: 4,
    wordCount: 560,
    effectiveDate: "Oct 18, 2024",
    acknowledgedAt: "2024-10-22 14:15 UTC",
    acknowledgmentId: "ACK-9841",
  },
];

export function ToReadQueue({
  initialAssignments = DEFAULT_ASSIGNMENTS,
  initialTab = "pending",
  currentUser = {
    id: "usr-david-miller",
    name: "David Miller",
    role: "Frontline Reader",
    department: "Shift A Operations",
    site: "CIP Facility B",
  },
}: ToReadQueueProps) {
  const [assignments, setAssignments] = React.useState<ReadAssignmentItem[]>(initialAssignments);
  const [activeTab, setActiveTab] = React.useState<"pending" | "completed">(initialTab);
  const [selectedFilter, setSelectedFilter] = React.useState<"ALL" | "URGENT" | string>("ALL");
  const [searchQuery, setSearchQuery] = React.useState("");

  React.useEffect(() => {
    setAssignments(initialAssignments);
  }, [initialAssignments]);

  React.useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Separate pending vs completed
  const pendingItems = React.useMemo(
    () => assignments.filter((a) => a.status === "PENDING"),
    [assignments]
  );

  const completedItems = React.useMemo(
    () => assignments.filter((a) => a.status === "COMPLETED"),
    [assignments]
  );

  // Compliance percentage calculation
  const totalAssignmentsCount = assignments.length;
  const compliancePercent =
    totalAssignmentsCount > 0
      ? Math.round((completedItems.length / totalAssignmentsCount) * 100)
      : 100;

  // Filtered pending items
  const filteredPending = React.useMemo(() => {
    let list = pendingItems;

    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (i) =>
          i.documentCode.toLowerCase().includes(q) ||
          i.title.toLowerCase().includes(q) ||
          (i.category && i.category.toLowerCase().includes(q))
      );
    }

    if (selectedFilter === "URGENT") {
      list = list.filter((i) => i.daysUntilDue <= 3 || i.isOverdue);
    } else if (selectedFilter !== "ALL") {
      list = list.filter((i) => i.category === selectedFilter);
    }

    return list;
  }, [pendingItems, searchQuery, selectedFilter]);

  // Unique categories for filters
  const categories = React.useMemo(() => {
    const set = new Set<string>();
    pendingItems.forEach((i) => {
      if (i.category) set.add(i.category);
    });
    return Array.from(set);
  }, [pendingItems]);

  const urgentCount = pendingItems.filter((i) => i.daysUntilDue <= 3 || i.isOverdue).length;

  return (
    <div className="flex-1 flex flex-col w-full max-w-2xl mx-auto px-4 py-4 space-y-4">
      {/* Shift Compliance Status Banner (Matching Screen 3) */}
      <section className="relative overflow-hidden rounded-2xl bg-card border border-border p-5 shadow-sm">
        <div className="absolute -right-4 -top-6 w-28 h-28 rounded-full bg-primary/5 pointer-events-none" />

        <div className="flex flex-col gap-2 relative z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center justify-center w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-xs text-muted-foreground font-medium">
                {currentUser.department} · {currentUser.site}
              </span>
            </div>

            {pendingItems.length > 0 ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 text-xs font-semibold border border-amber-200 dark:border-amber-800">
                <Clock className="h-3 w-3" />
                Action Required
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-xs font-semibold border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="h-3 w-3" />
                Compliant
              </span>
            )}
          </div>

          <h1 className="text-xl sm:text-2xl font-bold text-foreground">
            Hello {currentUser.name}
          </h1>

          <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            {pendingItems.length > 0 ? (
              <span>
                {pendingItems.length} {pendingItems.length === 1 ? "SOP requires" : "SOPs require"} your acknowledgment
              </span>
            ) : (
              <span>All assigned procedures are acknowledged</span>
            )}
          </p>

          <p className="text-xs text-muted-foreground leading-relaxed">
            Review assigned Standard Operating Procedures and acknowledge understanding to maintain shift compliance.
          </p>
        </div>

        {/* Compliance Target Progress Bar */}
        <div className="mt-4 pt-3.5 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span className="font-medium text-foreground">Shift Compliance Target</span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="w-20 sm:w-28 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${compliancePercent}%` }}
              />
            </div>
            <span className="font-mono text-xs font-bold text-primary">
              {compliancePercent}%
            </span>
          </div>
        </div>
      </section>

      {/* Main Tabs: Pending Reads vs. Acknowledged History */}
      <div className="flex items-center border-b border-border">
        <button
          type="button"
          onClick={() => setActiveTab("pending")}
          className={cn(
            "min-h-[44px] flex-1 pb-3 pt-2 text-center text-xs font-semibold border-b-2 transition-colors relative flex items-center justify-center gap-2 touch-manipulation",
            activeTab === "pending"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <BookOpen className="h-4 w-4" />
          <span>Pending Reads</span>
          {pendingItems.length > 0 && (
            <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-primary text-primary-foreground min-w-[18px]">
              {pendingItems.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("completed")}
          className={cn(
            "min-h-[44px] flex-1 pb-3 pt-2 text-center text-xs font-semibold border-b-2 transition-colors relative flex items-center justify-center gap-2 touch-manipulation",
            activeTab === "completed"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <CheckCircle className="h-4 w-4" />
          <span>Acknowledged History</span>
          {completedItems.length > 0 && (
            <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-muted text-foreground min-w-[18px]">
              {completedItems.length}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: PENDING READS */}
      {activeTab === "pending" && (
        <div className="space-y-3.5">
          {/* Sub-Filter Chips */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5 -mx-1 px-1">
            <button
              type="button"
              onClick={() => setSelectedFilter("ALL")}
              className={cn(
                "min-h-[44px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-all touch-manipulation active:scale-95",
                selectedFilter === "ALL"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              <span>All Assigned</span>
              <span className="inline-flex items-center justify-center px-1.5 py-0.2 rounded-full bg-white/20 text-inherit text-[10px]">
                {pendingItems.length}
              </span>
            </button>

            {urgentCount > 0 && (
              <button
                type="button"
                onClick={() => setSelectedFilter("URGENT")}
                className={cn(
                  "min-h-[44px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-all touch-manipulation active:scale-95",
                  selectedFilter === "URGENT"
                    ? "bg-amber-600 text-white shadow-xs"
                    : "bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                )}
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>Urgent (&lt; 3 days)</span>
                <span className="inline-flex items-center justify-center px-1.5 rounded-full bg-amber-200/60 dark:bg-amber-900/60 text-[10px] font-bold">
                  {urgentCount}
                </span>
              </button>
            )}

            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedFilter(cat)}
                className={cn(
                  "min-h-[44px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition-all touch-manipulation active:scale-95",
                  selectedFilter === cat
                    ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                <span>{cat}</span>
              </button>
            ))}
          </div>

          {/* Pending Cards List */}
          {filteredPending.length === 0 ? (
            /* Clean Empty State */
            <div className="rounded-2xl bg-card border border-border p-8 text-center space-y-4 shadow-sm my-4">
              <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mx-auto">
                <CheckCircle2 className="h-9 w-9" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-foreground">
                  All Caught Up!
                </h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
                  Zero pending SOPs. You have successfully acknowledged all required procedures for your assigned shift and unit.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("completed")}
                className="min-h-[44px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground transition-colors touch-manipulation"
              >
                <span>View Acknowledged History</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="space-y-3.5">
              {filteredPending.map((item) => {
                const isOverdue = item.isOverdue || item.daysUntilDue < 0;
                const isUrgent = item.daysUntilDue <= 3 && !isOverdue;

                return (
                  <div
                    key={item.id}
                    className="group relative rounded-2xl bg-card border border-border p-4 sm:p-5 shadow-xs hover:shadow-md transition-all active:scale-[0.99]"
                  >
                    {/* Header Row: SOP Code · Version + Due Badge */}
                    <div className="flex items-start justify-between gap-2 mb-2.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-semibold text-foreground bg-muted px-2 py-0.5 rounded">
                          {item.documentCode} · {item.version}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold border border-emerald-200 dark:border-emerald-800">
                          <ShieldCheck className="h-3 w-3" />
                          Published
                        </span>
                      </div>

                      {/* Due / Overdue Badge */}
                      {isOverdue ? (
                        <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-destructive/10 text-destructive text-[11px] font-bold border border-destructive/20 shrink-0">
                          <AlertTriangle className="h-3 w-3" />
                          <span>Overdue</span>
                        </div>
                      ) : isUrgent ? (
                        <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 text-[11px] font-semibold border border-amber-200 dark:border-amber-800 shrink-0">
                          <Clock className="h-3 w-3" />
                          <span>Due in {item.daysUntilDue} {item.daysUntilDue === 1 ? "day" : "days"}</span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-muted text-muted-foreground text-[11px] font-medium shrink-0">
                          <Clock className="h-3 w-3" />
                          <span>Due in {item.daysUntilDue} days</span>
                        </div>
                      )}
                    </div>

                    {/* Title */}
                    <h2 className="text-base sm:text-lg font-bold text-foreground mb-2 group-hover:text-primary transition-colors leading-snug">
                      <Link
                        href={`/read/${item.documentId}?versionId=${item.documentVersionId}&assignmentId=${item.id}`}
                        className="hover:underline focus-visible:outline-none"
                      >
                        {item.title}
                      </Link>
                    </h2>

                    {/* SHA Digest Chip & Facility Tag */}
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <Sha256DigestChip digest={item.documentSha256} />
                      {item.targetGroupName && (
                        <span className="text-xs text-muted-foreground font-mono bg-muted/60 px-2 py-0.5 rounded">
                          {item.targetGroupName}
                        </span>
                      )}
                    </div>

                    {/* Footer Row: Reading stats + Primary CTA */}
                    <div className="pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5" />
                        <span>~{item.estimatedMinutes || 3} min read ({item.wordCount || 500} words)</span>
                      </div>

                      <Link
                        href={`/read/${item.documentId}?versionId=${item.documentVersionId}&assignmentId=${item.id}`}
                        className="min-h-[44px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold text-xs text-primary bg-primary/10 hover:bg-primary hover:text-primary-foreground transition-all group-hover:translate-x-0.5 touch-manipulation"
                      >
                        <span>Tap to Read & Sign</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Recently Acknowledged Summary Card (Footer of Pending Tab) */}
          {completedItems.length > 0 && (
            <div className="rounded-2xl bg-muted/40 border border-border p-4 flex flex-col gap-2 mt-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0 mt-0.5">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold text-foreground">
                      Recently Acknowledged
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {completedItems[0].acknowledgedAt || "Verified"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    <span className="font-mono text-foreground font-medium">
                      {completedItems[0].documentCode} {completedItems[0].version}
                    </span>{" "}
                    · {completedItems[0].title}
                  </p>
                  <div className="mt-1 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                    <span>Receipt: <strong className="text-foreground">#{completedItems[0].acknowledgmentId || "Recorded"}</strong></span>
                    <span>•</span>
                    <span className="text-emerald-600 font-medium">Logged & Bound</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveTab("completed")}
                className="min-h-[44px] flex items-center justify-center gap-1.5 text-xs text-primary font-semibold hover:underline pt-2 border-t border-border/60 touch-manipulation"
              >
                <span>View all {completedItems.length} completed receipts in History tab</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ACKNOWLEDGED HISTORY */}
      {activeTab === "completed" && (
        <div className="space-y-3.5">
          {completedItems.length === 0 ? (
            <div className="rounded-2xl bg-card border border-border p-8 text-center space-y-3 text-muted-foreground my-4">
              <BookOpen className="h-10 w-10 mx-auto text-muted-foreground/60" />
              <p className="text-xs">No acknowledged procedures on record yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {completedItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl bg-card border border-border p-4 sm:p-5 shadow-xs space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-semibold text-foreground bg-muted px-2 py-0.5 rounded">
                        {item.documentCode} · {item.version}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold border border-emerald-200 dark:border-emerald-800">
                        <CheckCircle2 className="h-3 w-3" />
                        Signed
                      </span>
                    </div>

                    <span className="font-mono text-[11px] text-muted-foreground shrink-0">
                      Receipt: <strong className="text-foreground">{item.acknowledgmentId || "Recorded"}</strong>
                    </span>
                  </div>

                  <h3 className="text-sm sm:text-base font-bold text-foreground">
                    {item.title}
                  </h3>

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Sha256DigestChip digest={item.documentSha256} />
                    <span className="text-[11px] text-muted-foreground font-mono">
                      Signed: {item.acknowledgedAt || "Verified UTC"}
                    </span>
                  </div>

                  <div className="pt-2.5 border-t border-border flex items-center justify-between">
                    <span className="text-[11px] text-emerald-600 font-mono font-medium">
                      Immutable Audit Seal Bound
                    </span>
                    <Link
                      href={`/read/${item.documentId}?versionId=${item.documentVersionId}&readOnly=true`}
                      className="min-h-[44px] inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium text-foreground bg-muted hover:bg-muted/80 transition-colors touch-manipulation"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      <span>Review SOP</span>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
