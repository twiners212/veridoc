import * as React from "react";
import { redirect } from "next/navigation";
import { ToReadQueue } from "@/components/features/reader/to-read-queue";
import type { ReadAssignmentItem } from "@/components/features/reader/reader.types";
import { loadToReadPageBundleAction } from "@/server/actions/dashboard-loaders.actions";

interface ToReadPageProps {
  searchParams?: Promise<{
    tab?: string;
  }>;
}

export default async function ToReadPage({ searchParams }: ToReadPageProps) {
  const [bundle, params] = await Promise.all([
    loadToReadPageBundleAction(),
    searchParams,
  ]);

  if (bundle.status === "UNAUTHENTICATED") {
    redirect("/auth/sign-in");
  }

  const { authContext: ctx, readQueue } = bundle;
  const initialTab = params?.tab === "completed" ? "completed" : "pending";

  const items = readQueue.assignments || readQueue.items;
  const initialAssignments: ReadAssignmentItem[] = Array.isArray(items)
    ? items.map((item) => ({
        id: item.assignmentId || item.id,
        documentId: item.documentId,
        documentVersionId: item.documentVersionId || item.versionId,
        documentCode: item.documentCode,
        title: item.title,
        version: item.version || item.versionLabel,
        category: item.category,
        targetGroupName: item.targetGroupName || item.groupName,
        contentFormat: item.contentFormat,
        documentSha256: item.documentSha256,
        dueAt: item.dueAt,
        isOverdue: item.isOverdue,
        daysUntilDue: item.daysUntilDue,
        status: item.status,
        markdownContent: item.markdownContent,
        fileStorageKey: item.fileStorageKey,
        effectiveDate: item.effectiveDate,
        acknowledgedAt:
          item.acknowledgedAt || item.acknowledgment?.acknowledgedAt,
        acknowledgmentId: item.acknowledgmentId || item.acknowledgment?.id,
      }))
    : [];

  return (
    <ToReadQueue
      initialAssignments={initialAssignments}
      initialTab={initialTab}
      currentUser={{
        id: ctx.userId,
        name: ctx.userName,
        role: ctx.role.replace(/_/g, " "),
        department: ctx.tenantName,
        site: ctx.tenantSlug,
      }}
    />
  );
}
