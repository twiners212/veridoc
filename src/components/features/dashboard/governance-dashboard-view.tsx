"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Download,
  PlusCircle,
  ShieldCheck,
  Check,
  FileText,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { KpiStrip, type GovernanceKpis } from "./kpi-strip";
import { ActiveRolloutsTable, type SopRolloutItem } from "./active-rollouts-table";
import { ActivityFeed, type GovernanceActivityEvent } from "./activity-feed";
import { Button } from "@/components/ui/button";
import { TopUtilityBar } from "@/components/layout/top-utility-bar";
import { cn } from "@/lib/utils";
import type { WorkspaceRole } from "@/types/roles";

export interface GovernanceDashboardViewProps {
  initialKpis?: GovernanceKpis;
  initialRollouts?: SopRolloutItem[];
  initialEvents?: GovernanceActivityEvent[];
  tenantName?: string;
  currentUserRole?: WorkspaceRole;
  currentUserId?: string;
  currentUserName?: string;
  userEmail?: string;
  className?: string;
}

// Default high-fidelity sample data matching Screen 4 (.stitch-ref/04-quality-governance-dashboard.html)
const DEFAULT_KPIS: GovernanceKpis = {
  publishedActiveSops: 48,
  publishedTrend: "+3",
  pendingApprovals: 5,
  pendingApprovalsBlockedCount: 1,
  readAcknowledgmentRate: 88.4,
  acknowledgedCount: 420,
  totalAssignedCount: 475,
  overdueAcknowledgments: 14,
  overdueGroupsCount: 3,
};

const DEFAULT_ROLLOUTS: SopRolloutItem[] = [
  {
    documentId: "doc-saf-004",
    versionId: "ver-saf-004-v20",
    documentCode: "SOP-SAF-004",
    title: "Chemical Spill Emergency Containment & Evacuation",
    versionLabel: "v2.0",
    lifecycleState: "PUBLISHED",
    targetAudienceGroupNames: ["Shift A Operations"],
    acknowledgedCount: 42,
    totalAssignedCount: 50,
    completionPercent: 84,
    overdueCount: 3,
    dueDate: new Date(Date.now() + 86400000 * 2).toISOString(),
    documentSha256: "e8f931a29b47e19038d4f09a27c15438e8f931a29b47e19038d4f09a27c15438",
    facilityLocation: "Clean-in-Place Facility B",
  },
  {
    documentId: "doc-prd-012",
    versionId: "ver-prd-012-v13",
    documentCode: "SOP-PRD-012",
    title: "Automated Assembly Line Calibration & Daily Zeroing",
    versionLabel: "v1.3",
    lifecycleState: "PUBLISHED",
    targetAudienceGroupNames: ["Maintenance Ops"],
    acknowledgedCount: 48,
    totalAssignedCount: 50,
    completionPercent: 96,
    overdueCount: 0,
    dueDate: new Date(Date.now() + 86400000 * 5).toISOString(),
    documentSha256: "c71b80de554a90812b48e3100948acfe10928374a819b12e8f931a29b47e1903",
    facilityLocation: "Line 4 Robotic Cells",
  },
  {
    documentId: "doc-bio-007",
    versionId: "ver-bio-007-v30",
    documentCode: "SOP-BIO-007",
    title: "Sterile Cleanroom Gowning & Material Pass-Through",
    versionLabel: "v3.0",
    lifecycleState: "PUBLISHED",
    targetAudienceGroupNames: ["Cleanroom Techs"],
    acknowledgedCount: 36,
    totalAssignedCount: 50,
    completionPercent: 72,
    overdueCount: 7,
    dueDate: new Date(Date.now() - 86400000).toISOString(),
    documentSha256: "4b92c10928374a819b12e8f931a29b47e19038d4f09a27c15438e8f931a29b47",
    facilityLocation: "Bay 3 Clean Zone",
  },
  {
    documentId: "doc-log-002",
    versionId: "ver-log-002-v10",
    documentCode: "SOP-LOG-002",
    title: "Forklift Battery Charging & Daily Pre-Operational Inspection",
    versionLabel: "v1.0",
    lifecycleState: "PUBLISHED",
    targetAudienceGroupNames: ["Warehouse Team"],
    acknowledgedCount: 46,
    totalAssignedCount: 50,
    completionPercent: 92,
    overdueCount: 4,
    dueDate: new Date(Date.now() + 86400000 * 4).toISOString(),
    documentSha256: "12f455a9b284e3110948acfe10928374a819b12e8f931a29b47e19038d4f09a2",
    facilityLocation: "North Logistics Annex",
  },
  {
    documentId: "doc-qms-009",
    versionId: "ver-qms-009-v21",
    documentCode: "SOP-QMS-009",
    title: "Raw Material Inbound Inspection & Quota Sampling",
    versionLabel: "v2.1",
    lifecycleState: "PUBLISHED",
    targetAudienceGroupNames: ["Quality Assurance"],
    acknowledgedCount: 30,
    totalAssignedCount: 30,
    completionPercent: 100,
    overdueCount: 0,
    dueDate: new Date(Date.now() + 86400000 * 10).toISOString(),
    documentSha256: "8e923145a819b12e8f931a29b47e19038d4f09a27c15438e8f931a29b47e1903",
    facilityLocation: "Lab 1",
  },
];

