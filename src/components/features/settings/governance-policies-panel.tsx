"use client";

import * as React from "react";
import { ShieldAlert, KeyRound, Check, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { updateWorkspaceGovernanceSettingsAction } from "@/server/actions/workspace-admin.actions";

export interface GovernancePoliciesPanelProps {
  tenantId: string;
  allowSingleAuthorOverride: boolean;
  onUpdate: () => void;
}

export function GovernancePoliciesPanel({
  tenantId,
  allowSingleAuthorOverride: initialValue,
  onUpdate,
}: GovernancePoliciesPanelProps) {
  const [enabled, setEnabled] = React.useState(initialValue);
  const [isUpdating, setIsUpdating] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  React.useEffect(() => {
    setEnabled(initialValue);
  }, [initialValue]);

  const handleToggle = async (newVal: boolean) => {
    setIsUpdating(true);
    setFeedback(null);
    try {
      const res = await updateWorkspaceGovernanceSettingsAction({
        tenantId,
        allowSingleAuthorOverride: newVal,
      });

      if (!res.success) {
        setFeedback({ type: "error", message: res.error.message });
        return;
      }

      setEnabled(newVal);
      setFeedback({
        type: "success",
        message: `Governance policy successfully updated: Single-Author Override is now ${
          newVal ? "ENABLED" : "DISABLED"
        }.`,
      });
      onUpdate();
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to update governance policy",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          className={`flex items-start space-x-2 rounded border p-3 text-xs ${
            feedback.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
              : "border-destructive/40 bg-destructive/10 text-destructive"
          }`}
        >
          {feedback.type === "success" ? (
            <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Policy 1: Separation of Duties & Single-Author Override (DEC-03, BR-APP-01) */}
      <Card className="border-border shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3">
              <div className="p-2 rounded bg-amber-500/10 text-amber-600 shrink-0 mt-0.5">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">
                  Small-Organization Single-Author Override (DEC-03, BR-APP-01)
                </CardTitle>
                <CardDescription className="text-xs mt-1 leading-relaxed max-w-2xl">
                  By default, VeriDoc enforces strict Separation of Duties (Four-Eyes Principle): an author cannot approve their own document version. Enabling this override permits single-author approval workflows for lean or solopreneur teams.
                </CardDescription>
              </div>
            </div>

            {/* Toggle Switch */}
            <div className="flex items-center space-x-2 shrink-0 ml-4">
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                disabled={isUpdating}
                onClick={() => handleToggle(!enabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 ${
                  enabled ? "bg-amber-600" : "bg-muted"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out ${
                    enabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
              <span className="text-xs font-semibold text-muted-foreground w-16">
                {enabled ? "ENABLED" : "DISABLED"}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="rounded border border-amber-200 bg-amber-50/50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200 space-y-1">
            <p className="font-semibold flex items-center space-x-1">
              <span>Compliance & Audit Disclosure Note:</span>
            </p>
            <p>
              When enabled, self-approved documents are explicitly marked with <code>self_approval_override_used: true</code> in the cryptographically chained audit log and Audit Packets (UC-04). Enterprise compliance frameworks (ISO 9001 / SOC 2) may flag self-authorized procedures.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Policy 2: Mandatory Sign-Off Re-Authentication (REQ-FR-401) */}
      <Card className="border-border shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3">
              <div className="p-2 rounded bg-primary/10 text-primary shrink-0 mt-0.5">
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">
                  Mandatory Electronic Signature Re-Authentication (REQ-FR-401)
                </CardTitle>
                <CardDescription className="text-xs mt-1 leading-relaxed max-w-2xl">
                  Enforces credential password verification on every approval, rejection, or administrative override sign-off. Protects against unattended session hijacking and sign-off repudiation.
                </CardDescription>
              </div>
            </div>

            <div className="flex items-center space-x-2 shrink-0 ml-4">
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800">
                ACTIVE (Core Invariant)
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          <p className="text-xs text-muted-foreground">
            Sign-off sessions verify user password against salted Argon2/scrypt hashes via Better Auth. Every recorded electronic sign-off binds User ID, Full Name, IP Address, UTC Timestamp, and the document&apos;s authoritative SHA-256 digest.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
