"use client";

import * as React from "react";
import {
  Upload,
  X,
  AlertTriangle,
  Loader2,
  Check,
  Calendar,
  Users,
  ShieldAlert,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { publishDocumentVersionAction } from "@/server/actions/reader.actions";
import { cn } from "@/lib/utils";

export interface AudienceGroupOption {
  id: string;
  name: string;
  memberCount?: number;
}

export interface PublishDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result: { versionId: string; assignmentsCount?: number }) => void;
  documentId: string;
  versionId: string;
  versionLabel: string;
  documentCode: string;
  documentTitle: string;
  expectedRowVersion?: number;
  tenantId?: string;
  currentPublishedVersion?: {
    id: string;
    versionLabel: string;
    publishedAt?: string | Date | null;
  } | null;
  availableGroups?: AudienceGroupOption[];
}

const DEFAULT_GROUPS: AudienceGroupOption[] = [
  { id: "grp-shift-a", name: "Shift A Operations", memberCount: 50 },
  { id: "grp-maint", name: "Maintenance Ops", memberCount: 50 },
  { id: "grp-cleanroom", name: "Cleanroom Techs", memberCount: 50 },
  { id: "grp-warehouse", name: "Warehouse Team", memberCount: 50 },
  { id: "grp-qa", name: "Quality Assurance", memberCount: 30 },
];

