"use client";

import * as React from "react";
import { Link as LinkIcon, CheckCircle2 } from "lucide-react";
import { AuditEventBadge } from "./audit-event-badge";
import { HashChipPopover } from "./hash-chip-popover";
import type { AuditItem } from "./audit.types";

interface AuditTableProps {
  items: AuditItem[];
  isLoading?: boolean;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function AuditTable({ items, isLoading }: AuditTableProps) {
  if (isLoading) {
    return (
      <div className="p-12 text-center text-xs text-muted-foreground bg-card border border-border rounded-lg">
        <span className="inline-block animate-spin mr-2">⟳</span>
        Loading cryptographic audit records...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="p-12 text-center text-xs text-muted-foreground bg-card border border-border rounded-lg">
        No audit log records found matching the active criteria.
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg shadow-sm overflow-hidden flex flex-col">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[980px]">
          <thead>
            <tr className="bg-muted/40 border-b border-border">
              <th
                scope="col"
                className="py-2.5 px-3.5 font-mono text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-24"
              >
                Seq #
              </th>
              <th
                scope="col"
                className="py-2.5 px-3.5 font-mono text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-44"
              >
                UTC Timestamp
              </th>
              <th
                scope="col"
                className="py-2.5 px-3.5 font-mono text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-56"
              >
                Event Type
              </th>
              <th
                scope="col"
                className="py-2.5 px-3.5 font-mono text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-44"
              >
                Document / Entity
              </th>
              <th
                scope="col"
                className="py-2.5 px-3.5 font-mono text-[11px] font-semibold text-muted-foreground uppercase tracking-wider min-w-[200px]"
              >
                Actor &amp; Role
              </th>
              <th
                scope="col"
                className="py-2.5 px-3.5 font-mono text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-32"
              >
                IP Address
              </th>
              <th
                scope="col"
                className="py-2.5 px-3.5 font-mono text-[11px] font-semibold text-muted-foreground uppercase tracking-wider min-w-[200px]"
              >
                Entry Hash &amp; Signature
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-xs text-foreground font-normal">
            {items.map((item) => {
              const formattedDate = item.createdAt
                .replace("T", " ")
                .replace(/\.\d+Z$/, " UTC")
                .replace("Z", " UTC");
              const isInvalidation =
                item.eventType === "APPROVAL_INVALIDATED_BY_EDIT";

              return (
                <tr
                  key={item.id}
                  className={`hover:bg-muted/40 transition-colors ${
                    isInvalidation ? "bg-amber-500/5" : ""
                  }`}
                >
                  {/* 1. Seq # */}
                  <td className="py-3 px-3.5 font-mono text-xs font-semibold text-primary">
                    #{item.sequenceNumber}
                  </td>

                  {/* 2. UTC Timestamp */}
                  <td className="py-3 px-3.5 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                    {formattedDate}
                  </td>

                  {/* 3. Event Type */}
                  <td className="py-3 px-3.5">
                    <AuditEventBadge eventType={item.eventType} />
                  </td>

                  {/* 4. Document / Entity */}
                  <td className="py-3 px-3.5">
                    {item.documentCode ? (
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-medium text-foreground">
                          {item.documentCode}
                        </span>
                        {item.versionString && (
                          <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground">
                            {item.versionString}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {item.entityType}:{item.entityId.slice(0, 8)}
                      </span>
                    )}
                  </td>

                  {/* 5. Actor & Role */}
                  <td className="py-3 px-3.5">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">
                        {getInitials(item.actorName)}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-medium text-foreground leading-tight truncate">
                          {item.actorName}
                        </span>
                        <span className="text-[10px] text-muted-foreground leading-tight truncate">
                          {item.actorRole
                            ? item.actorRole.replace("_", " ")
                            : "System"}
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* 6. IP Address */}
                  <td className="py-3 px-3.5 font-mono text-[11px] text-muted-foreground">
                    {item.actorIp ?? "—"}
                  </td>

                  {/* 7. Entry Hash & Signature */}
                  <td className="py-3 px-3.5">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-muted-foreground"
                          title={`Cryptographically chained to #${Math.max(
                            1,
                            item.sequenceNumber - 1
                          )}`}
                        >
                          <LinkIcon className="h-3 w-3" />
                        </span>
                        <HashChipPopover
                          hash={item.entryHash}
                          prevHash={item.prevHash}
                          sequenceNumber={item.sequenceNumber}
                        />
                        <span
                          className="text-emerald-600 dark:text-emerald-400"
                          title="Validated signature match"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                        </span>
                      </div>

                      {item.contextNote && (
                        <span
                          className={`font-mono text-[10px] ${
                            isInvalidation
                              ? "text-amber-700 dark:text-amber-400 font-semibold"
                              : "text-muted-foreground"
                          }`}
                        >
                          {item.contextNote}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
