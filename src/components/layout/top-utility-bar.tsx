"use client";

import * as React from "react";
import Link from "next/link";
import { User } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";

export interface TopUtilityBarProps {
  breadcrumbs?: Array<{ label: string; href?: string }>;
  userName?: string;
  userEmail?: string;
  role?: string;
}

export function TopUtilityBar({
  breadcrumbs = [{ label: "Workspace Settings" }],
  userName,
  userEmail,
  role,
}: TopUtilityBarProps) {
  return (
    <header className="sticky top-0 z-30 hidden lg:flex h-14 w-full items-center justify-between border-b border-border/80 bg-white/80 dark:bg-slate-950/80 px-4 backdrop-blur-md sm:px-6">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[1.5px] bg-gradient-to-r from-blue-600/40 via-indigo-500/35 to-sky-500/30" />
      <nav aria-label="Breadcrumb" className="flex items-center space-x-2 text-sm text-muted-foreground">
        {breadcrumbs.map((crumb, idx) => (
          <React.Fragment key={crumb.label}>
            {idx > 0 && <span className="text-muted-foreground/60">/</span>}
            {crumb.href ? (
              <Link
                href={crumb.href}
                className="hover:text-foreground transition-colors font-medium"
              >
                {crumb.label}
              </Link>
            ) : (
              <span className="font-semibold text-foreground">{crumb.label}</span>
            )}
          </React.Fragment>
        ))}
      </nav>

      <div className="flex items-center space-x-2.5 sm:space-x-3">
        <ThemeToggle />
        {role && (
          <span className="hidden sm:inline-flex items-center rounded-full bg-brand-gradient-subtle border border-primary/20 px-2.5 py-0.5 text-xs font-medium text-primary dark:text-blue-300">
            {role.replace(/_/g, " ")}
          </span>
        )}
        <div className="flex items-center space-x-2 text-sm">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <User className="h-4 w-4" />
          </div>
          <div className="hidden md:flex flex-col text-left">
            <span className="text-xs font-medium leading-none text-foreground">
              {userName || "Active User"}
            </span>
            <span className="text-[10px] text-muted-foreground leading-tight">
              {userEmail || "user@veridoc.workspace"}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
