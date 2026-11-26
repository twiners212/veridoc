import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
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
import { GET } from "@/app/api/documents/[documentId]/diff/route";

describe("GET /api/documents/[documentId]/diff & DEC-05 format enforcement", () => {
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
    const [t] = await testAdminDb
      .insert(tenants)
      .values({
        name: "Diff Testing Workspace",
        slug: `diff-ws-${Date.now()}`,
      })
      .returning();
    tenantId = t.id;
    tenantIds.push(tenantId);

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

    const [doc] = await testAdminDb
      .insert(documents)
      .values({
        tenantId,
        documentCode: `SOP-DIFF-${Date.now()}`,
        createdBy: authorUserId,
      })
      .returning();
    documentId = doc.id;

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
