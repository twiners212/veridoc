"use client";

import * as React from "react";
import { UserPlus, AlertCircle, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inviteWorkspaceMemberAction } from "@/server/actions/workspace-admin.actions";
import type { WorkspaceRole } from "@/types/roles";

export interface InviteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  creatorRemaining: number;
  readerRemaining: number;
  availableGroups: Array<{ id: string; name: string }>;
  onSuccess: () => void;
}

export function InviteMemberModal({
  isOpen,
  onClose,
  tenantId,
  creatorRemaining,
  readerRemaining,
  availableGroups,
  onSuccess,
}: InviteMemberModalProps) {
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [role, setRole] = React.useState<WorkspaceRole>("READER");
  const [selectedGroups, setSelectedGroups] = React.useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorBanner, setErrorBanner] = React.useState<string | null>(null);
  const [is402QuotaError, setIs402QuotaError] = React.useState(false);

  if (!isOpen) return null;

  const isCreatorRole =
    role === "WORKSPACE_ADMIN" ||
    role === "QUALITY_MANAGER" ||
    role === "DOCUMENT_AUTHOR" ||
    role === "APPROVER_REVIEWER";

  const quotaAtRisk = isCreatorRole ? creatorRemaining <= 0 : readerRemaining <= 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorBanner(null);
    setIs402QuotaError(false);

    try {
      const res = await inviteWorkspaceMemberAction({
        tenantId,
        email,
        name: name.trim() || undefined,
        role,
        groupIds: selectedGroups,
      });

      if (!res.success) {
        setErrorBanner(res.error.message);
        if (res.error.status === 402 || res.error.code === "SEAT_QUOTA_EXCEEDED") {
          setIs402QuotaError(true);
        }
        return;
      }

      // Success
      setEmail("");
      setName("");
      setSelectedGroups([]);
      onSuccess();
      onClose();
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : "Failed to invite member");
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleGroup = (groupId: string) => {
    setSelectedGroups((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded bg-primary/10 text-primary">
              <UserPlus className="h-5 w-5" />
            </div>
            <h2 className="text-base font-semibold text-foreground">Invite Workspace Member</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Quota Pre-flight Warning */}
        {quotaAtRisk && (
          <div className="flex items-start space-x-2 rounded border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              <strong>Quota Limit Warning:</strong> All available {isCreatorRole ? "Creator Seats" : "Reader Pack slots"} are currently utilized. Inviting another member will trigger a quota limit.
            </span>
          </div>
        )}

        {/* Error Banner (e.g. 402 Quota Exceeded) */}
        {errorBanner && (
          <div
            className={`flex items-start space-x-2 rounded border p-3 text-xs ${
              is402QuotaError
                ? "border-destructive/40 bg-destructive/10 text-destructive font-medium"
                : "border-red-200 bg-red-50 text-red-900"
            }`}
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">
                {is402QuotaError ? "HTTP 402 — Seat Quota Exceeded (DEC-01)" : "Invitation Error"}
              </p>
              <p>{errorBanner}</p>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Email Address <span className="text-destructive">*</span>
            </label>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@company.com"
              className="text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Full Name (Optional)
            </label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
              className="text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              RBAC Role <span className="text-destructive">*</span>
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

          {availableGroups.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Audience Dispatch Groups
              </label>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1 border border-border rounded bg-muted/20">
                {availableGroups.map((g) => {
                  const selected = selectedGroups.includes(g.id);
                  return (
                    <button
                      type="button"
                      key={g.id}
                      onClick={() => toggleGroup(g.id)}
                      className={`inline-flex items-center space-x-1 rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                        selected
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                      }`}
                    >
                      {selected && <CheckCircle2 className="h-3 w-3 inline" />}
                      <span>{g.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-2 border-t border-border">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting}>
              {isSubmitting ? "Inviting..." : "Send Invitation"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