const DEFAULT_EVENTS: GovernanceActivityEvent[] = [
  {
    id: "evt-1",
    eventType: "APPROVAL_GRANTED",
    actorName: "Marcus Vance",
    actorRole: "Operations Director",
    documentCode: "SOP-PRD-014",
    versionLabel: "v1.0",
    timestamp: "14 mins ago",
    documentSha256: "9f8a3c42e8810ab12f718293847291a9b284e3110948acfe10928374a819b12",
  },
  {
    id: "evt-2",
    eventType: "PUBLISHED",
    actorName: "Elena Rostova",
    actorRole: "Quality Manager",
    documentCode: "SOP-SAF-004",
    versionLabel: "v2.0",
    description: "Assigned to Shift A Operations (50 readers cohort)",
    timestamp: "1 hour ago",
  },
  {
    id: "evt-3",
    eventType: "APPROVAL_INVALIDATED_BY_EDIT",
    actorName: "David Kim",
    actorRole: "Author",
    documentCode: "SOP-PRD-018",
    versionLabel: "v0.2",
    description: "Author edited procedure payload during stage-2 signoff. Draft Reset.",
    timestamp: "3 hours ago",
  },
  {
    id: "evt-4",
    eventType: "ADMIN_APPROVER_OVERRIDE",
    actorName: "Sarah Jenkins",
    actorRole: "Workspace Admin",
    documentCode: "SOP-ENV-003",
    versionLabel: "v1.0",
    description: "Assigned approver on extended medical leave (BR-APP-04). Re-routed to delegate.",
    timestamp: "Yesterday",
  },
];

