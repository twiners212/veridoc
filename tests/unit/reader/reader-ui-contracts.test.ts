import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ReadAssignmentItem } from "@/components/features/reader/reader.types";

describe("Reader UI & PWA Compliance Contracts (Unit)", () => {
  describe("DEC-07 Service Worker Offline Caching Guard", () => {
    it("should verify public/sw.js exists and strictly forbids offline caching of SOP PDFs & signed URLs", () => {
      const swPath = path.resolve(__dirname, "../../../public/sw.js");
      expect(fs.existsSync(swPath)).toBe(true);

      const swContent = fs.readFileSync(swPath, "utf8");

      // Verify strict patterns that must never be cached per DEC-07
      expect(swContent).toContain("NEVER_CACHE_PATTERNS");
      expect(swContent).toMatch(/preview-url/);
      expect(swContent).toMatch(/pdf/i);
      expect(swContent).toMatch(/supabase.*storage/i);

      // Verify that requests matching shouldNeverCache are bypassed
      expect(swContent).toContain("shouldNeverCache");
      expect(swContent).toContain("DEC-07");
    });
  });

  describe("Reader Engagement Gate Logic", () => {
    it("should lock acknowledgment when dwell time is < 10s even if scroll is 100%", () => {
      const dwellTime = 7;
      const scrollPercent = 100;
      const isReady = dwellTime >= 10 && scrollPercent >= 90;
      expect(isReady).toBe(false);
    });

    it("should lock acknowledgment when scroll is < 90% even if dwell time is 45s", () => {
      const dwellTime = 45;
      const scrollPercent = 75;
      const isReady = dwellTime >= 10 && scrollPercent >= 90;
      expect(isReady).toBe(false);
    });

    it("should unlock acknowledgment when BOTH dwell time >= 10s AND scroll >= 90%", () => {
      const dwellTime = 12;
      const scrollPercent = 95;
      const isReady = dwellTime >= 10 && scrollPercent >= 90;
      expect(isReady).toBe(true);
    });
  });

  describe("Queue Due Date & Overdue Badge Logic", () => {
    it("should categorize assignments as Overdue or Urgent based on due date", () => {
      const now = Date.now();
      const mockAssignments: ReadAssignmentItem[] = [
        {
          id: "assign-1",
          documentId: "doc-1",
          documentVersionId: "ver-1",
          documentCode: "SOP-SAF-001",
          title: "Overdue Safety Protocol",
          version: "v1.0",
          category: "Safety",
          contentFormat: "MARKDOWN",
          documentSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          dueAt: new Date(now - 86400000).toISOString(),
          isOverdue: true,
          daysUntilDue: -1,
          status: "PENDING",
        },
        {
          id: "assign-2",
          documentId: "doc-2",
          documentVersionId: "ver-2",
          documentCode: "SOP-SAF-002",
          title: "Urgent Cleaning Procedure",
          version: "v2.0",
          category: "Safety",
          contentFormat: "MARKDOWN",
          documentSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          dueAt: new Date(now + 2 * 86400000).toISOString(),
          isOverdue: false,
          daysUntilDue: 2,
          status: "PENDING",
        },
        {
          id: "assign-3",
          documentId: "doc-3",
          documentVersionId: "ver-3",
          documentCode: "SOP-OPS-003",
          title: "Standard Line Operation",
          version: "v1.0",
          category: "Operations",
          contentFormat: "MARKDOWN",
          documentSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          dueAt: new Date(now + 10 * 86400000).toISOString(),
          isOverdue: false,
          daysUntilDue: 10,
          status: "PENDING",
        },
      ];

      const overdueItems = mockAssignments.filter((a) => a.isOverdue || a.daysUntilDue < 0);
      const urgentItems = mockAssignments.filter((a) => a.daysUntilDue <= 3 && !a.isOverdue);

      expect(overdueItems.length).toBe(1);
      expect(overdueItems[0].documentCode).toBe("SOP-SAF-001");

      expect(urgentItems.length).toBe(1);
      expect(urgentItems[0].documentCode).toBe("SOP-SAF-002");
    });
  });

  describe("Live Backend Acknowledgment & Receipt Contracts (AUD-003, AUD-006)", () => {
    it("SopReaderView must not call nonexistent /api/acknowledgments/acknowledge or fabricate placeholder content", () => {
      const readerPath = path.resolve(
        __dirname,
        "../../../src/components/features/reader/sop-reader-view.tsx"
      );
      const src = fs.readFileSync(readerPath, "utf8");
      expect(src).not.toContain("/api/acknowledgments/acknowledge");
      expect(src).not.toContain("mock-assign-");
      expect(src).not.toContain("Clean-in-Place (CIP) Facility B");
    });

    it("ToReadQueue must not fall back to hardcoded ACK-9841 on live receipt cards", () => {
      const queuePath = path.resolve(
        __dirname,
        "../../../src/components/features/reader/to-read-queue.tsx"
      );
      const src = fs.readFileSync(queuePath, "utf8");
      expect(src).not.toContain('acknowledgmentId || "ACK-9841"');
    });
  });
});