export function PublishDocumentModal({
  isOpen,
  onClose,
  onSuccess,
  documentId,
  versionId,
  versionLabel,
  documentCode,
  documentTitle,
  expectedRowVersion,
  tenantId,
  currentPublishedVersion,
  availableGroups = DEFAULT_GROUPS,
}: PublishDocumentModalProps) {
  const groups = availableGroups.length > 0 ? availableGroups : DEFAULT_GROUPS;

  const [selectedGroupIds, setSelectedGroupIds] = React.useState<string[]>([]);
  const [dueDaysOption, setDueDaysOption] = React.useState<number>(7);
  const [customDueDate, setCustomDueDate] = React.useState<string>("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  // Initialize selected groups when modal opens (select first group by default)
  React.useEffect(() => {
    if (isOpen) {
      if (groups.length > 0) {
        setSelectedGroupIds([groups[0].id]);
      }
      setDueDaysOption(7);
      setCustomDueDate("");
      setErrorMessage(null);
    }
  }, [isOpen, groups]);

  if (!isOpen) return null;

  const toggleGroup = (id: string) => {
    setSelectedGroupIds((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    );
  };

  const selectAllGroups = () => {
    setSelectedGroupIds(groups.map((g) => g.id));
  };

  const clearAllGroups = () => {
    setSelectedGroupIds([]);
  };

  const totalAssignedReaders = groups
    .filter((g) => selectedGroupIds.includes(g.id))
    .reduce((acc, curr) => acc + (curr.memberCount || 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (selectedGroupIds.length === 0) {
      setErrorMessage("Please select at least one target audience group for rollout.");
      return;
    }

    setIsSubmitting(true);

    try {
      // Calculate due date timestamp or pass days
      let dueDateIso: string | undefined = undefined;
      if (dueDaysOption === -1 && customDueDate) {
        dueDateIso = new Date(customDueDate).toISOString();
      } else {
        const d = new Date();
        d.setDate(d.getDate() + dueDaysOption);
        dueDateIso = d.toISOString();
      }

      const res = await publishDocumentVersionAction({
        versionId,
        tenantId,
        targetGroupIds: selectedGroupIds,
        acknowledgmentDueDays: dueDaysOption > 0 ? dueDaysOption : 7,
        effectiveDate: dueDateIso,
        expectedRowVersion,
      });

      if (res.success) {
        onClose();
        onSuccess({ versionId, assignmentsCount: res.data.assignedCount });
      } else {
        setErrorMessage(res.error.message || "Failed to publish document version.");
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "An unexpected error occurred while publishing."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="publish-modal-title"
    >
      <div className="bg-card rounded-lg border border-border shadow-xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-muted/40">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center border border-emerald-300">
              <Upload className="h-4 w-4" />
            </div>
            <div>
              <h2 id="publish-modal-title" className="text-sm font-semibold text-foreground">
                Publish SOP &amp; Materialize Read Cohort
              </h2>
              <p className="text-xs text-muted-foreground font-mono">
                {documentCode} • {versionLabel}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Prominent Superseding Warning (BR-VER-01) */}
          {currentPublishedVersion && (
            <div className="rounded-md border border-purple-300 bg-purple-50/70 p-3 text-xs text-purple-950 flex items-start gap-2.5">
              <ShieldAlert className="h-4 w-4 text-purple-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-purple-900">
                  Superceding Active SOP (BR-VER-01)
                </p>
                <p className="text-purple-800 mt-0.5 leading-relaxed">
                  Version <strong>{currentPublishedVersion.versionLabel}</strong> is currently{" "}
                  <strong className="uppercase">PUBLISHED</strong>. Publishing{" "}
                  <strong>{versionLabel}</strong> will atomically transition the previous version to{" "}
                  <strong>SUPERSEDED</strong> and expire its uncompleted read assignments (marked{" "}
                  <code>EXPIRED_SUPERSEDED</code>).
                </p>
              </div>
            </div>
          )}

          {/* Document Summary */}
          <div className="bg-muted/40 rounded p-3 border border-border text-xs space-y-1">
            <p className="font-medium text-foreground">{documentTitle}</p>
            <p className="text-[11px] text-muted-foreground">
              Document status: <span className="text-emerald-700 font-semibold">APPROVED</span> • Ready for frontline release
            </p>
          </div>

          {/* Target Audience Groups Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Target Audience Groups (Required)</span>
              </label>
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={selectAllGroups}
                  className="text-primary hover:underline font-medium"
                >
                  Select All
                </button>
                <span className="text-muted-foreground">•</span>
                <button
                  type="button"
                  onClick={clearAllGroups}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-40 overflow-y-auto p-1 border border-border rounded-md bg-muted/20">
              {groups.map((group) => {
                const isChecked = selectedGroupIds.includes(group.id);
                return (
                  <label
                    key={group.id}
                    className={cn(
                      "flex items-center gap-2 px-2.5 py-1.5 rounded text-xs cursor-pointer border transition-colors select-none",
                      isChecked
                        ? "bg-primary/10 border-primary/40 text-primary font-medium"
                        : "bg-card border-border text-foreground hover:bg-muted/60"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleGroup(group.id)}
                      className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
                    />
                    <span className="truncate flex-1">{group.name}</span>
                    {group.memberCount !== undefined && (
                      <span className="text-[10px] text-muted-foreground font-mono">
                        ({group.memberCount})
                      </span>
                    )}
                  </label>
                );
              })}
            </div>

            <p className="text-[11px] text-muted-foreground">
              Total assigned readers: <strong className="text-foreground">{totalAssignedReaders}</strong> across {selectedGroupIds.length} groups
            </p>
          </div>

          {/* Acknowledgment Due Window Selector */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Acknowledgment Due Window</span>
            </label>

            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "7 Days", value: 7, desc: "Standard" },
                { label: "14 Days", value: 14, desc: "Facility-wide" },
                { label: "30 Days", value: 30, desc: "Annual Recert" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDueDaysOption(opt.value)}
                  className={cn(
                    "flex flex-col items-center justify-center p-2 rounded-md border text-xs transition-colors",
                    dueDaysOption === opt.value
                      ? "bg-primary/10 border-primary text-primary font-semibold shadow-xs"
                      : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  )}
                >
                  <span>{opt.label}</span>
                  <span className="text-[10px] font-normal opacity-80">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Footer CTAs */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="bg-emerald-700 hover:bg-emerald-800 text-white font-medium gap-1.5"
              disabled={isSubmitting || selectedGroupIds.length === 0}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Publishing &amp; Materializing...
                </>
              ) : (
                <>
                  <Upload className="h-3.5 w-3.5" />
                  Publish &amp; Materialize ({totalAssignedReaders})
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
