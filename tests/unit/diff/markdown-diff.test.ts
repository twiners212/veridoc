import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import {
  tenants,
  users,
  tenantMemberships,
  documents,
  documentVersions,
} from "@/db/schema";
import {
  testAdminDb,
  cleanupTestTenants,
  cleanupTestUsers,
} from "../../helpers/db";
import { computeMarkdownLineDiff } from "@/server/services/document-diff.service";
import { GET } from "@/app/api/documents/[documentId]/diff/route";

describe("Markdown Diff Algorithm & DEC-05 Format Enforcement (diff/route.ts)", () => {
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

  describe("2. Integration: GET /api/documents/[documentId]/diff endpoint & DEC-05 enforcement", () => {
    let tenantId: string;
    let authorUserId: string;
    let readerUserId: string;
    let documentId: string;
    let mdV1Id: string;
    let mdV2Id: string;
    let pdfVersionId: string;
    const userIds: string[] = [];
    const tenantIds: string[] = [];

    beforeAll(async () => {
      // 1. Tenant
      const [t] = await testAdminDb
        .insert(tenants)
        .values({
          name: "Diff Testing Workspace",
          slug: `diff-ws-${Date.now()}`,
        })
        .returning();
      tenantId = t.id;
      tenantIds.push(tenantId);

      // 2. Users
      const [author] = await testAdminDb
        .insert(users)
        .values({
          name: "Diff Author",
          email: `diff-author-${Date.now()}@veridoc.test`,
        })
        .returning();
      authorUserId = author.id;
      userIds.push(authorUserId);

      const [reader] = await testAdminDb
        .insert(users)
        .values({
          name: "Diff Reader",
          email: `diff-reader-${Date.now()}@veridoc.test`,
        })
        .returning();
      readerUserId = reader.id;
      userIds.push(readerUserId);

      // 3. Memberships
      await testAdminDb.insert(tenantMemberships).values([
        {
          tenantId,
          userId: authorUserId,
          role: "DOCUMENT_AUTHOR",
          status: "ACTIVE",
        },
        {
          tenantId,
          userId: readerUserId,
          role: "READER",
          status: "ACTIVE",
        },
      ]);

      // 4. Document
      const [doc] = await testAdminDb
        .insert(documents)
        .values({
          tenantId,
          documentCode: `SOP-DIFF-${Date.now()}`,
          createdBy: authorUserId,
        })
        .returning();
      documentId = doc.id;

      // 5. Version 1 (Markdown)
      const [v1] = await testAdminDb
        .insert(documentVersions)
        .values({
          tenantId,
          documentId,
          versionMajor: 1,
          versionMinor: 0,
          title: "SOP V1",
          contentFormat: "MARKDOWN",
          markdownContent: "# Title\n\nIntro text\nSection 1",
          lifecycleState: "PUBLISHED",
          documentSha256: "a".repeat(64),
          authorId: authorUserId,
          rowVersion: 1,
        })
        .returning();
      mdV1Id = v1.id;

      // 6. Version 2 (Markdown)
      const [v2] = await testAdminDb
        .insert(documentVersions)
        .values({
          tenantId,
          documentId,
          versionMajor: 1,
          versionMinor: 1,
          title: "SOP V2",
          contentFormat: "MARKDOWN",
          markdownContent: "# Title\n\nIntro text updated\nSection 1\nSection 2",
          lifecycleState: "DRAFT",
          authorId: authorUserId,
          rowVersion: 1,
        })
        .returning();
      mdV2Id = v2.id;

      // 7. Version 3 (PDF attachment)
      const [vPdf] = await testAdminDb
        .insert(documentVersions)
        .values({
          tenantId,
          documentId,
          versionMajor: 2,
          versionMinor: 0,
          title: "SOP V3 PDF",
          contentFormat: "PDF",
          fileStorageKey: `tenants/${tenantId}/documents/${documentId}/versions/file.pdf`,
          lifecycleState: "DRAFT",
          authorId: authorUserId,
          rowVersion: 1,
        })
        .returning();
      pdfVersionId = vPdf.id;
    });

    afterAll(async () => {
      await cleanupTestTenants(tenantIds);
      await cleanupTestUsers(userIds);
    });

    it("successfully returns structured Markdown diff between two markdown versions", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/documents/${documentId}/diff?vA=${mdV1Id}&vB=${mdV2Id}`,
        {
          method: "GET",
          headers: {
            "x-user-id": authorUserId,
            "x-tenant-id": tenantId,
          },
        }
      );

      const res = await GET(req, {
        params: Promise.resolve({ documentId }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toBeDefined();
      expect(body.data.baseVersionId).toBe(mdV1Id);
      expect(body.data.targetVersionId).toBe(mdV2Id);
      expect(body.data.stats.additions).toBeGreaterThan(0);
      expect(body.data.lines).toBeInstanceOf(Array);
    });

    it("returns HTTP 422 UNSUPPORTED_DIFF_FORMAT when comparing a Markdown version with a PDF version (DEC-05)", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/documents/${documentId}/diff?vA=${mdV1Id}&vB=${pdfVersionId}`,
        {
          method: "GET",
          headers: {
            "x-user-id": authorUserId,
            "x-tenant-id": tenantId,
          },
        }
      );

      const res = await GET(req, {
        params: Promise.resolve({ documentId }),
      });

      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.error?.code).toBe("UNSUPPORTED_DIFF_FORMAT");
      expect(body.error?.message).toContain("DEC-05");
    });

    it("rejects Readers with HTTP 403 FORBIDDEN", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/documents/${documentId}/diff?vA=${mdV1Id}&vB=${mdV2Id}`,
        {
          method: "GET",
          headers: {
            "x-user-id": readerUserId,
            "x-tenant-id": tenantId,
          },
        }
      );

      const res = await GET(req, {
        params: Promise.resolve({ documentId }),
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error?.code).toBe("FORBIDDEN");
    });
  });
});
