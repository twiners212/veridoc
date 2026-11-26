import * as React from "react";

export default function DashboardLoading() {
  return (
    <div
      role="status"
      aria-label="Loading workspace page"
      className="flex-1 flex flex-col bg-background"
    >
      {/* Top Bar Skeleton */}
      <div className="h-16 border-b border-border bg-card px-6 lg:px-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-4 w-28 rounded bg-muted animate-pulse" />
          <div className="h-4 w-4 rounded bg-muted/70 animate-pulse" />
          <div className="h-4 w-36 rounded bg-muted animate-pulse" />
        </div>
        <div className="h-8 w-24 rounded bg-muted animate-pulse" />
      </div>

      {/* Main Content Skeleton */}
      <div className="flex-1 px-4 py-6 sm:px-8 max-w-7xl w-full mx-auto space-y-6">
        {/* Page Header Skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
          <div className="space-y-2">
            <div className="h-7 w-64 rounded bg-muted animate-pulse" />
            <div className="h-4 w-96 max-w-full rounded bg-muted/70 animate-pulse" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-9 w-28 rounded bg-muted animate-pulse" />
            <div className="h-9 w-28 rounded bg-muted animate-pulse" />
          </div>
        </div>

        {/* Summary Cards Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-border bg-card p-5 space-y-3"
            >
              <div className="h-3.5 w-24 rounded bg-muted animate-pulse" />
              <div className="h-8 w-16 rounded bg-muted animate-pulse" />
              <div className="h-3 w-32 rounded bg-muted/70 animate-pulse" />
            </div>
          ))}
        </div>

        {/* Table / Detail Container Skeleton */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="h-5 w-44 rounded bg-muted animate-pulse" />
            <div className="h-8 w-48 rounded bg-muted/80 animate-pulse" />
          </div>
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="h-4 w-24 rounded bg-muted animate-pulse shrink-0" />
                  <div className="h-4 w-56 max-w-full rounded bg-muted/80 animate-pulse" />
                </div>
                <div className="h-5 w-20 rounded-full bg-muted animate-pulse shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
