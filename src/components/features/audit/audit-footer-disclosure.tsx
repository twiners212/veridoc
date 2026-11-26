import * as React from "react";
import { Info } from "lucide-react";

export function AuditFooterDisclosure() {
  return (
    <div className="p-4 rounded-lg bg-muted/40 border border-border flex items-start gap-3">
      <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
      <div className="flex flex-col gap-0.5 text-left">
        <span className="text-xs font-semibold text-foreground">
          Data Integrity & Chain Architecture
        </span>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Audit records use append-only database controls and application-level
          SHA-256 hash chaining, subject to cloud infrastructure security
          boundaries.
        </p>
      </div>
    </div>
  );
}
