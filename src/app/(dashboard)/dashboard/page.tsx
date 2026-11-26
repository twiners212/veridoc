import * as React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import {
  GovernanceDashboardView,
  type GovernanceKpis,
  type SopRolloutItem,
  type GovernanceActivityEvent,
} from "@/components/features/dashboard";
import { getDefaultLandingRouteForRole } from "@/lib/auth/demo-accounts";
import { loadDashboardPageContextAndDataAction } from "@/server/actions/dashboard-loaders.actions";

const EMPTY_KPIS: GovernanceKpis = {
  publishedActiveSops: 0,
  pendingApprovals: 0,
  pendingApprovalsBlockedCount: 0,
  readAcknowledgmentRate: 0,
  acknowledgedCount: 0,
  totalAssignedCount: 0,
  overdueAcknowledgments: 0,
  overdueGroupsCount: 0,
};

export default async function DashboardPage() {
  const bundle = await loadDashboardPageContextAndDataAction();

  if (bundle.status === "UNAUTHENTICATED") {
    redirect("/auth/sign-in");
  }

  if (bundle.status === "REDIRECT_TO_READ") {
    redirect("/to-read");
  }

  if (bundle.status === "FORBIDDEN") {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          Access Restricted (403 Forbidden)
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          The Quality Governance Completion Dashboard is restricted to WORKSPACE_ADMIN and QUALITY_MANAGER roles.
        </p>
        <Link
          href={getDefaultLandingRouteForRole(bundle.role)}
          className="inline-flex min-h-[44px] items-center justify-center rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-blue-800"
        >
          Go to My Workspace
        </Link>
      </div>
    );
  }

  const { authContext: ctx, dashboardData } = bundle;

  let liveKpis: GovernanceKpis = EMPTY_KPIS;
  if (dashboardData.kpis) {
    const k = dashboardData.kpis;
    liveKpis = {
      publishedActiveSops: k.publishedActiveSops ?? k.activeSops ?? 0,
      publishedTrend: k.publishedTrend,
      pendingApprovals: k.pendingApprovals ?? 0,
      pendingApprovalsBlockedCount: k.pendingApprovalsBlockedCount ?? 0,
      readAcknowledgmentRate:
        k.readAcknowledgmentRate ?? k.acknowledgmentRatePercent ?? 0,
      acknowledgedCount: k.acknowledgedCount ?? 0,
      totalAssignedCount: k.totalAssignedCount ?? 0,
      overdueAcknowledgments: k.overdueAcknowledgments ?? 0,
      overdueGroupsCount: k.overdueGroupsCount,
    };
  }

  const liveRollouts: SopRolloutItem[] = Array.isArray(dashboardData.rollouts)
    ? dashboardData.rollouts.map((r) => ({
        documentId: r.documentId || "",
        versionId: r.versionId || "",
        documentCode: r.documentCode || "",
        title: r.title || "",
        versionLabel: r.versionLabel || "",
        lifecycleState: r.lifecycleState || "PUBLISHED",
        targetAudienceGroupNames:
          r.targetAudienceGroupNames || r.targetAudienceGroups || [],
        acknowledgedCount: r.acknowledgedCount ?? 0,
        totalAssignedCount: r.totalAssignedCount ?? 0,
        completionPercent:
          r.completionPercent ??
          (r.totalAssignedCount && r.totalAssignedCount > 0
            ? (r.acknowledgedCount / r.totalAssignedCount) * 100
            : 0),
        overdueCount: r.overdueCount ?? 0,
        dueDate: r.dueDate || r.latestDueAt || null,
        documentSha256: r.documentSha256 || null,
      }))
    : [];

  const liveEvents: GovernanceActivityEvent[] = Array.isArray(dashboardData.events)
    ? dashboardData.events.map((e) => ({
        id: e.id || crypto.randomUUID(),
        eventType: e.eventType || "PUBLISHED",
        actorName: e.actorName || "Governance System",
        actorRole: e.actorRole,
        documentCode: e.documentCode || "",
        versionLabel: e.versionLabel || "",
        description: e.description,
        documentSha256: e.documentSha256,
        timestamp: e.timestamp || new Date().toISOString(),
      }))
    : [];

  return (
    <GovernanceDashboardView
      initialKpis={liveKpis}
      initialRollouts={liveRollouts}
      initialEvents={liveEvents}
      tenantName={ctx.tenantName}
      currentUserRole={ctx.role}
      currentUserId={ctx.userId}
      currentUserName={ctx.userName}
      userEmail={ctx.userEmail}
    />
  );
}
