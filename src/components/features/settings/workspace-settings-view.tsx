"use client";

import * as React from "react";
import { Users, Shield, Layers, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TopUtilityBar } from "@/components/layout/top-utility-bar";
import { QuotaCapacityStrip } from "./quota-capacity-strip";
import { MembersTable, type MemberRow } from "./members-table";
import { InviteMemberModal } from "./invite-member-modal";
import { EditMemberModal } from "./edit-member-modal";
import { GovernancePoliciesPanel } from "./governance-policies-panel";
import { AudienceGroupsPanel, type AudienceGroupItem } from "./audience-groups-panel";
import type { WorkspaceSettingsData } from "@/server/actions/workspace-admin.actions";

export interface WorkspaceSettingsViewProps {
  initialData: WorkspaceSettingsData;
  currentUserId?: string;
  userName?: string;
  userEmail?: string;
}

export function WorkspaceSettingsView({
  initialData,
  currentUserId,
  userName,
  userEmail,
}: WorkspaceSettingsViewProps) {
  const [data, setData] = React.useState(initialData);
  const [activeTab, setActiveTab] = React.useState<"MEMBERS" | "GROUPS" | "GOVERNANCE">("MEMBERS");
  const [isInviteOpen, setIsInviteOpen] = React.useState(false);
  const [editingMember, setEditingMember] = React.useState<MemberRow | null>(null);

  const creatorRemaining = Math.max(0, data.capacity.creatorLimit - data.capacity.creatorCount);
  const readerRemaining = Math.max(0, data.capacity.readerLimit - data.capacity.readerCount);

  const handleRefresh = () => {
    // In full Next.js App Router, router.refresh() triggers server component re-fetch
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Top Utility Bar */}
      <TopUtilityBar
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Workspace Settings" },
        ]}
        userName={userName}
        userEmail={userEmail}
        role="WORKSPACE_ADMIN"
      />

      {/* Main View Container */}
      <div className="flex-1 min-w-0 px-4 py-6 sm:px-8 max-w-7xl w-full mx-auto space-y-6">
        {/* Workspace Settings Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Workspace Administration
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage member roles, hybrid creator/reader quotas (DEC-01), audience dispatch groups, and governance safety controls.
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Button onClick={() => setIsInviteOpen(true)} size="sm">
              <UserPlus className="h-4 w-4 mr-1.5" />
              <span>Invite Member</span>
            </Button>
          </div>
        </div>

        {/* Quota Capacity Strip (DEC-01) */}
        <QuotaCapacityStrip
          creatorCount={data.capacity.creatorCount}
          creatorLimit={data.capacity.creatorLimit}
          readerCount={data.capacity.readerCount}
          readerLimit={data.capacity.readerLimit}
        />

        {/* Navigation Tabs */}
        <div className="border-b border-border overflow-x-auto">
          <nav aria-label="Settings Subsections" className="-mb-px flex space-x-6 text-sm font-medium whitespace-nowrap">
            <button
              type="button"
              onClick={() => setActiveTab("MEMBERS")}
              className={`flex items-center space-x-2 border-b-2 py-3 transition-colors ${
                activeTab === "MEMBERS"
                  ? "border-primary text-primary dark:border-blue-400 dark:text-blue-400 font-semibold"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
              }`}
            >
              <Users className="h-4 w-4" />
              <span>Users & RBAC Roles ({data.members.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("GROUPS")}
              className={`flex items-center space-x-2 border-b-2 py-3 transition-colors ${
                activeTab === "GROUPS"
                  ? "border-primary text-primary dark:border-blue-400 dark:text-blue-400 font-semibold"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
              }`}
            >
              <Layers className="h-4 w-4" />
              <span>Audience Groups ({data.groups.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("GOVERNANCE")}
              className={`flex items-center space-x-2 border-b-2 py-3 transition-colors ${
                activeTab === "GOVERNANCE"
                  ? "border-primary text-primary dark:border-blue-400 dark:text-blue-400 font-semibold"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
              }`}
            >
              <Shield className="h-4 w-4" />
              <span>Governance & Safety Controls</span>
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === "MEMBERS" && (
          <MembersTable
            members={data.members}
            currentUserId={currentUserId}
            onInviteClick={() => setIsInviteOpen(true)}
            onEditClick={(member) => setEditingMember(member)}
          />
        )}

        {activeTab === "GROUPS" && (
          <AudienceGroupsPanel
            tenantId={data.tenant.id}
            groups={data.groups}
            onUpdate={handleRefresh}
          />
        )}

        {activeTab === "GOVERNANCE" && (
          <GovernancePoliciesPanel
            tenantId={data.tenant.id}
            allowSingleAuthorOverride={data.tenant.allowSingleAuthorOverride}
            onUpdate={handleRefresh}
          />
        )}
      </div>

      {/* Modals */}
      <InviteMemberModal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        tenantId={data.tenant.id}
        creatorRemaining={creatorRemaining}
        readerRemaining={readerRemaining}
        availableGroups={data.groups}
        onSuccess={handleRefresh}
      />

      <EditMemberModal
        isOpen={editingMember !== null}
        onClose={() => setEditingMember(null)}
        tenantId={data.tenant.id}
        member={editingMember}
        onSuccess={handleRefresh}
      />
    </div>
  );
}