export function GovernanceDashboardView({
  initialKpis,
  initialRollouts,
  initialEvents,
  tenantName = "VeriDoc Workspace",
  currentUserRole = "QUALITY_MANAGER",
  currentUserId,
  currentUserName,
  userEmail,
  className,
}: GovernanceDashboardViewProps) {
  const router = useRouter();
  const [kpis] = React.useState<GovernanceKpis>(initialKpis || DEFAULT_KPIS);
  const [rollouts] = React.useState<SopRolloutItem[]>(
    initialRollouts !== undefined ? initialRollouts : DEFAULT_ROLLOUTS
  );
  const [events] = React.useState<GovernanceActivityEvent[]>(
    initialEvents !== undefined ? initialEvents : DEFAULT_EVENTS
  );

  const [filterTab, setFilterTab] = React.useState<"all" | "overdue" | "completed">("all");

  // Floating Toast notification state
  const [toast, setToast] = React.useState<{ title: string; detail: string } | null>(null);

  const triggerToast = (title: string, detail: string) => {
    setToast({ title, detail });
    setTimeout(() => setToast(null), 4000);
  };

  const handleExportAuditSummary = (format: "json" | "pdf" = "json") => {
    const url = `/api/audit/export?format=${format}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-summary-${tenantName.toLowerCase().replace(/\s+/g, "-")}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    triggerToast(
      "Full Audit Summary Exported",
      `Downloading audit-packet in ${format.toUpperCase()} format`
    );
  };

  const handleExportPacket = (rollout: SopRolloutItem, format: "json" | "pdf" = "json") => {
    const params = new URLSearchParams({
      documentId: rollout.documentId,
      versionId: rollout.versionId,
      format,
    });
    const url = `/api/audit/export?${params.toString()}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-packet-${rollout.documentCode}-${rollout.versionLabel}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    triggerToast(
      `Audit Packet Exported: ${rollout.documentCode}`,
      `Downloading ${rollout.documentCode} (${rollout.versionLabel}) in ${format.toUpperCase()}`
    );
  };

  return (
    <div className={cn("flex flex-col min-h-screen", className)}>
      {/* Top Utility Bar */}
      <TopUtilityBar
        breadcrumbs={[
          { label: tenantName, href: "/dashboard" },
          { label: "Quality Governance" },
          { label: "Overview" },
        ]}
        userName={currentUserName}
        userEmail={userEmail}
        role={currentUserRole}
      />

      {/* Floating Toast Notification */}
      {toast && (
        <div className="fixed top-16 right-8 z-50 bg-card text-foreground border border-border px-4 py-3 rounded-lg shadow-xl flex items-center gap-3 transition-all animate-in fade-in slide-in-from-top-4">
          <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 flex items-center justify-center shrink-0">
            <Check className="h-3.5 w-3.5" />
          </div>
          <div>
            <p className="text-xs font-semibold">{toast.title}</p>
            <p className="text-[11px] text-muted-foreground font-mono">{toast.detail}</p>
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
        {/* Header Section */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-mono uppercase tracking-wider text-primary dark:text-blue-300 font-bold bg-primary/10 dark:bg-blue-500/15 px-2 py-0.5 rounded border border-primary/20 dark:border-blue-500/30">
                {tenantName} • Governance Workspace
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Database Sync
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Quality Governance Dashboard
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-3xl">
              Real-time compliance tracking, sequential workflow status, and frontline read acknowledgment progress across active facilities.
            </p>
          </div>

          {/* Header Action Buttons */}
          <div className="flex items-center gap-3 self-start lg:self-center shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleExportAuditSummary("json")}
              className="gap-2 shadow-xs"
            >
              <Download className="h-4 w-4 text-muted-foreground" />
              <span>Export Full Audit Summary</span>
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => router.push("/documents")}
              className="gap-2"
            >
              <PlusCircle className="h-4 w-4" />
              <span>+ Draft New SOP</span>
            </Button>
          </div>
        </div>

        {/* 1. 4-Card KPI Strip */}
        <KpiStrip
          kpis={kpis}
          onFilterOverdue={() => setFilterTab("overdue")}
        />

        {/* 2. Main Content Grid (8-Col / 4-Col Layout) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column (8 cols): Active SOP Rollouts Table */}
          <div className="lg:col-span-8 min-w-0">
            <ActiveRolloutsTable
              rollouts={rollouts}
              recentEventsCount={events.length}
              selectedFilterTab={filterTab}
              onFilterTabChange={(tab) => setFilterTab(tab)}
              onExportAuditPacket={handleExportPacket}
            />
          </div>

          {/* Right Column (4 cols): Recent Governance Activity Feed & Integrity Status */}
          <div className="lg:col-span-4 min-w-0">
            <ActivityFeed
              events={events}
              latestSequenceNumber={events.length}
              merkleRoot={events[0]?.documentSha256 || "genesis"}
              blockedApprovalCount={kpis.pendingApprovalsBlockedCount}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
