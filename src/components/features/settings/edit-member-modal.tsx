"use client";

import * as React from "react";
import { UserCheck, AlertTriangle, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateMemberRoleOrStatusAction } from "@/server/actions/workspace-admin.actions";
import type { WorkspaceRole } from "@/types/roles";

export interface EditMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  member: {
    id: string;
    userId: string;
    name: string;
    email: string;
    role: WorkspaceRole;
    status: "ACTIVE" | "INVITED" | "DEACTIVATED";
  } | null;
  onSuccess: () => void;
}

export function EditMemberModal({
  isOpen,
  onClose,
  tenantId,
  member,
  onSuccess,
}: EditMemberModalProps) {
  const [role, setRole] = React.useState<WorkspaceRole>("READER");
  const [status, setStatus] = React.useState<"ACTIVE" | "DEACTIVATED">("ACTIVE");
  const [justification, setJustification] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorBanner, setErrorBanner] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (member) {
      setRole(member.role);
      setStatus(member.status === "DEACTIVATED" ? "DEACTIVATED" : "ACTIVE");
      setJustification("");
      setErrorBanner(null);
    }
  }, [member]);

  if (!isOpen || !member) return null;

  const isDeactivating = status === "DEACTIVATED" && member.status !== "DEACTIVATED";
  const isReactivating = status === "ACTIVE" && member.status === "DEACTIVATED";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorBanner(null);

    try {
      const res = await updateMemberRoleOrStatusAction({
        tenantId,
        membershipId: member.id,
        newRole: role !== member.role ? role : undefined,
        newStatus: status !== member.status ? status : undefined,
        justification: justification.trim() || undefined,
      });

      if (!res.success) {
        setErrorBanner(res.error.message);
        return;
      }

      onSuccess();
      onClose();
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : "Failed to update member");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded bg-primary/10 text-primary">
              <UserCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Edit Workspace Member</h2>
              <p className="text-xs text-muted-foreground">{member.name} ({member.email})</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Deactivation Warning Notice */}
        {isDeactivating && (
          <div className="flex items-start space-x-2 rounded border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Seat Release & Approver Inactivation (BR-APP-04):</p>
              <p>
                Deactivating this member immediately revokes workspace access and releases their seat slot. If they are an assigned approver in any active sequential workflows, those steps will require Workspace Admin override.
              </p>
            </div>
          </div>
        )}

        {/* Reactivation Notice */}
        {isReactivating && (
          <div className="flex items-start space-x-2 rounded border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-900">
            <AlertCircle className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
            <span>
              Reactivating this member will consume a seat slot in their assigned category. Quota limits apply.
            </span>
          </div>
        )}

        {/* Error Banner */}
        {errorBanner && (
          <div className="flex items-start space-x-2 rounded border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Update Error</p>
              <p>{errorBanner}</p>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              RBAC Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as WorkspaceRole)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="READER">READER (Frontline Reader Pack)</option>
              <option value="DOCUMENT_AUTHOR">DOCUMENT_AUTHOR (Creator Seat)</option>
              <option value="APPROVER_REVIEWER">APPROVER_REVIEWER (Creator Seat)</option>
              <option value="QUALITY_MANAGER">QUALITY_MANAGER (Creator Seat)</option>
              <option value="WORKSPACE_ADMIN">WORKSPACE_ADMIN (Creator Seat)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Membership Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as "ACTIVE" | "DEACTIVATED")}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="ACTIVE">ACTIVE (Seat Consumed)</option>
              <option value="DEACTIVATED">DEACTIVATED (Seat Released)</option>
            </select>
          </div>

          {isDeactivating && (
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Audit Justification (Required for Deactivation)
              </label>
              <Input
                type="text"
                required
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="e.g. Employee offboarding per ticket SEC-102"
                className="text-sm"
              />
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-2 border-t border-border">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
