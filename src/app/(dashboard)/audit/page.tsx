import * as React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { AuditTrailView } from "@/components/features/audit";
import type { AuditItem } from "@/components/features/audit/audit.types";
import { getDefaultLandingRouteForRole } from "@/lib/auth/demo-accounts";
import { loadAuditPageBundleAction } from "@/server/actions/dashboard-loaders.actions";

export default async function AuditPage() {
  const bundle = await loadAuditPageBundleAction();

  if (bundle.status === "UNAUTHENTICATED") {
    redirect("/auth/sign-in");
  }

  if (bundle.status === "FORBIDDEN") {
    return (
      <div className="p-8 max-w-2xl mx-auto flex flex-col items-center justify-center text-center min-h-[60vh] gap-4">
        <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400 flex items-center justify-center">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          Access Restricted (403 Forbidden)
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Only WORKSPACE_ADMIN and QUALITY_MANAGER roles are authorized to view
          the cryptographic audit trail and governance ledger.
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

  const initialItems: AuditItem[] = bundle.logs.items;
  const initialNextCursor = bundle.logs.nextCursorSequence;
  const initialHasMore = bundle.logs.hasMore;
  const initialStats = {
    ledgerHead: bundle.stats.ledgerHead,
    digestStandard: bundle.stats.digestStandard,
    invalidations30d: bundle.stats.invalidations30d,
    readAttestations: bundle.stats.readAttestations,
    totalEntries: bundle.stats.totalEntries,
    headHash: bundle.stats.headHash,
    chainVerified: bundle.stats.chainVerified,
    failedSequenceNumber: bundle.stats.failedSequenceNumber,
  };

  return (
    <AuditTrailView
      initialItems={initialItems}
      initialStats={initialStats}
      initialNextCursor={initialNextCursor}
      initialHasMore={initialHasMore}
      tenantName={bundle.authContext.tenantName}
    />
  );
}
