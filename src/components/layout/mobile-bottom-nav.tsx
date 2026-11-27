"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FileCheck,
  FileText,
  BookOpen,
  CheckCircle,
  Folder,
  Settings,
  LayoutDashboard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkspaceRole } from "@/types/roles";

export interface MobileBottomNavProps {
  role?: WorkspaceRole;
  pendingApprovalsCount?: number;
  pendingToReadCount?: number;
}

interface NavTab {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
}

export function MobileBottomNav({
  role = "READER",
  pendingApprovalsCount = 0,
  pendingToReadCount = 0,
}: MobileBottomNavProps) {
  const pathname = usePathname() || "";

  const tabs: NavTab[] = React.useMemo(() => {
    if (role === "READER") {
      return [
        {
          label: "To Read",
          href: "/to-read",
          icon: BookOpen,
          badge: pendingToReadCount > 0 ? pendingToReadCount : undefined,
        },
        {
          label: "Library",
          href: "/documents",
          icon: Folder,
        },
        {
          label: "Completed",
          href: "/to-read?tab=completed",
          icon: CheckCircle,
        },
      ];
    }

    // Creator / Admin Roles
    const items: NavTab[] = [
      {
        label: "Approvals",
        href: "/approvals",
        icon: FileCheck,
        badge: pendingApprovalsCount > 0 ? pendingApprovalsCount : undefined,
      },
      {
        label: "Documents",
        href: "/documents",
        icon: FileText,
      },
      {
        label: "To Read",
        href: "/to-read",
        icon: BookOpen,
        badge: pendingToReadCount > 0 ? pendingToReadCount : undefined,
      },
    ];

    if (role === "WORKSPACE_ADMIN") {
      items.push({
        label: "Settings",
        href: "/settings",
        icon: Settings,
      });
    } else {
      items.push({
        label: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
      });
    }

    return items;
  }, [role, pendingApprovalsCount, pendingToReadCount]);

  return (
    <nav
      aria-label="Mobile Navigation"
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur lg:hidden pb-safe"
    >
      <div
        className={cn("grid h-16 w-full items-center", {
          "grid-cols-3": tabs.length === 3,
          "grid-cols-4": tabs.length === 4,
        })}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive =
            !tab.href.includes("?") &&
            (pathname === tab.href || pathname.startsWith(`${tab.href}/`));
          return (
            <Link
              key={tab.label}
              href={tab.href}
              className={cn(
                "flex flex-col items-center justify-center py-1 transition-colors relative",
                isActive
                  ? "text-primary dark:text-blue-400 font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div className="relative">
                <Icon className="h-5 w-5" />
                {tab.badge !== undefined && (
                  <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] mt-0.5">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
