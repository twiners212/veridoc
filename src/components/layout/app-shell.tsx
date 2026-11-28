"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import gsap from "gsap";
import { DesktopSidebar } from "./desktop-sidebar";
import { MobileHeader } from "./mobile-header";
import { MobileBottomNav } from "./mobile-bottom-nav";
import type { WorkspaceRole } from "@/types/roles";

const SIDEBAR_STORAGE_KEY = "veridoc-sidebar-collapsed";
const EXPANDED_SIDEBAR_PX = 256;
const COLLAPSED_SIDEBAR_PX = 88;

export interface AppShellProps {
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
  children: React.ReactNode;
}

export function AppShell({
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
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const mainRef = React.useRef<HTMLElement | null>(null);
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const hasAnimatedRef = React.useRef(false);

  // Hydrate persisted sidebar collapse state on mount
  React.useEffect(() => {
    try {
      if (localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true") {
        setIsCollapsed(true);
      }
    } catch {
      // Ignore storage restrictions
    }
  }, []);

  // Synchronize <main> paddingLeft with sidebar width on desktop (>= 1024px)
  // so TopUtilityBar stretches flush against the 88px rail and centered content glides smoothly.
  React.useEffect(() => {
    const mainEl = mainRef.current;
    if (!mainEl) return;

    const targetPadding = isCollapsed ? COLLAPSED_SIDEBAR_PX : EXPANDED_SIDEBAR_PX;
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const mm = gsap.matchMedia();
    mm.add("(min-width: 1024px)", () => {
      if (!hasAnimatedRef.current || prefersReduced) {
        gsap.set(mainEl, { paddingLeft: targetPadding });
      } else {
        gsap.to(mainEl, {
          paddingLeft: targetPadding,
          duration: 0.3,
          ease: "power2.inOut",
          overwrite: "auto",
        });
      }
    });

    hasAnimatedRef.current = true;
    return () => mm.revert();
  }, [isCollapsed]);

  const handleToggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      } catch {
        // Ignore storage restrictions
      }
      return next;
    });
  };

  // Preserve full-bleed zero-clutter frontline reader mode on /read/* (DEC-07)
  if (pathname?.startsWith("/read/")) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-shell-canvas text-foreground">
      {/* Desktop Sidebar (lg and above) */}
      <DesktopSidebar
        role={role}
        tenantName={tenantName}
        userName={userName}
        userEmail={userEmail}
        creatorCount={creatorCount}
        creatorLimit={creatorLimit}
        readerCount={readerCount}
        readerLimit={readerLimit}
        pendingApprovalsCount={pendingApprovalsCount}
        pendingToReadCount={pendingToReadCount}
        demoLoginEnabled={demoLoginEnabled}
        isCollapsed={isCollapsed}
        onToggleCollapse={handleToggleCollapse}
      />

      {/* Mobile Top Header (below lg) */}
      <MobileHeader
        tenantName={tenantName}
        role={role}
        userName={userName}
        demoLoginEnabled={demoLoginEnabled}
      />

      {/* Main Content Area — paddingLeft stays synced via GSAP on lg+ */}
      <main
        ref={mainRef}
        className="lg:pl-64 pb-20 lg:pb-0 min-h-screen min-w-0 flex flex-col"
      >
        {children}
      </main>

      {/* Mobile Bottom Navigation Bar (below lg) */}
      <MobileBottomNav
        role={role}
        pendingApprovalsCount={pendingApprovalsCount}
        pendingToReadCount={pendingToReadCount}
      />
    </div>
  );
}
