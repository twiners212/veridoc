import * as React from "react";
import { Database, Lock, AlertTriangle, CheckSquare } from "lucide-react";
import type { AuditStats } from "./audit.types";

interface AuditStatsStripProps {
  stats: AuditStats;
}

export function AuditStatsStrip({ stats }: AuditStatsStripProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {/* Card 1: LEDGER HEAD */}
      <div className="bg-card border border-border rounded-lg p-3.5 flex items-center justify-between shadow-sm">
        <div className="flex flex-col">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Ledger Head
          </span>
          <span className="font-mono text-lg font-bold text-foreground mt-0.5">
            #{stats.ledgerHead.toLocaleString()}
          </span>
          <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 mt-0.5">
            Continuous sync
          </span>
        </div>
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
          <Database className="h-5 w-5" />
        </div>
      </div>

      {/* Card 2: DIGEST STANDARD */}
      <div className="bg-card border border-border rounded-lg p-3.5 flex items-center justify-between shadow-sm">
        <div className="flex flex-col">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Digest Standard
          </span>
          <span className="font-mono text-lg font-bold text-foreground mt-0.5">
            {stats.digestStandard || "SHA-256"}
          </span>
          <span className="text-[11px] text-muted-foreground mt-0.5">
            Application-Layer Chained
          </span>
        </div>
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
          <Lock className="h-5 w-5" />
        </div>
      </div>

      {/* Card 3: INVALIDATIONS / 30D */}
      <div className="bg-card border border-border rounded-lg p-3.5 flex items-center justify-between shadow-sm">
        <div className="flex flex-col">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Invalidations / 30d
          </span>
          <span className="font-mono text-lg font-bold text-amber-700 dark:text-amber-400 mt-0.5">
            {stats.invalidations30d.toLocaleString()}
          </span>
          <span className="text-[11px] text-muted-foreground mt-0.5">
            Author edits revoked sign-off
          </span>
        </div>
        <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-5 w-5" />
        </div>
      </div>

      {/* Card 4: READ ATTESTATIONS */}
      <div className="bg-card border border-border rounded-lg p-3.5 flex items-center justify-between shadow-sm">
        <div className="flex flex-col">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Read Attestations
          </span>
          <span className="font-mono text-lg font-bold text-foreground mt-0.5">
            {stats.readAttestations.toLocaleString()}
          </span>
          <span className="text-[11px] font-medium text-sky-600 dark:text-sky-400 mt-0.5">
            Dwell verified
          </span>
        </div>
        <div className="w-10 h-10 rounded-lg bg-sky-50 dark:bg-sky-950/40 flex items-center justify-center text-sky-600 dark:text-sky-400">
          <CheckSquare className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
