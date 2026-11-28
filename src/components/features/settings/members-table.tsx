"use client";

import * as React from "react";
import {
  Search,
  Filter,
  Download,
  Shield,
  FileText,
  FileCheck,
  BookOpen,
  Edit2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { WorkspaceRole } from "@/types/roles";

export interface MemberRow {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  status: "ACTIVE" | "INVITED" | "DEACTIVATED";
  createdAt: string;
  groups: Array<{ id: string; name: string }>;
}

export interface MembersTableProps {
  members: MemberRow[];
  currentUserId?: string;
  onInviteClick?: () => void;
  onEditClick: (member: MemberRow) => void;
}

export function MembersTable({
  members,
  currentUserId,
  onEditClick,
}: MembersTableProps) {
  const [search, setSearch] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState<string>("ALL");
  const [statusFilter, setStatusFilter] = React.useState<string>("ALL");

  const filteredMembers = React.useMemo(() => {
    return members.filter((m) => {
      const matchSearch =
        search === "" ||
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.email.toLowerCase().includes(search.toLowerCase()) ||
        m.groups.some((g) => g.name.toLowerCase().includes(search.toLowerCase()));

      const matchRole = roleFilter === "ALL" || m.role === roleFilter;
      const matchStatus = statusFilter === "ALL" || m.status === statusFilter;

      return matchSearch && matchRole && matchStatus;
    });
  }, [members, search, roleFilter, statusFilter]);

  const handleExportCsv = () => {
    const headers = ["Name", "Email", "Role", "Seat Type", "Status", "Audience Groups"];
    const rows = filteredMembers.map((m) => [
      `"${m.name}"`,
      `"${m.email}"`,
      `"${m.role}"`,
      `"${
        m.status === "DEACTIVATED"
          ? "Seat Released"
          : m.role === "READER"
          ? "Reader Pack"
          : "Creator Seat"
      }"`,
      `"${m.status}"`,
      `"${m.groups.map((g) => g.name).join("; ")}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `veridoc-workspace-members-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getRoleIcon = (role: WorkspaceRole) => {
    switch (role) {
      case "WORKSPACE_ADMIN":
        return <Shield className="h-3.5 w-3.5 text-primary dark:text-blue-400" />;
      case "QUALITY_MANAGER":
        return <Shield className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />;
      case "DOCUMENT_AUTHOR":
        return <FileText className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />;
      case "APPROVER_REVIEWER":
        return <FileCheck className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />;
      case "READER":
      default:
        return <BookOpen className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />;
    }
  };

  const getSeatTypeBadge = (role: WorkspaceRole, status: "ACTIVE" | "INVITED" | "DEACTIVATED") => {
    if (status === "DEACTIVATED") {
      return (
        <span className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground border border-border/40">
          Seat Released
        </span>
      );
    }
    if (role === "READER") {
      return (
        <span className="inline-flex items-center rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800">
          Reader Pack
        </span>
      );
    }
    return (
      <span className="inline-flex items-center rounded bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary border border-primary/20 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30">
        Creator Seat
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            id="user-search-input"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search members or groups..."
            className="pl-9 text-sm"
          />
        </div>

        <div className="flex flex-wrap w-full sm:w-auto items-center gap-2">
          <select
            aria-label="Filter by role"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="flex-1 sm:flex-initial min-w-0 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="ALL">All Roles</option>
            <option value="WORKSPACE_ADMIN">WORKSPACE_ADMIN</option>
            <option value="QUALITY_MANAGER">QUALITY_MANAGER</option>
            <option value="DOCUMENT_AUTHOR">DOCUMENT_AUTHOR</option>
            <option value="APPROVER_REVIEWER">APPROVER_REVIEWER</option>
            <option value="READER">READER</option>
          </select>

          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="flex-1 sm:flex-initial min-w-0 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INVITED">Invited</option>
            <option value="DEACTIVATED">Deactivated</option>
          </select>

          <Button variant="outline" size="sm" onClick={handleExportCsv} title="Export filtered list to CSV">
            <Download className="h-4 w-4 mr-1 sm:inline hidden" />
            <span>Export CSV</span>
          </Button>
        </div>
      </div>

      {/* Table & Mobile Cards */}
      <div className="rounded-lg border border-border bg-card overflow-hidden shadow-xs">
        {/* Mobile Stacked Cards (< md) */}
        <div className="md:hidden divide-y divide-border/60">
          {filteredMembers.length === 0 ? (
            <div className="px-4 py-8 text-center text-muted-foreground text-sm">
              No members match the active filters.
            </div>
          ) : (
            filteredMembers.map((m) => {
              const isSelf = currentUserId === m.userId;
              return (
                <div
                  key={m.id}
                  data-testid="member-row"
                  className="p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary dark:bg-blue-500/15 dark:text-blue-300 font-bold text-xs uppercase">
                        {m.name.slice(0, 2) || "U"}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center space-x-1.5 min-w-0">
                          <span className="font-medium text-foreground truncate">{m.name}</span>
                          {isSelf && (
                            <span className="rounded bg-muted px-1.5 py-0.2 text-[10px] font-bold text-muted-foreground shrink-0">
                              You
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground truncate">{m.email}</span>
                      </div>
                    </div>
                    <div className="shrink-0">
                      {m.status === "ACTIVE" && (
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                          ACTIVE
                        </span>
                      )}
                      {m.status === "INVITED" && (
                        <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                          INVITED
                        </span>
                      )}
                      {m.status === "DEACTIVATED" && (
                        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                          DEACTIVATED
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center space-x-1.5">
                      {getRoleIcon(m.role)}
                      <span className="text-xs font-medium text-foreground">
                        {m.role.replace("_", " ")}
                      </span>
                    </div>
                    {getSeatTypeBadge(m.role, m.status)}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    {m.groups.length > 0 ? (
                      <div className="flex flex-wrap gap-1 min-w-0">
                        {m.groups.map((g) => (
                          <span
                            key={g.id}
                            className="inline-block rounded bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                          >
                            {g.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">No groups</span>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onEditClick(m)}
                      className="min-h-[44px] px-3 text-xs shrink-0"
                    >
                      <Edit2 className="h-3.5 w-3.5 mr-1.5" />
                      <span>Edit</span>
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop Table (>= md) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 text-xs font-semibold text-muted-foreground uppercase border-b border-border">
              <tr>
                <th scope="col" className="px-4 py-3">Member</th>
                <th scope="col" className="px-4 py-3">RBAC Role</th>
                <th scope="col" className="px-4 py-3">Seat Type (DEC-01)</th>
                <th scope="col" className="px-4 py-3">Audience Groups</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">
                    No members match the active filters.
                  </td>
                </tr>
              ) : (
                filteredMembers.map((m) => {
                  const isSelf = currentUserId === m.userId;
                  return (
                    <tr key={m.id} data-testid="member-row" className="hover:bg-muted/20 transition-colors">
                      {/* Member Info */}
                      <td className="px-4 py-3">
                        <div className="flex items-center space-x-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary dark:bg-blue-500/15 dark:text-blue-300 font-bold text-xs uppercase">
                            {m.name.slice(0, 2) || "U"}
                          </div>
                          <div className="flex flex-col">
                            <div className="flex items-center space-x-1.5">
                              <span className="font-medium text-foreground">{m.name}</span>
                              {isSelf && (
                                <span className="rounded bg-muted px-1.5 py-0.2 text-[10px] font-bold text-muted-foreground">
                                  You
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">{m.email}</span>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-4 py-3">
                        <div className="flex items-center space-x-1.5">
                          {getRoleIcon(m.role)}
                          <span className="text-xs font-medium text-foreground">
                            {m.role.replace("_", " ")}
                          </span>
                        </div>
                      </td>

                      {/* Seat Type */}
                      <td className="px-4 py-3">
                        {getSeatTypeBadge(m.role, m.status)}
                      </td>

                      {/* Groups */}
                      <td className="px-4 py-3">
                        {m.groups.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {m.groups.map((g) => (
                              <span
                                key={g.id}
                                className="inline-block rounded bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                              >
                                {g.name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">None</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        {m.status === "ACTIVE" && (
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                            ACTIVE
                          </span>
                        )}
                        {m.status === "INVITED" && (
                          <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                            INVITED
                          </span>
                        )}
                        {m.status === "DEACTIVATED" && (
                          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                            DEACTIVATED
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onEditClick(m)}
                          className="h-7 px-2 text-xs"
                        >
                          <Edit2 className="h-3 w-3 mr-1" />
                          <span>Edit</span>
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
