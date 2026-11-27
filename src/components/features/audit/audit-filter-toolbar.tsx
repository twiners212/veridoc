"use client";

import * as React from "react";
import { Search } from "lucide-react";

interface AuditFilterToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  eventType: string;
  onEventTypeChange: (value: string) => void;
  role: string;
  onRoleChange: (value: string) => void;
  totalEvents: number;
  filteredCount: number;
  autoRefresh: boolean;
  onToggleAutoRefresh: () => void;
}

export function AuditFilterToolbar({
  search,
  onSearchChange,
  eventType,
  onEventTypeChange,
  role,
  onRoleChange,
  totalEvents,
  filteredCount,
  autoRefresh,
  onToggleAutoRefresh,
}: AuditFilterToolbarProps) {
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2 flex-1">
        {/* Search Input */}
        <div className="relative min-w-[240px] flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <input
            id="audit-search"
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search Document Code, Actor, or Hash..."
            className="w-full pl-8 pr-3 py-1.5 bg-background border border-border rounded text-xs font-normal text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
          />
        </div>

        {/* Event Type Dropdown */}
        <div className="relative">
          <select
            aria-label="Filter by event type"
            value={eventType}
            onChange={(e) => onEventTypeChange(e.target.value)}
            className="appearance-none pl-3 pr-8 py-1.5 bg-background border border-border rounded text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary hover:bg-muted/50 cursor-pointer transition-colors"
          >
            <option value="ALL">All Event Types</option>
            <option value="WORKFLOW_SUBMITTED">WORKFLOW_SUBMITTED</option>
            <option value="APPROVAL_GRANTED">APPROVAL_GRANTED</option>
            <option value="APPROVAL_INVALIDATED_BY_EDIT">
              APPROVAL_INVALIDATED_BY_EDIT
            </option>
            <option value="ADMIN_APPROVER_OVERRIDE">ADMIN_APPROVER_OVERRIDE</option>
            <option value="DOCUMENT_PUBLISHED">DOCUMENT_PUBLISHED</option>
            <option value="READ_ACKNOWLEDGED">READ_ACKNOWLEDGED</option>
            <option value="APPROVAL_REJECTED">APPROVAL_REJECTED</option>
            <option value="DOCUMENT_RETIRED">DOCUMENT_RETIRED</option>
          </select>
        </div>

        {/* Role Dropdown */}
        <div className="relative">
          <select
            aria-label="Filter by role"
            value={role}
            onChange={(e) => onRoleChange(e.target.value)}
            className="appearance-none pl-3 pr-8 py-1.5 bg-background border border-border rounded text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary hover:bg-muted/50 cursor-pointer transition-colors"
          >
            <option value="ALL">All Roles</option>
            <option value="QUALITY_MANAGER">Quality Manager</option>
            <option value="WORKSPACE_ADMIN">Workspace Admin</option>
            <option value="DOCUMENT_AUTHOR">Document Author</option>
            <option value="READER">Reader (Frontline)</option>
            <option value="APPROVER_REVIEWER">Approver / Reviewer</option>
          </select>
        </div>
      </div>

      {/* Live Count & Refresh Indicator */}
      <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 lg:pt-0 border-t lg:border-t-0 border-border">
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          Showing <span className="font-semibold text-foreground">{filteredCount}</span> of{" "}
          <span className="font-semibold text-foreground">{totalEvents.toLocaleString()}</span> events
        </span>

        <button
          type="button"
          onClick={onToggleAutoRefresh}
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-muted/60 hover:bg-muted border border-border transition-colors cursor-pointer"
          title="Toggle automatic 10-second background poll"
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              autoRefresh ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"
            }`}
          />
          <span className="font-mono text-[11px] text-muted-foreground">
            {autoRefresh ? "Live: 10s" : "Paused"}
          </span>
        </button>
      </div>
    </div>
  );
}
