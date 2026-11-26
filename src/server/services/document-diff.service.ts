import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type { TenantTransaction } from "@/db/context";
import { documentVersions } from "@/db/schema";
import { DomainError } from "@/types/errors";

export type DiffLineType = "unchanged" | "added" | "removed";

export interface DiffLine {
  type: DiffLineType;
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface MarkdownDiffResult {
  baseVersionId: string;
  targetVersionId: string;
  baseVersionLabel: string;
  targetVersionLabel: string;
  lines: DiffLine[];
  diff: DiffLine[]; // alias for lines to support diverse UI consumers
  stats: {
    additions: number;
    deletions: number;
    unchanged: number;
  };
}

/**
 * Computes deterministic line-by-line diff between two Markdown texts using LCS.
 */
export function computeMarkdownLineDiff(
  oldText: string,
  newText: string
): { lines: DiffLine[]; stats: { additions: number; deletions: number; unchanged: number } } {
  const normOld = oldText ? oldText.normalize("NFC").replace(/\r\n/g, "\n").replace(/\r/g, "\n") : "";
  const normNew = newText ? newText.normalize("NFC").replace(/\r\n/g, "\n").replace(/\r/g, "\n") : "";

  const a = normOld.length > 0 ? normOld.split("\n") : [];
  const b = normNew.length > 0 ? normNew.split("\n") : [];

  const m = a.length;
  const n = b.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (a[i] === b[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const diffLines: DiffLine[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      diffLines.push({
        type: "unchanged",
        content: a[i - 1],
        oldLineNumber: i,
        newLineNumber: j,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diffLines.push({
        type: "added",
        content: b[j - 1],
        newLineNumber: j,
      });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      diffLines.push({
        type: "removed",
        content: a[i - 1],
        oldLineNumber: i,
      });
      i--;
    }
  }

  diffLines.reverse();

  let additions = 0;
  let deletions = 0;
  let unchanged = 0;

  for (const line of diffLines) {
    if (line.type === "added") additions++;
    else if (line.type === "removed") deletions++;
    else unchanged++;
  }

  return {
    lines: diffLines,
    stats: { additions, deletions, unchanged },
  };
}

/**
 * Service to compare two document versions in Markdown format.
 * Rejects non-Markdown or PDF versions with 422 UNSUPPORTED_DIFF_FORMAT (DEC-05).
 */
export async function getDocumentVersionDiff(
  tx: TenantTransaction,
  tenantId: string,
  documentId: string,
  baseVersionId: string,
  targetVersionId: string
): Promise<MarkdownDiffResult> {
  const versions = await tx
    .select({
      id: documentVersions.id,
      versionLabel: documentVersions.versionLabel,
      contentFormat: documentVersions.contentFormat,
      markdownContent: documentVersions.markdownContent,
      fileStorageKey: documentVersions.fileStorageKey,
      lifecycleState: documentVersions.lifecycleState,
      authorId: documentVersions.authorId,
    })
    .from(documentVersions)
    .where(
      and(
        eq(documentVersions.tenantId, tenantId),
        eq(documentVersions.documentId, documentId),
        inArray(documentVersions.id, [baseVersionId, targetVersionId])
      )
    );

  const baseVersion = versions.find((v) => v.id === baseVersionId);
  const targetVersion = versions.find((v) => v.id === targetVersionId);

  if (!baseVersion || !targetVersion) {
    throw new DomainError("NOT_FOUND", "One or both document versions not found", 404);
  }

  // DEC-05 check: Non-Markdown or attached PDF versions cannot be diffed textually in Slice 1
  if (
    baseVersion.contentFormat !== "MARKDOWN" ||
    targetVersion.contentFormat !== "MARKDOWN" ||
    Boolean(baseVersion.fileStorageKey) ||
    Boolean(targetVersion.fileStorageKey)
  ) {
    throw new DomainError(
      "UNSUPPORTED_DIFF_FORMAT",
      "Textual diffing is only supported for Markdown versions without PDF attachments in Slice 1 (DEC-05)",
      422
    );
  }

  const { lines, stats } = computeMarkdownLineDiff(
    baseVersion.markdownContent ?? "",
    targetVersion.markdownContent ?? ""
  );

  return {
    baseVersionId,
    targetVersionId,
    baseVersionLabel: baseVersion.versionLabel ?? "",
    targetVersionLabel: targetVersion.versionLabel ?? "",
    lines,
    diff: lines,
    stats,
  };
}
