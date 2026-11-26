"use client";

import * as React from "react";
import {
  Check,
  Clock,
  Lock,
  AlertTriangle,
  UserX,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ApprovalQueueStepItem } from "@/types/approvals";
import type { WorkspaceRole } from "@/types/roles";

export interface SequentialStepperProps {
  steps: ApprovalQueueStepItem[];
  currentUserId?: string;
  currentUserRole?: WorkspaceRole;
  documentAuthorId?: string;
  onAdminOverrideClick?: (step: ApprovalQueueStepItem) => void;
  className?: string;
}

export function SequentialStepper({
  steps,
  currentUserId,
  currentUserRole,
  documentAuthorId,
  onAdminOverrideClick,
  className,
}: SequentialStepperProps) {
  if (!steps || steps.length === 0) {
    return null;
  }

  // Active step is the lowest stepOrder with status PENDING
  const activeStep = steps.find((s) => s.status === "PENDING");
  const activeStepOrder = activeStep?.stepOrder ?? 0;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          Sequential Approval Pipeline (Stage {activeStepOrder || 1} of{" "}
          {steps.length} Active)
        </span>
        <span className="font-mono text-xs text-emerald-700 font-medium flex items-center gap-1.5">
          <Lock className="h-3 w-3" /> Cryptographically Enforced Sequence
        </span>
      </div>

      <div
        className={cn(
          "grid gap-3",
          steps.length === 1
            ? "grid-cols-1"
            : steps.length === 2
            ? "grid-cols-1 sm:grid-cols-2"
            : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        )}
      >
        {steps.map((step) => {
          const isCompleted = step.status === "APPROVED";
          const isRejected = step.status === "REJECTED";
          const isActive = step.status === "PENDING";
          const isWaiting = step.status === "WAITING";
          const isInvalidated =
            step.status === "INVALIDATED" || step.status === "SKIPPED";
          const isBlocked = step.isBlockedInactiveApprover && isActive;
          const isAssignedToMe = step.assignedApproverId === currentUserId;
          const canAdminOverride =
            currentUserRole === "WORKSPACE_ADMIN" &&
            isActive &&
            Boolean(onAdminOverrideClick);

          // Card container styles
          let containerStyle =
            "p-3.5 rounded-lg border flex flex-col justify-between transition-all ";
          if (isCompleted) {
            containerStyle += "border-emerald-200 bg-emerald-50/40";
          } else if (isRejected) {
            containerStyle += "border-red-200 bg-red-50/40";
          } else if (isActive) {
            containerStyle += isBlocked
              ? "border-amber-300 bg-amber-50/50 shadow-sm"
              : "border-2 border-primary bg-blue-50/30 shadow-sm";
          } else if (isInvalidated) {
            containerStyle += "border-border bg-muted/20 opacity-60";
          } else {
            // Waiting
            containerStyle += "border-border bg-muted/30 opacity-75";
          }

          return (
            <div
              key={step.id}
              className={containerStyle}
              data-testid={`stepper-step-${step.stepOrder}`}
            >
              <div>
                {/* Step header: icon + badge */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    {isCompleted ? (
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    ) : isRejected ? (
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-destructive text-destructive-foreground text-xs font-bold">
                        <XCircle className="h-3.5 w-3.5" />
                      </span>
                    ) : isActive ? (
                      <span
                        className={cn(
                          "inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold",
                          isBlocked ? "bg-amber-600" : "bg-primary animate-pulse"
                        )}
                      >
                        {step.stepOrder}
                      </span>
                    ) : (
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-muted text-muted-foreground text-xs font-medium">
                        {step.stepOrder}
                      </span>
                    )}

                    <span
                      className={cn(
                        "font-mono text-xs uppercase font-semibold",
                        isCompleted
                          ? "text-emerald-700"
                          : isRejected
                          ? "text-destructive"
                          : isActive
                          ? isBlocked
                            ? "text-amber-800"
                            : "text-primary tracking-wide"
                          : "text-muted-foreground"
                      )}
                    >
                      Step {step.stepOrder} •{" "}
                      {isCompleted
                        ? "Completed"
                        : isRejected
                        ? "Rejected"
                        : isActive
                        ? isBlocked
                          ? "Approver Inactive"
                          : "Active Now"
                        : isInvalidated
                        ? step.status
                        : "Queued"}
                    </span>
                  </div>

                  {step.overriddenFromApproverId && (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1 py-0 border-amber-300 text-amber-800"
                    >
                      Overridden
                    </Badge>
                  )}
                </div>

                {/* Approver role and name */}
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    {step.assignedApproverRole
                      ? step.assignedApproverRole.replace(/_/g, " ")
                      : "Designated Approver"}
                  </p>
                  <p
                    className={cn(
                      "text-xs truncate",
                      isActive && isAssignedToMe
                        ? "text-primary font-medium"
                        : "text-muted-foreground"
                    )}
                  >
                    {step.actedByFullName || step.assignedApproverName}
                    {isActive && isAssignedToMe && " (Awaiting You)"}
                  </p>
                </div>

                {/* Inactive approver alert badge (BR-APP-04) */}
                {isBlocked && (
                  <div className="mt-2 p-2 rounded bg-amber-100/80 border border-amber-300 flex items-start gap-1.5 text-[11px] text-amber-900">
                    <UserX className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-700" />
                    <div className="min-w-0">
                      <span className="font-semibold block">
                        BLOCKED_INACTIVE_APPROVER
                      </span>
                      <span>Assigned member is no longer active in workspace.</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom footer bar: timestamps or override trigger */}
              <div className="mt-3 pt-2 border-t border-border/60 font-mono text-[11px] flex items-center justify-between text-muted-foreground">
                {isCompleted ? (
                  <>
                    <span>
                      {step.actedAt
                        ? new Date(step.actedAt).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: "UTC",
                          }) + " UTC"
                        : "Signed"}
                    </span>
                    <span className="text-emerald-700 font-medium">Digest Bound</span>
                  </>
                ) : isRejected ? (
                  <>
                    <span>
                      {step.actedAt
                        ? new Date(step.actedAt).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: "UTC",
                          }) + " UTC"
                        : "Rejected"}
                    </span>
                    <span className="text-destructive font-medium">Cycle Reset</span>
                  </>
                ) : isActive ? (
                  <div className="w-full flex items-center justify-between gap-1">
                    <span className="text-primary font-semibold">
                      {isAssignedToMe ? "Action Required" : "Pending Sign-Off"}
                    </span>
                    {canAdminOverride ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[10px] bg-background text-amber-800 border-amber-300 hover:bg-amber-100"
                        onClick={() => onAdminOverrideClick?.(step)}
                        data-testid={`admin-override-trigger-step-${step.stepOrder}`}
                      >
                        <ShieldAlert className="h-3 w-3 mr-1" />
                        Override Approver
                      </Button>
                    ) : (
                      <span className="flex items-center gap-1 text-primary">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
                        In Queue
                      </span>
                    )}
                  </div>
                ) : (
                  <>
                    <span>Locked</span>
                    <span>Awaiting Step {step.stepOrder - 1}</span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
