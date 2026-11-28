"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Building2, LogOut } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { VeriDocMark } from "@/components/brand/veridoc-mark";
import { ThemeToggle } from "./theme-toggle";
import type { WorkspaceRole } from "@/types/roles";

export interface MobileHeaderProps {
  tenantName?: string;
  role?: WorkspaceRole;
  userName?: string;
  demoLoginEnabled?: boolean;
}

export function MobileHeader({
  tenantName = "VeriDoc Workspace",
  role = "READER",
  userName,
  demoLoginEnabled = false,
}: MobileHeaderProps) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = React.useState(false);
  const brandHref = role === "READER" ? "/to-read" : "/dashboard";

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await authClient.signOut();
    } finally {
      router.push("/auth/sign-in");
      router.refresh();
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 w-full items-center justify-between gap-2 border-b border-border/80 bg-white/85 dark:bg-slate-950/85 px-3 backdrop-blur-md lg:hidden">
      <Link href={brandHref} className="flex min-h-[44px] flex-1 min-w-0 items-center space-x-2">
        <VeriDocMark size="sm" />
        <div className="flex min-w-0 flex-col">
          <span className="font-semibold text-xs leading-none text-foreground">
            VeriDoc
          </span>
          <span className="text-[10px] text-muted-foreground flex items-center space-x-1 truncate">
            <Building2 className="h-2.5 w-2.5 inline shrink-0" />
            <span className="truncate">{tenantName}</span>
          </span>
        </div>
      </Link>

      <div className="flex shrink-0 items-center gap-1.5">
        <ThemeToggle />
        <div className="hidden sm:flex flex-col items-end">
          <span className="hidden sm:inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary dark:bg-blue-500/15 dark:text-blue-300">
            {role.replace(/_/g, " ")}
          </span>
          {userName && (
            <span className="hidden sm:block max-w-[100px] truncate text-[10px] text-muted-foreground">
              {userName}
            </span>
          )}
        </div>

        {demoLoginEnabled && (
          <Link
            href="/auth/sign-in"
            aria-label="Switch Demo Role"
            title="Switch Demo Role"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded border border-border bg-card px-2.5 text-[11px] font-medium text-foreground hover:bg-muted"
          >
            <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="sr-only sm:not-sr-only">Switch</span>
          </Link>
        )}

        <button
          type="button"
          data-testid="mobile-sign-out-button"
          onClick={handleSignOut}
          disabled={isSigningOut}
          aria-label="Sign Out"
          title="Sign Out"
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded border border-border bg-card text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
