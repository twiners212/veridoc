import { describe, it, expect } from "vitest";
import { computeMarkdownLineDiff } from "@/server/services/document-diff.service";

describe("Markdown Diff Algorithm (computeMarkdownLineDiff)", () => {
  describe("1. Unit: computeMarkdownLineDiff algorithm", () => {
    it("correctly identifies unchanged, added, and removed lines", () => {
      const v1 = "Step 1: Prep\nStep 2: Clean\nStep 3: Discard";
      const v2 = "Step 1: Prep\nStep 2: Sanitize\nStep 3: Discard\nStep 4: Log";

      const { lines, stats } = computeMarkdownLineDiff(v1, v2);

      expect(stats.unchanged).toBe(2); // Step 1 and Step 3
      expect(stats.deletions).toBe(1); // Step 2: Clean
      expect(stats.additions).toBe(2); // Step 2: Sanitize and Step 4: Log

      const added = lines.filter((l) => l.type === "added");
      const removed = lines.filter((l) => l.type === "removed");
      const unchanged = lines.filter((l) => l.type === "unchanged");

      expect(added.map((l) => l.content)).toEqual(["Step 2: Sanitize", "Step 4: Log"]);
      expect(removed.map((l) => l.content)).toEqual(["Step 2: Clean"]);
      expect(unchanged.map((l) => l.content)).toEqual(["Step 1: Prep", "Step 3: Discard"]);
    });

    it("handles empty texts gracefully", () => {
      const res = computeMarkdownLineDiff("", "");
      expect(res.stats).toEqual({ additions: 0, deletions: 0, unchanged: 0 });
      expect(res.lines).toHaveLength(0);
    });

    it("handles complete replacement of content", () => {
      const v1 = "Line A\nLine B";
      const v2 = "Line C\nLine D";

      const { stats } = computeMarkdownLineDiff(v1, v2);
      expect(stats.deletions).toBe(2);
      expect(stats.additions).toBe(2);
      expect(stats.unchanged).toBe(0);
    });
  });
});
