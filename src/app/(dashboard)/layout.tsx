import * as React from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getAuthenticatedWorkspaceContext } from "@/server/actions/session-context.actions";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const ctx = await getAuthenticatedWorkspaceContext();
  if (!ctx) {
    redirect("/auth/sign-in");
  }

  return (
    <AppShell
      role={ctx.role}
      tenantName={ctx.tenantName}
      userName={ctx.userName}
      userEmail={ctx.userEmail}
      creatorCount={ctx.creatorCount}
      creatorLimit={ctx.creatorLimit}
      readerCount={ctx.readerCount}
      readerLimit={ctx.readerLimit}
      pendingApprovalsCount={ctx.pendingApprovalsCount}
      pendingToReadCount={ctx.pendingToReadCount}
      demoLoginEnabled={ctx.demoLoginEnabled}
    >
      {children}
    </AppShell>
  );
}
