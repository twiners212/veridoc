import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { WorkspaceSettingsView } from "@/components/features/settings/workspace-settings-view";
import { getDefaultLandingRouteForRole } from "@/lib/auth/demo-accounts";
import { loadSettingsPageBundleAction } from "@/server/actions/dashboard-loaders.actions";

interface SettingsPageProps {
  searchParams?: Promise<{ tenantId?: string }>;
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const params = await searchParams;
  const requestedTenantId = params?.tenantId?.trim();
  const bundle = await loadSettingsPageBundleAction(requestedTenantId);

  if (bundle.status === "UNAUTHENTICATED") {
    redirect("/auth/sign-in");
  }

  if (bundle.status === "NOT_FOUND") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-3 rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">
            Workspace Not Found (404)
          </h2>
          <p className="text-sm text-muted-foreground">
            The requested workspace identifier is invalid or unavailable.
          </p>
          <Link
            href="/settings"
            className="inline-flex min-h-[44px] items-center justify-center rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-blue-800"
          >
            Open Active Workspace Settings
          </Link>
        </div>
      </div>
    );
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
          {bundle.message ??
            "Only WORKSPACE_ADMIN members are authorized to manage workspace members, seat quotas, and governance policies."}
        </p>
        <Link
          href={getDefaultLandingRouteForRole(bundle.role ?? "READER")}
          className="inline-flex min-h-[44px] items-center justify-center rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-blue-800"
        >
          Go to My Workspace
        </Link>
      </div>
    );
  }

  if (bundle.status === "ERROR") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-6">
          <h2 className="text-lg font-semibold text-destructive">
            Error Loading Settings
          </h2>
          <p className="text-sm text-muted-foreground">{bundle.message}</p>
        </div>
      </div>
    );
  }

  return (
    <WorkspaceSettingsView
      initialData={bundle.settings}
      currentUserId={bundle.authContext.userId}
      userName={bundle.authContext.userName}
      userEmail={bundle.authContext.userEmail}
    />
  );
}
