"use client";

import * as React from "react";
import Link from "next/link";
import {
  Search,
  Filter,
  FileText,
  FileCode,
  ArrowUpDown,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { LifecycleStatusBadge } from "./lifecycle-status-badge";
import { Sha256DigestChip } from "./sha256-digest-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { DocumentLifecycleState, WorkspaceRole } from "@/types/roles";

export interface DocumentTableRow {
  id: string;
  documentCode: string;
  title: string;
  category: string | null;
  contentFormat: "MARKDOWN" | "PDF";
  currentVersionLabel: string;
  currentVersionId: string;
  lifecycleState: DocumentLifecycleState;
  documentSha256?: string | null;
  versionCount: number;
  updatedAt: string | Date;
  authorName?: string | null;
}

export interface DocumentsTableProps {
  documents: DocumentTableRow[];
  categories?: string[];
  currentUserRole?: WorkspaceRole;
  isLoading?: boolean;
  className?: string;
}

export function DocumentsTable({
  documents,
  categories = [],
  currentUserRole,
  isLoading = false,
  className,
}: DocumentsTableProps) {
  const [searchTerm, setSearchTerm] = React.useState("");
  const [selectedCategory, setSelectedCategory] = React.useState<string>("ALL");
  const [selectedState, setSelectedState] = React.useState<string>("ALL");

  // Compute counts for filter pills
  const stateCounts = React.useMemo(() => {
    const counts: Record<string, number> = {
      ALL: documents.length,
      DRAFT: 0,
      PENDING_APPROVAL: 0,
      APPROVED: 0,
      PUBLISHED: 0,
      SUPERSEDED: 0,
      RETIRED: 0,
    };
    for (const doc of documents) {
      if (counts[doc.lifecycleState] !== undefined) {
        counts[doc.lifecycleState] += 1;
      }
    }
    return counts;
  }, [documents]);

  // Derived category list if not explicitly provided
  const categoryOptions = React.useMemo(() => {
    if (categories.length > 0) return categories;
    const set = new Set<string>();
    documents.forEach((d) => {
      if (d.category) set.add(d.category);
    });
    return Array.from(set);
  }, [categories, documents]);

  // Filtered documents
  const filteredDocuments = React.useMemo(() => {
    return documents.filter((doc) => {
      // Search filter
      const search = searchTerm.trim().toLowerCase();
      const matchesSearch =
        search === "" ||
        doc.documentCode.toLowerCase().includes(search) ||
        doc.title.toLowerCase().includes(search) ||
        (doc.category && doc.category.toLowerCase().includes(search));

      // Category filter
      const matchesCategory =
        selectedCategory === "ALL" || doc.category === selectedCategory;

      // State filter
      const matchesState =
        selectedState === "ALL" || doc.lifecycleState === selectedState;

      return matchesSearch && matchesCategory && matchesState;
    });
  }, [documents, searchTerm, selectedCategory, selectedState]);

  const formatDate = (dateVal: string | Date) => {
    try {
      const d = typeof dateVal === "string" ? new Date(dateVal) : dateVal;
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(d);
    } catch {
      return String(dateVal);
    }
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* 1. SOP Library Lifecycle Filter Pills Bar (matching .stitch-ref/07) */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 shadow-xs xl:flex-row xl:items-center xl:justify-between">
        {/* State filter pills */}
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 xl:pb-0">
          {[
            { id: "ALL", label: "ALL" },
            { id: "DRAFT", label: "DRAFT" },
            { id: "PENDING_APPROVAL", label: "PENDING APPROVAL" },
            { id: "APPROVED", label: "APPROVED" },
            { id: "PUBLISHED", label: "PUBLISHED" },
            { id: "SUPERSEDED", label: "SUPERSEDED" },
            { id: "RETIRED", label: "RETIRED" },
          ]
            .filter((pill) =>
              currentUserRole === "READER"
                ? pill.id === "ALL" || pill.id === "PUBLISHED"
                : true
            )
            .map((pill) => {
              const count = stateCounts[pill.id] ?? 0;
              const isSelected = selectedState === pill.id;

              return (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setSelectedState(pill.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-colors select-none",
                    isSelected
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <span>{pill.label}</span>
                  <span
                    className={cn(
                      "px-1.5 py-0.2 rounded-full font-mono text-[10px]",
                      isSelected
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-background text-muted-foreground border border-border/70"
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
        </div>

        {/* Search & Category Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search Input */}
          <div className="relative w-full min-w-0 sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter code or title..."
              className="h-8 w-full rounded border border-border bg-background pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Category Dropdown */}
          {categoryOptions.length > 0 && (
            <div className="relative">
              <select
                aria-label="Filter by category"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="h-8 rounded border border-border bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="ALL">All Categories</option>
                {categoryOptions.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* 2. Documents Table & Mobile Cards */}
      <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden min-w-0">
        {/* Mobile Stacked Cards (< md) */}
        <div className="md:hidden divide-y divide-border">
          {isLoading ? (
            <div className="py-12 px-4 text-center text-muted-foreground text-sm">
              Loading controlled documents library...
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="py-12 px-4 text-center text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground/60" />
              <p className="font-medium text-foreground">No controlled documents found</p>
              <p className="text-xs text-muted-foreground mt-1">
                {searchTerm || selectedState !== "ALL" || selectedCategory !== "ALL"
                  ? "Try clearing or adjusting your search filters."
                  : "Create your first standard operating procedure to begin."}
              </p>
            </div>
          ) : (
            filteredDocuments.map((doc) => (
              <div
                key={doc.id}
                data-testid="document-row"
                className="p-4 space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <Link
                      href={`/documents/${doc.id}`}
                      className="inline-flex items-center gap-1 font-mono text-xs font-bold text-foreground hover:text-primary dark:hover:text-blue-400 transition-colors"
                    >
                      <span>{doc.documentCode}</span>
                    </Link>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded font-mono text-xs bg-muted text-foreground border border-border/80">
                      {doc.currentVersionLabel}
                    </span>
                    {doc.versionCount > 1 && (
                      <span className="text-[10px] text-muted-foreground">
                        ({doc.versionCount} revs)
                      </span>
                    )}
                  </div>
                  <LifecycleStatusBadge state={doc.lifecycleState} size="sm" />
                </div>

                <Link
                  href={`/documents/${doc.id}`}
                  className="font-medium text-sm text-foreground hover:text-primary dark:hover:text-blue-400 transition-colors block break-words"
                >
                  {doc.title}
                </Link>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {doc.category && (
                    <span className="inline-block px-1.5 py-0.2 rounded bg-muted text-[11px]">
                      {doc.category}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    {doc.contentFormat === "PDF" ? (
                      <>
                        <FileText className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                        <span>PDF</span>
                      </>
                    ) : (
                      <>
                        <FileCode className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                        <span>Markdown</span>
                      </>
                    )}
                  </span>
                  {doc.authorName && (
                    <span className="text-[11px]">Author: {doc.authorName}</span>
                  )}
                  <span className="text-[11px] font-mono">
                    {formatDate(doc.updatedAt)}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <Sha256DigestChip digest={doc.documentSha256} />
                  <Link
                    href={`/documents/${doc.id}`}
                    className="inline-flex items-center justify-center min-h-[44px] px-3 rounded-md border border-input bg-background text-xs font-medium text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
                  >
                    Workspace
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop Table (>= md) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground select-none">
              <tr>
                <th className="px-2.5 2xl:px-4 py-3 whitespace-nowrap">Document Code</th>
                <th className="px-2.5 2xl:px-4 py-3">Title &amp; Category</th>
                <th className="px-2.5 2xl:px-3 py-3 whitespace-nowrap">Format</th>
                <th className="px-2.5 2xl:px-3 py-3 whitespace-nowrap">Version</th>
                <th className="px-2.5 2xl:px-4 py-3 whitespace-nowrap">Status</th>
                <th className="px-2.5 2xl:px-4 py-3 whitespace-nowrap">SHA-256 Digest</th>
                <th className="hidden 2xl:table-cell px-4 py-3 whitespace-nowrap">Updated</th>
                <th className="px-2.5 2xl:px-4 py-3 text-right whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">
                    Loading controlled documents library...
                  </td>
                </tr>
              ) : filteredDocuments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground/60" />
                    <p className="font-medium text-foreground">No controlled documents found</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {searchTerm || selectedState !== "ALL" || selectedCategory !== "ALL"
                        ? "Try clearing or adjusting your search filters."
                        : "Create your first standard operating procedure to begin."}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredDocuments.map((doc) => (
                  <tr
                    key={doc.id}
                    data-testid="document-row"
                    className="hover:bg-muted/40 transition-colors group"
                  >
                    {/* Document Code */}
                    <td className="px-2.5 2xl:px-4 py-3 whitespace-nowrap">
                      <Link
                        href={`/documents/${doc.id}`}
                        className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-foreground hover:text-primary dark:hover:text-blue-400 transition-colors"
                      >
                        <span>{doc.documentCode}</span>
                        <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-primary dark:text-blue-400" />
                      </Link>
                    </td>

                    {/* Title & Category */}
                    <td className="px-2.5 2xl:px-4 py-3 min-w-0 max-w-[190px] 2xl:max-w-[260px]">
                      <Link
                        href={`/documents/${doc.id}`}
                        className="font-medium text-foreground hover:text-primary dark:hover:text-blue-400 transition-colors block truncate"
                      >
                        {doc.title}
                      </Link>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                        {doc.category && (
                          <span className="inline-block px-1.5 py-0.2 rounded bg-muted text-[11px]">
                            {doc.category}
                          </span>
                        )}
                        {doc.authorName && (
                          <span className="text-[11px] truncate">
                            Author: {doc.authorName}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Format */}
                    <td className="px-2.5 2xl:px-3 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                        {doc.contentFormat === "PDF" ? (
                          <>
                            <FileText className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                            <span>PDF</span>
                          </>
                        ) : (
                          <>
                            <FileCode className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                            <span>Markdown</span>
                          </>
                        )}
                      </span>
                    </td>

                    {/* Version */}
                    <td className="px-2.5 2xl:px-3 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded font-mono text-xs bg-muted text-foreground border border-border/80">
                        {doc.currentVersionLabel}
                      </span>
                      {doc.versionCount > 1 && (
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          ({doc.versionCount} revs)
                        </span>
                      )}
                    </td>

                    {/* Status Badge */}
                    <td className="px-2.5 2xl:px-4 py-3 whitespace-nowrap">
                      <LifecycleStatusBadge state={doc.lifecycleState} size="sm" />
                    </td>

                    {/* SHA-256 Digest */}
                    <td className="px-2.5 2xl:px-4 py-3 whitespace-nowrap">
                      <Sha256DigestChip digest={doc.documentSha256} />
                    </td>

                    {/* Updated At */}
                    <td className="hidden 2xl:table-cell px-4 py-3 whitespace-nowrap text-xs text-muted-foreground font-mono">
                      {formatDate(doc.updatedAt)}
                    </td>

                    {/* Action */}
                    <td className="px-2.5 2xl:px-4 py-3 whitespace-nowrap text-right">
                      <Link href={`/documents/${doc.id}`}>
                        <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs">
                          Workspace
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
