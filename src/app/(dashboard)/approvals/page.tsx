import * as React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { ApprovalsView } from "@/components/features/approvals/approvals-view";
import { getDefaultLandingRouteForRole } from "@/lib/auth/demo-accounts";
import { loadApprovalsPageBundleAction } from "@/server/actions/dashboard-loaders.actions";

export default async function ApprovalsPage() {
  const bundle = await loadApprovalsPageBundleAction();

  if (bundle.status === "UNAUTHENTICATED") {
    redirect("/auth/sign-in");
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
          Only WORKSPACE_ADMIN, QUALITY_MANAGER, and APPROVER_REVIEWER roles are authorized to review and sign off approval workflows.
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

  const { authContext: ctx } = bundle;

  return (
    <ApprovalsView
      initialItems={bundle.initialItems}
      currentUserRole={ctx.role}
      currentUserId={ctx.userId}
      currentUserName={ctx.userName}
      tenantId={ctx.tenantId}
      tenantName={ctx.tenantName}
      allowSingleAuthorOverride={bundle.allowSingleAuthorOverride}
      availableApprovers={bundle.availableApprovers}
    />
  );
}
