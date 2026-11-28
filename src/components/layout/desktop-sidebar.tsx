"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import gsap from "gsap";
import {
  LayoutDashboard,
  FileText,
  FileCheck,
  CheckCircle2,
  ScrollText,
  Settings,
  BookOpen,
  ShieldCheck,
  Building2,
  LogOut,
  ArrowLeftRight,
  User,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { VeriDocMark } from "@/components/brand/veridoc-mark";
import { cn } from "@/lib/utils";
import type { WorkspaceRole } from "@/types/roles";

const EXPANDED_SIDEBAR_PX = 256;
const COLLAPSED_SIDEBAR_PX = 88;

export interface DesktopSidebarProps {
  role?: WorkspaceRole;
  tenantName?: string;
  userName?: string;
  userEmail?: string;
  creatorCount?: number;
  creatorLimit?: number;
  readerCount?: number;
  readerLimit?: number;
  pendingApprovalsCount?: number;
  pendingToReadCount?: number;
  demoLoginEnabled?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
}

const ROLE_SHORT_CODE: Record<WorkspaceRole, string> = {
  WORKSPACE_ADMIN: "WA",
  QUALITY_MANAGER: "QM",
  DOCUMENT_AUTHOR: "DA",
  APPROVER_REVIEWER: "AR",
  READER: "RD",
};

export function DesktopSidebar({
  role = "WORKSPACE_ADMIN",
  tenantName = "VeriDoc Workspace",
  userName,
  userEmail,
  creatorCount = 0,
  creatorLimit = 10,
  readerCount = 0,
  readerLimit = 100,
  pendingApprovalsCount = 0,
  pendingToReadCount = 0,
  demoLoginEnabled = false,
  isCollapsed: controlledCollapsed,
  onToggleCollapse,
}: DesktopSidebarProps) {
  const pathname = usePathname() || "";
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = React.useState(false);
  const [uncontrolledCollapsed, setUncontrolledCollapsed] = React.useState(false);
  const hasMountedRef = React.useRef(false);
  const asideRef = React.useRef<HTMLElement | null>(null);

  const isCollapsed = controlledCollapsed ?? uncontrolledCollapsed;
  const brandHref = role === "READER" ? "/to-read" : "/dashboard";

  // Sync sidebar width with GSAP (256px <-> 88px) matching AppShell <main> paddingLeft
  React.useEffect(() => {
    const asideEl = asideRef.current;
    if (!asideEl) return;

    const targetWidth = isCollapsed ? COLLAPSED_SIDEBAR_PX : EXPANDED_SIDEBAR_PX;
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (!hasMountedRef.current || prefersReduced) {
      gsap.set(asideEl, { width: targetWidth });
      hasMountedRef.current = true;
      return;
    }

    const ctx = gsap.context(() => {
      gsap.to(asideEl, {
        width: targetWidth,
        duration: 0.3,
        ease: "power2.inOut",
        overwrite: "auto",
      });
    }, asideRef);

    return () => ctx.revert();
  }, [isCollapsed]);

  const toggleCollapsed = () => {
    if (onToggleCollapse) {
      onToggleCollapse();
    } else {
      setUncontrolledCollapsed((prev) => !prev);
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await authClient.signOut();
    } finally {
      router.push("/auth/sign-in");
      router.refresh();
    }
  };

  const navItems: NavItem[] = React.useMemo(() => {
    switch (role) {
      case "WORKSPACE_ADMIN":
        return [
          { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
          { label: "Documents", href: "/documents", icon: FileText },
          {
            label: "Approvals",
            href: "/approvals",
            icon: FileCheck,
            badge: pendingApprovalsCount > 0 ? pendingApprovalsCount : undefined,
          },
          {
            label: "My Acknowledgments",
            href: "/to-read",
            icon: CheckCircle2,
            badge: pendingToReadCount > 0 ? pendingToReadCount : undefined,
          },
          { label: "Audit Trail", href: "/audit", icon: ScrollText },
          { label: "Workspace Settings", href: "/settings", icon: Settings },
        ];

      case "QUALITY_MANAGER":
        return [
          { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
          { label: "Documents", href: "/documents", icon: FileText },
          {
            label: "Approvals",
            href: "/approvals",
            icon: FileCheck,
            badge: pendingApprovalsCount > 0 ? pendingApprovalsCount : undefined,
          },
          {
            label: "My Acknowledgments",
            href: "/to-read",
            icon: CheckCircle2,
            badge: pendingToReadCount > 0 ? pendingToReadCount : undefined,
          },
          { label: "Audit Trail", href: "/audit", icon: ScrollText },
        ];

      case "DOCUMENT_AUTHOR":
        return [
          { label: "Documents", href: "/documents", icon: FileText },
          {
            label: "My Acknowledgments",
            href: "/to-read",
            icon: CheckCircle2,
            badge: pendingToReadCount > 0 ? pendingToReadCount : undefined,
          },
        ];

      case "APPROVER_REVIEWER":
        return [
          { label: "Documents", href: "/documents", icon: FileText },
          {
            label: "Approvals",
            href: "/approvals",
            icon: FileCheck,
            badge: pendingApprovalsCount > 0 ? pendingApprovalsCount : undefined,
          },
          {
            label: "My Acknowledgments",
            href: "/to-read",
            icon: CheckCircle2,
            badge: pendingToReadCount > 0 ? pendingToReadCount : undefined,
          },
        ];

      case "READER":
      default:
        return [
          { label: "Library", href: "/documents", icon: BookOpen },
          {
            label: "My Acknowledgments",
            href: "/to-read",
            icon: CheckCircle2,
            badge: pendingToReadCount > 0 ? pendingToReadCount : undefined,
          },
        ];
    }
  }, [role, pendingApprovalsCount, pendingToReadCount]);

  return (
    <aside
      ref={asideRef}
      data-collapsed={isCollapsed}
      className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col overflow-hidden border-r border-border bg-gradient-to-b from-white via-slate-50/95 to-blue-50/50 dark:from-slate-950 dark:via-slate-900/95 dark:to-indigo-950/35 lg:flex shadow-xs"
    >
      {/* Brand, Workspace & Minimize Toggle Header */}
      <div
        className={cn(
          "flex border-b border-border/80 transition-colors",
          isCollapsed
            ? "flex-col items-center justify-center gap-2.5 py-3.5 px-2"
            : "h-16 items-center justify-between gap-2 px-4"
        )}
      >
        <Link
          href={brandHref}
          title={isCollapsed ? `VeriDoc — ${tenantName}` : undefined}
          className="flex flex-1 items-center space-x-2.5 min-w-0"
        >
          <VeriDocMark size="md" />
          {!isCollapsed && (
            <div className="flex flex-col min-w-0">
              <span className="font-semibold text-sm leading-tight text-foreground truncate">
                VeriDoc
              </span>
              <span className="text-[11px] text-muted-foreground flex items-center space-x-1 truncate">
                <Building2 className="h-3 w-3 inline shrink-0" />
                <span className="truncate">{tenantName}</span>
              </span>
            </div>
          )}
        </Link>

        <button
          type="button"
          data-testid="sidebar-collapse-toggle"
          onClick={toggleCollapsed}
          aria-label={isCollapsed ? "Expand sidebar" : "Minimize sidebar"}
          title={isCollapsed ? "Expand sidebar" : "Minimize sidebar"}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/80 bg-card/80 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {isCollapsed ? (
            <PanelLeftOpen className="h-3.5 w-3.5" />
          ) : (
            <PanelLeftClose className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Role Indicator Banner */}
      <div
        className={cn(
          "border-b border-border/60 bg-brand-gradient-subtle py-2",
          isCollapsed ? "px-2 flex justify-center" : "px-4"
        )}
      >
        {isCollapsed ? (
          <span
            title={`Active Role: ${role.replace(/_/g, " ")}`}
            className="inline-flex h-6 min-w-10 items-center justify-center rounded bg-primary/15 px-2 font-mono text-[10px] font-bold text-primary dark:bg-blue-500/20 dark:text-blue-300"
          >
            {ROLE_SHORT_CODE[role]}
          </span>
        ) : (
          <div className="flex items-center justify-between text-xs gap-2">
            <span className="text-muted-foreground font-medium shrink-0">Active Role</span>
            <span className="rounded bg-primary/15 px-2 py-0.5 font-semibold text-primary dark:bg-blue-500/20 dark:text-blue-300 text-[10px] truncate">
              {role.replace(/_/g, " ")}
            </span>
          </div>
        )}
      </div>

      {/* Navigation Links */}
      <nav
        aria-label="Main Navigation"
        className={cn(
          "flex-1 space-y-1.5 overflow-y-auto py-4",
          isCollapsed ? "px-2 flex flex-col items-center" : "px-3"
        )}
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={isCollapsed ? item.label : undefined}
              aria-label={item.label}
              className={cn(
                "group relative flex items-center rounded-lg text-sm font-medium transition-all duration-150",
                isCollapsed
                  ? "h-11 w-11 justify-center p-0 hover:scale-105"
                  : "w-full justify-between gap-2.5 px-2.5 py-2 hover:translate-x-0.5",
                isActive
                  ? "bg-brand-gradient text-white shadow-sm shadow-blue-700/20"
                  : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              )}
            >
              {isCollapsed ? (
                <>
                  <Icon
                    className={cn(
                      "h-5 w-5 shrink-0",
                      isActive ? "text-white" : "text-muted-foreground group-hover:text-foreground"
                    )}
                  />
                  {item.badge !== undefined && (
                    <span
                      className={cn(
                        "absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold shadow-xs",
                        isActive
                          ? "bg-white text-blue-700"
                          : "bg-destructive text-destructive-foreground"
                      )}
                    >
                      {item.badge}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0",
                        isActive
                          ? "text-white"
                          : "text-muted-foreground group-hover:text-foreground"
                      )}
                    />
                    <span className="truncate">{item.label}</span>
                  </div>
                  {item.badge !== undefined && (
                    <span
                      className={cn(
                        "ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                        isActive
                          ? "bg-white/95 text-blue-700"
                          : "bg-destructive/10 text-destructive dark:bg-red-500/15 dark:text-red-400"
                      )}
                    >
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom System Integrity, Quota & User Session Footer */}
      {isCollapsed ? (
        <div className="border-t border-border bg-muted/20 p-3 flex flex-col items-center gap-2.5">
          <div
            title={`SHA-256 Digest Active • Creators ${creatorCount}/${creatorLimit} • Readers ${readerCount}/${readerLimit}`}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-border/60 bg-background/80 text-emerald-600 dark:text-emerald-400 shadow-xs"
          >
            <ShieldCheck className="h-4 w-4" />
          </div>

          <div
            title={userName ? `${userName}${userEmail ? ` (${userEmail})` : ""}` : "Active User"}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-gradient-subtle border border-primary/25 text-xs font-bold text-primary dark:text-blue-300 select-none"
          >
            {userName ? userName.charAt(0).toUpperCase() : <User className="h-4 w-4" />}
          </div>

          {demoLoginEnabled && (
            <Link
              href="/auth/sign-in"
              title="Switch Demo Role"
              aria-label="Switch Demo Role"
              className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-foreground transition-colors hover:bg-muted"
            >
              <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          )}

          <button
            type="button"
            data-testid="sign-out-button"
            onClick={handleSignOut}
            disabled={isSigningOut}
            title={isSigningOut ? "Signing out..." : "Sign Out"}
            aria-label="Sign Out"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="border-t border-border bg-muted/20 p-3 space-y-2">
          <div className="flex items-center space-x-2 rounded bg-background/80 p-2 border border-border/60 shadow-xs">
            <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div className="flex flex-col text-[10px] leading-tight">
              <span className="font-semibold text-foreground">SHA-256 Digest Active</span>
              <span className="text-muted-foreground">Immutable Hash Chaining</span>
            </div>
          </div>

          <div className="rounded border border-border/40 bg-background/50 p-2 text-[11px] space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Creator Seats</span>
              <span className="font-semibold text-foreground">
                {creatorCount} / {creatorLimit}
              </span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Reader Pack</span>
              <span className="font-semibold text-foreground">
                {readerCount} / {readerLimit}
              </span>
            </div>
          </div>

          {/* User Identity & Session Actions */}
          <div className="rounded border border-border/60 bg-background p-2.5 space-y-2">
            {(userName || userEmail) && (
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <User className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  {userName && (
                    <p className="truncate text-xs font-semibold text-foreground leading-tight">
                      {userName}
                    </p>
                  )}
                  {userEmail && (
                    <p className="truncate text-[10px] text-muted-foreground leading-tight">
                      {userEmail}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              {demoLoginEnabled && (
                <Link
                  href="/auth/sign-in"
                  className="flex min-h-[34px] w-full items-center justify-center gap-1.5 rounded border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <ArrowLeftRight className="h-3 w-3 text-muted-foreground" />
                  <span>Switch Demo Role</span>
                </Link>
              )}
              <button
                type="button"
                data-testid="sign-out-button"
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="flex min-h-[34px] w-full items-center justify-center gap-1.5 rounded border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
              >
                <LogOut className="h-3 w-3" />
                <span>{isSigningOut ? "Signing out..." : "Sign Out"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
