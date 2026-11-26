import * as React from "react";
import { SignInForm } from "@/components/features/auth/sign-in-form";
import {
  getDefaultLandingRouteForRole,
  isDemoLoginEnabled,
} from "@/lib/auth/demo-accounts";
import { getAuthenticatedWorkspaceContext } from "@/server/actions/session-context.actions";

interface SignInPageProps {
  searchParams?: Promise<{
    callbackUrl?: string;
    demoRole?: string;
  }>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const demoLoginEnabled = isDemoLoginEnabled();
  const ctx = await getAuthenticatedWorkspaceContext();

  return (
    <SignInForm
      callbackUrl={params?.callbackUrl}
      initialDemoRole={params?.demoRole}
      demoLoginEnabled={demoLoginEnabled}
      currentUser={
        ctx
          ? {
              name: ctx.userName,
              email: ctx.userEmail,
              role: ctx.role,
              tenantName: ctx.tenantName,
              landingRoute: getDefaultLandingRouteForRole(ctx.role),
            }
          : null
      }
    />
  );
}
