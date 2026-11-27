"use client";

import * as React from "react";
import {
  GitCompare,
  Plus,
  Minus,
  AlertCircle,
  FileText,
  Loader2,
  CheckCircle2,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface DiffLine {
  type: "added" | "removed" | "unchanged";
  content: string;
  oldLineNumber?: number | null;
  newLineNumber?: number | null;
}

export interface DiffResponseData {
  baseVersionId: string;
  targetVersionId: string;
  baseVersionLabel?: string;
  targetVersionLabel?: string;
  additions: number;
  deletions: number;
  lines: DiffLine[];
}

export interface MarkdownDiffViewerProps {
  documentId: string;
  baseVersionId?: string;
  targetVersionId?: string;
  versions?: Array<{ id: string; versionLabel: string; title: string }>;
  initialDiff?: DiffResponseData | null;
  className?: string;
}

export function MarkdownDiffViewer({
  documentId,
  baseVersionId: initialBaseId,
  targetVersionId: initialTargetId,
  versions = [],
  initialDiff = null,
  className,
}: MarkdownDiffViewerProps) {
  const [baseId, setBaseId] = React.useState<string>(initialBaseId || "");
  const [targetId, setTargetId] = React.useState<string>(initialTargetId || "");
  const [diffData, setDiffData] = React.useState<DiffResponseData | null>(initialDiff);
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorStatus, setErrorStatus] = React.useState<number | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  // Set default version selection if versions are provided
  React.useEffect(() => {
    if (versions.length >= 2) {
      if (!baseId) setBaseId(versions[1].id); // earlier version
      if (!targetId) setTargetId(versions[0].id); // later version
    } else if (versions.length === 1) {
      if (!targetId) setTargetId(versions[0].id);
    }
  }, [versions, baseId, targetId]);

  const fetchDiff = React.useCallback(
    async (vA: string, vB: string) => {
      if (!vA || !vB || vA === vB) return;

      setIsLoading(true);
      setErrorStatus(null);
      setErrorMessage(null);

      try {
        // Query /api/documents/[documentId]/diff supporting both vA/vB and baseVersionId/targetVersionId
        const params = new URLSearchParams({
          vA,
          vB,
          baseVersionId: vA,
          targetVersionId: vB,
        });

        const res = await fetch(`/api/documents/${documentId}/diff?${params.toString()}`);
        const json = await res.json().catch(() => null);

        if (!res.ok) {
          setErrorStatus(res.status);
          const code = json?.error?.code || "";
          const msg = json?.error?.message || `Failed to fetch diff (${res.status})`;

          if (res.status === 422 || code === "UNSUPPORTED_DIFF_FORMAT") {
            setErrorMessage(
              "Visual side-by-side and PDF diffing is deferred to Slice 2 (DEC-05). Only textual Markdown documents support line-by-line diffing in Slice 1."
            );
          } else {
            setErrorMessage(msg);
          }
          setDiffData(null);
          return;
        }

        // Successfully received diff data
        const payload = json?.data || json;
        setDiffData(payload);
      } catch (err: unknown) {
        setErrorStatus(500);
        setErrorMessage(
          err instanceof Error ? err.message : "Network error while loading document diff."
        );
      } finally {
        setIsLoading(false);
      }
    },
    [documentId]
  );

  React.useEffect(() => {
    if (baseId && targetId && baseId !== targetId) {
      fetchDiff(baseId, targetId);
    }
  }, [baseId, targetId, fetchDiff]);

  return (
    <div className={cn("space-y-4 rounded-lg border border-border bg-card p-4", className)}>
      {/* Header & Version Selectors */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <GitCompare className="h-5 w-5 text-primary dark:text-blue-400" />
          <h3 className="text-base font-semibold text-foreground">Markdown Revision Diff</h3>
          <span className="text-xs text-muted-foreground font-mono">(DEC-05)</span>
        </div>

        {versions.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">Compare:</span>
            <select
              aria-label="Select base version"
              value={baseId}
              onChange={(e) => setBaseId(e.target.value)}
              className="rounded border border-border bg-background px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="" disabled>
                Select Base Version
              </option>
              {versions.map((v) => (
                <option key={`base-${v.id}`} value={v.id}>
                  {v.versionLabel} - {v.title}
                </option>
              ))}
            </select>

            <span className="text-muted-foreground">→</span>

            <select
              aria-label="Select target version"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="rounded border border-border bg-background px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="" disabled>
                Select Target Version
              </option>
              {versions.map((v) => (
                <option key={`target-${v.id}`} value={v.id}>
                  {v.versionLabel} - {v.title}
                </option>
              ))}
            </select>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fetchDiff(baseId, targetId)}
              disabled={isLoading || !baseId || !targetId || baseId === targetId}
            >
              {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Compare"}
            </Button>
          </div>
        )}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-primary dark:text-blue-400 mb-2" />
          <p className="text-sm">Computing line-by-line textual diff...</p>
        </div>
      )}

      {/* 422 UNSUPPORTED_DIFF_FORMAT Banner (DEC-05) */}
      {!isLoading && errorStatus === 422 && (
        <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-5 text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-sky-700 dark:text-sky-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-sky-900 dark:text-sky-100">
                PDF Diffing Deferred to Slice 2 (DEC-05)
              </h4>
              <p className="text-xs text-sky-800 dark:text-sky-300 leading-relaxed">
                One or both of the compared document revisions has a PDF binary attachment. Visual
                side-by-side and PDF diffing is scheduled for a future slice.
              </p>
              <p className="text-xs text-sky-800 dark:text-sky-300 mt-2">
                Textual line diffing is supported exclusively on Markdown SOP revisions.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Generic Error Banner */}
      {!isLoading && errorStatus && errorStatus !== 422 && errorMessage && (
        <div className="flex items-start gap-2.5 p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive dark:text-red-400 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="flex-1">{errorMessage}</div>
        </div>
      )}

      {/* Diff Output */}
      {!isLoading && !errorMessage && diffData && (
        <div className="space-y-3">
          {/* Summary Badges */}
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="inline-flex items-center gap-1 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 px-2 py-0.5 font-semibold">
              <Plus className="h-3 w-3" />
              {diffData.additions ?? 0} additions
            </span>
            <span className="inline-flex items-center gap-1 rounded bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 px-2 py-0.5 font-semibold">
              <Minus className="h-3 w-3" />
              {diffData.deletions ?? 0} deletions
            </span>
            <span className="text-muted-foreground ml-auto">
              {diffData.lines?.length ?? 0} total lines inspected
            </span>
          </div>

          {/* Line by line display */}
          <div className="overflow-x-auto rounded border border-border bg-slate-900 font-mono text-xs text-slate-100 shadow-inner">
            {(!diffData.lines || diffData.lines.length === 0) ? (
              <div className="p-6 text-center text-slate-400">
                No textual differences found between the compared versions.
              </div>
            ) : (
              <table className="w-full border-collapse">
                <tbody>
                  {diffData.lines.map((line, idx) => {
                    const isAdded = line.type === "added";
                    const isRemoved = line.type === "removed";

                    return (
                      <tr
                        key={idx}
                        className={cn(
                          "transition-colors",
                          isAdded && "bg-emerald-950/60 text-emerald-300",
                          isRemoved && "bg-rose-950/60 text-rose-300",
                          !isAdded && !isRemoved && "hover:bg-slate-800/40"
                        )}
                      >
                        {/* Old Line Number */}
                        <td className="w-12 select-none px-2 py-0.5 text-right text-slate-500 border-r border-slate-800">
                          {line.oldLineNumber ?? ""}
                        </td>
                        {/* New Line Number */}
                        <td className="w-12 select-none px-2 py-0.5 text-right text-slate-500 border-r border-slate-800">
                          {line.newLineNumber ?? ""}
                        </td>
                        {/* Marker */}
                        <td className="w-6 select-none px-2 py-0.5 text-center font-bold">
                          {isAdded ? "+" : isRemoved ? "-" : " "}
                        </td>
                        {/* Line Content */}
                        <td className="whitespace-pre-wrap px-2 py-0.5 break-all">
                          {line.content || " "}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Empty State when no versions selected or compared */}
      {!isLoading && !diffData && !errorMessage && (
        <div className="p-8 text-center text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground/60" />
          <p className="text-sm font-medium">Select two revisions above to compare differences.</p>
        </div>
      )}
    </div>
  );
}
