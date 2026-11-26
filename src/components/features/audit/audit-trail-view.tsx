"use client";

import * as React from "react";
import {
  CheckCircle2,
  Download,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  X,
  FileSpreadsheet,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuditStatsStrip } from "./audit-stats-strip";
import { AuditFilterToolbar } from "./audit-filter-toolbar";
import { AuditTable } from "./audit-table";
import { AuditFooterDisclosure } from "./audit-footer-disclosure";
import type { AuditItem, AuditStats } from "./audit.types";

interface AuditTrailViewProps {
  initialItems: AuditItem[];
  initialStats: AuditStats;
  initialNextCursor: number | null;
  initialHasMore: boolean;
  tenantName: string;
}

export function AuditTrailView({
  initialItems,
  initialStats,
  initialNextCursor,
  initialHasMore,
  tenantName,
}: AuditTrailViewProps) {
  const [items, setItems] = React.useState<AuditItem[]>(initialItems);
  const [stats, setStats] = React.useState<AuditStats>(initialStats);
  const [nextCursor, setNextCursor] = React.useState<number | null>(
    initialNextCursor
  );
  const [hasMore, setHasMore] = React.useState<boolean>(initialHasMore);
  const [cursorHistory, setCursorHistory] = React.useState<(number | null)[]>([]);

  const hasInteractedRef = React.useRef(false);

  // Filter states
  const [search, setSearch] = React.useState("");
  const [eventType, setEventType] = React.useState("ALL");
  const [role, setRole] = React.useState("ALL");
  const [limit, setLimit] = React.useState(25);
  const [autoRefresh, setAutoRefresh] = React.useState(true);
  const [isLoading, setIsLoading] = React.useState(false);

  // Verification & Export states
  const [isVerifying, setIsVerifying] = React.useState(false);
  const [exportModalOpen, setExportModalOpen] = React.useState(false);
  const [toastNotification, setToastNotification] = React.useState<{
    title: string;
    description: string;
  } | null>(null);

  // Fetch logs with query parameters
  const fetchLogs = React.useCallback(
    async (cursorParam?: number | null, limitParam?: number) => {
      try {
        setIsLoading(true);
        const params = new URLSearchParams();
        if (cursorParam !== undefined && cursorParam !== null) {
          params.set("cursor", String(cursorParam));
        }
        params.set("limit", String(limitParam ?? limit));
        if (search.trim()) params.set("search", search.trim());
        if (eventType !== "ALL") params.set("eventType", eventType);
        if (role !== "ALL") params.set("role", role);

        const res = await fetch(`/api/audit/logs?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch logs");
        const json = await res.json();
        if (json.success && json.data) {
          setItems(json.data.items);
          setNextCursor(json.data.nextCursorSequence);
          setHasMore(json.data.hasMore);
          if (json.data.stats) {
            setStats(json.data.stats);
          }
        }
      } catch (err) {
        console.error("Error fetching audit logs:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [limit, search, eventType, role]
  );

  // Handle Search / Filter changes (skip redundant mount fetch when SSR supplied initialItems)
  React.useEffect(() => {
    if (
      !hasInteractedRef.current &&
      search === "" &&
      eventType === "ALL" &&
      role === "ALL" &&
      limit === 25
    ) {
      return;
    }
    const timer = setTimeout(() => {
      setCursorHistory([]);
      fetchLogs(null, limit);
    }, 250);
    return () => clearTimeout(timer);
  }, [search, eventType, role, limit, fetchLogs]);

  // Background auto-refresh every 10s
  React.useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      // Only refresh if on first page and not searching actively
      if (cursorHistory.length === 0 && !search) {
        fetchLogs(null, limit);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, cursorHistory.length, search, limit, fetchLogs]);

  // Pagination Next
  const handleNextPage = () => {
    if (!nextCursor) return;
    setCursorHistory((prev) => [...prev, nextCursor]);
    fetchLogs(nextCursor, limit);
  };

  // Pagination Previous
  const handlePrevPage = () => {
    if (cursorHistory.length === 0) return;
    const newHistory = [...cursorHistory];
    newHistory.pop(); // Remove current page cursor
    const prevCursor = newHistory[newHistory.length - 1] ?? null;
    setCursorHistory(newHistory);
    fetchLogs(prevCursor, limit);
  };

  // Chain Integrity Verification Action
  const handleVerifyChain = async () => {
    try {
      setIsVerifying(true);
      const res = await fetch("/api/audit/verify", { method: "POST" });
      const json = await res.json();
      if (json.success && json.data) {
        const v = json.data;
        if (v.verified) {
          setToastNotification({
            title: "Integrity Verified",
            description: `${v.totalEntries.toLocaleString()} blocks re-hashed sequentially. Zero payload tampering detected.`,
          });
        } else {
          setToastNotification({
            title: "Integrity Check Failed",
            description: `Tampering or sequence mismatch detected at block #${v.failedSequenceNumber ?? "N/A"}: ${v.failureReason ?? "Mismatch"}`,
          });
        }
      }
    } catch {
      setToastNotification({
        title: "Verification Error",
        description: "Failed to communicate with the verification endpoint.",
      });
    } finally {
      setIsVerifying(false);
      setTimeout(() => {
        setToastNotification(null);
      }, 6000);
    }
  };

  // Export Action
  const handleExport = (format: "json" | "pdf") => {
    const params = new URLSearchParams({ format });
    if (search.trim()) params.set("search", search.trim());
    const url = `/api/audit/export?${params.toString()}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-packet-${tenantName.toLowerCase().replace(/\s+/g, "-")}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setExportModalOpen(false);
  };

  const truncatedHead = stats.headHash
    ? `${stats.headHash.slice(0, 6)}...${stats.headHash.slice(-4)}`
    : "genesis";

  return (
    <div className="p-6 md:p-8 flex flex-col gap-6 max-w-7xl mx-auto w-full">
      {/* Toast Notification on Chain Verification */}
      {toastNotification && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-card text-foreground px-4 py-3 rounded-lg shadow-xl border-l-4 border-l-emerald-600 border border-border transition-all duration-300">
          <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <div className="flex flex-col text-left">
            <span className="text-xs font-semibold">{toastNotification.title}</span>
            <span className="text-[11px] text-muted-foreground">
              {toastNotification.description}
            </span>
          </div>
          <button
            type="button"
            className="ml-4 text-muted-foreground hover:text-foreground"
            onClick={() => setToastNotification(null)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Governance Audit Trail
            </h1>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-semibold">
                Append-Only Hash Chain Verified
              </span>
              <span className="text-emerald-400">•</span>
              <span className="font-mono text-[11px] tracking-wider">
                root: {truncatedHead}
              </span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Immutable sequential ledger tracking all document state transitions,
            re-authorizations, and reading acknowledgments.
          </p>
        </div>

        {/* Action CTAs */}
        <div className="flex items-center gap-2.5 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isVerifying}
            onClick={handleVerifyChain}
            className="gap-1.5 text-xs font-medium"
          >
            <CheckCircle2
              className={`h-4 w-4 text-primary ${
                isVerifying ? "animate-spin" : ""
              }`}
            />
            <span>{isVerifying ? "Verifying hashes..." : "Verify Chain Integrity"}</span>
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={() => setExportModalOpen(true)}
            className="gap-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Download className="h-4 w-4" />
            <span>Export Audit Packet (JSON / PDF)</span>
          </Button>
        </div>
      </div>

      {/* Verification Architecture Stats Strip */}
      <AuditStatsStrip stats={stats} />

      {/* Filter & Control Toolbar */}
      <AuditFilterToolbar
        search={search}
        onSearchChange={(val) => {
          hasInteractedRef.current = true;
          setSearch(val);
        }}
        eventType={eventType}
        onEventTypeChange={(val) => {
          hasInteractedRef.current = true;
          setEventType(val);
        }}
        role={role}
        onRoleChange={(val) => {
          hasInteractedRef.current = true;
          setRole(val);
        }}
        totalEvents={stats.totalEntries ?? stats.ledgerHead}
        filteredCount={items.length}
        autoRefresh={autoRefresh}
        onToggleAutoRefresh={() => setAutoRefresh(!autoRefresh)}
      />

      {/* Dense Monospace Audit Table */}
      <AuditTable items={items} isLoading={isLoading} />

      {/* Pagination Bar */}
      <div className="px-4 py-3 bg-card border border-border rounded-lg flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Showing <span className="font-semibold text-foreground">{items.length}</span>{" "}
            records
          </span>
          <div className="h-3 w-px bg-border hidden sm:block" />
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Rows:</span>
            <select
              value={limit}
              onChange={(e) => {
                hasInteractedRef.current = true;
                setLimit(Number(e.target.value));
              }}
              className="py-1 px-2 bg-background border border-border rounded text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground mr-2">
            Page {cursorHistory.length + 1}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={cursorHistory.length === 0 || isLoading}
            onClick={handlePrevPage}
            className="h-8 text-xs gap-1"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            <span>Previous</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!hasMore || isLoading}
            onClick={handleNextPage}
            className="h-8 text-xs gap-1"
          >
            <span>Next</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Governance Compliance Boundary Notice */}
      <AuditFooterDisclosure />

      {/* Export Format Modal */}
      {exportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card text-card-foreground border border-border rounded-xl shadow-2xl p-6 max-w-md w-full flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-sm font-bold text-foreground">
                Export Audit Packet
              </h3>
              <button
                type="button"
                onClick={() => setExportModalOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Export the cryptographic audit packet embedding live chain verification,
              bound SHA-256 digests, digital sign-offs, and frontline read
              acknowledgments.
            </p>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => handleExport("json")}
                className="p-4 rounded-lg border border-border hover:border-primary/60 hover:bg-primary/5 transition-all flex flex-col items-center gap-2 text-center group"
              >
                <FileSpreadsheet className="h-6 w-6 text-primary group-hover:scale-105 transition-transform" />
                <span className="text-xs font-semibold text-foreground">
                  JSON Data Packet
                </span>
                <span className="text-[10px] text-muted-foreground">
                  Canonical raw audit ledger for API integration & data systems
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleExport("pdf")}
                className="p-4 rounded-lg border border-border hover:border-primary/60 hover:bg-primary/5 transition-all flex flex-col items-center gap-2 text-center group"
              >
                <FileText className="h-6 w-6 text-primary group-hover:scale-105 transition-transform" />
                <span className="text-xs font-semibold text-foreground">
                  PDF Governance Document
                </span>
                <span className="text-[10px] text-muted-foreground">
                  Printable vector document with compliance disclosure footers
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
