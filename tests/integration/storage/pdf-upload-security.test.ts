import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import {
  tenants,
  users,
  tenantMemberships,
  documents,
  documentVersions,
  auditLogs,
} from "@/db/schema";
import {
  testAdminDb,
  adminClient,
  cleanupTestTenants,
  cleanupTestUsers,
} from "../../helpers/db";
import { installPlaceholderStorageFetchStub } from "../../helpers/storage-ci-stub";
import { POST } from "@/app/api/documents/[documentId]/versions/[versionId]/upload/route";

describe("PDF Upload Security & Storage Boundary (POST /api/documents/.../upload)", () => {
  let restoreStorageStub: () => void = () => {};
  let tenantId: string;
  let authorUserId: string;
  let adminUserId: string;
  let documentId: string;
  let draftVersionId: string;
  let approvedVersionId: string;
  let publishedVersionId: string;
  const userIds: string[] = [];
  const tenantIds: string[] = [];

  beforeAll(async () => {
    restoreStorageStub = installPlaceholderStorageFetchStub();
    // 1. Create Workspace
    const [t] = await testAdminDb
      .insert(tenants)
      .values({
        name: "Upload Security Workspace",
        slug: `upload-ws-${Date.now()}`,
      })
      .returning();
    tenantId = t.id;
    tenantIds.push(tenantId);

    // 2. Create Users
    const [author] = await testAdminDb
      .insert(users)
      .values({
        name: "SOP Author",
        email: `author-upload-${Date.now()}@veridoc.test`,
      })
      .returning();
    authorUserId = author.id;
    userIds.push(authorUserId);

    const [admin] = await testAdminDb
      .insert(users)
      .values({
        name: "Admin User",
        email: `admin-upload-${Date.now()}@veridoc.test`,
      })
      .returning();
    adminUserId = admin.id;
    userIds.push(adminUserId);

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
        userId: adminUserId,
        role: "WORKSPACE_ADMIN",
        status: "ACTIVE",
      },
    ]);

    // 4. Create Document
    const [doc] = await testAdminDb
      .insert(documents)
      .values({
        tenantId,
        documentCode: `SOP-UPL-${Date.now()}`,
        createdBy: authorUserId,
      })
      .returning();
    documentId = doc.id;

    // 5. Create Draft Version
    const [draftVer] = await testAdminDb
      .insert(documentVersions)
      .values({
        tenantId,
        documentId,
        versionMajor: 0,
        versionMinor: 1,
        title: "Draft SOP for Upload Testing",
        contentFormat: "PDF",
        lifecycleState: "DRAFT",
        authorId: authorUserId,
        rowVersion: 1,
      })
      .returning();
    draftVersionId = draftVer.id;

    // 6. Create Approved Version
    const [approvedVer] = await testAdminDb
      .insert(documentVersions)
      .values({
        tenantId,
        documentId,
        versionMajor: 0,
        versionMinor: 2,
        title: "Approved SOP for Upload Testing",
        contentFormat: "PDF",
        lifecycleState: "APPROVED",
        documentSha256: "b".repeat(64),
        authorId: authorUserId,
        rowVersion: 1,
      })
      .returning();
    approvedVersionId = approvedVer.id;

    // 7. Create Published Version
    const [publishedVer] = await testAdminDb
      .insert(documentVersions)
      .values({
        tenantId,
        documentId,
        versionMajor: 1,
        versionMinor: 0,
        title: "Published SOP for Upload Testing",
        contentFormat: "PDF",
        lifecycleState: "PUBLISHED",
        documentSha256: "c".repeat(64),
        authorId: authorUserId,
        rowVersion: 1,
      })
      .returning();
    publishedVersionId = publishedVer.id;
  });

  afterAll(async () => {
    restoreStorageStub();
    await cleanupTestTenants(tenantIds);
    await cleanupTestUsers(userIds);
  });

  it("authoritatively rejects spoofed PDF without %PDF- magic bytes with HTTP 400 INVALID_FILE_PAYLOAD", async () => {
    const formData = new FormData();
    const fakeContent = Buffer.from("<html><body>Malicious HTML disguised as PDF</body></html>");
    formData.append("file", new Blob([fakeContent], { type: "application/pdf" }), "fake.pdf");
    formData.append("expectedRowVersion", "1");

    const req = new NextRequest(
      `http://localhost:3000/api/documents/${documentId}/versions/${draftVersionId}/upload`,
      {
        method: "POST",
        headers: {
          "x-user-id": authorUserId,
          "x-tenant-id": tenantId,
        },
        body: formData,
      }
    );

    const response = await POST(req, {
      params: Promise.resolve({ documentId, versionId: draftVersionId }),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error?.code).toBe("INVALID_FILE_PAYLOAD");
    expect(body.error?.message).toContain("Invalid PDF magic bytes");
  });

  it("rejects empty files (0 bytes) with HTTP 400 INVALID_FILE_PAYLOAD", async () => {
    const formData = new FormData();
    formData.append("file", new Blob([], { type: "application/pdf" }), "empty.pdf");

    const req = new NextRequest(
      `http://localhost:3000/api/documents/${documentId}/versions/${draftVersionId}/upload`,
      {
        method: "POST",
        headers: {
          "x-user-id": authorUserId,
          "x-tenant-id": tenantId,
        },
        body: formData,
      }
    );

    const response = await POST(req, {
      params: Promise.resolve({ documentId, versionId: draftVersionId }),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error?.code).toBe("INVALID_FILE_PAYLOAD");
    expect(body.error?.message).toContain("File size must be > 0");
  });

  it("authoritatively rejects files exceeding 50MB limit with HTTP 400 INVALID_FILE_PAYLOAD", async () => {
    const formData = new FormData();
    // Real 50MB + 1 byte payload: 52428801 bytes
    const oversizedBuffer = Buffer.alloc(52428801);
    oversizedBuffer.write("%PDF-oversized");
    formData.append("file", new Blob([oversizedBuffer], { type: "application/pdf" }), "large.pdf");

    const req = new NextRequest(
      `http://localhost:3000/api/documents/${documentId}/versions/${draftVersionId}/upload`,
      {
        method: "POST",
        headers: {
          "x-user-id": authorUserId,
          "x-tenant-id": tenantId,
        },
        body: formData,
      }
    );

    const response = await POST(req, {
      params: Promise.resolve({ documentId, versionId: draftVersionId }),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error?.code).toBe("INVALID_FILE_PAYLOAD");
    expect(body.error?.message).toContain("50MB");
  });

  it("rejects uploads to immutable versions (APPROVED) with HTTP 409 VERSION_IMMUTABLE", async () => {
    const formData = new FormData();
    const validPdfBytes = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
    formData.append("file", new Blob([validPdfBytes], { type: "application/pdf" }), "test.pdf");
    formData.append("expectedRowVersion", "1");

    const req = new NextRequest(
      `http://localhost:3000/api/documents/${documentId}/versions/${approvedVersionId}/upload`,
      {
        method: "POST",
        headers: {
          "x-user-id": authorUserId,
          "x-tenant-id": tenantId,
        },
        body: formData,
      }
    );

    const response = await POST(req, {
      params: Promise.resolve({ documentId, versionId: approvedVersionId }),
    });

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error?.code).toBe("VERSION_IMMUTABLE");
  });

  it("rejects uploads to immutable versions (PUBLISHED) with HTTP 409 VERSION_IMMUTABLE", async () => {
    const formData = new FormData();
    const validPdfBytes = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
    formData.append("file", new Blob([validPdfBytes], { type: "application/pdf" }), "test.pdf");
    formData.append("expectedRowVersion", "1");

    const req = new NextRequest(
      `http://localhost:3000/api/documents/${documentId}/versions/${publishedVersionId}/upload`,
      {
        method: "POST",
        headers: {
          "x-user-id": authorUserId,
          "x-tenant-id": tenantId,
        },
        body: formData,
      }
    );

    const response = await POST(req, {
      params: Promise.resolve({ documentId, versionId: publishedVersionId }),
    });

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error?.code).toBe("VERSION_IMMUTABLE");
  });

  it("successfully processes authentic %PDF- file into private bucket for DRAFT version", async () => {
    const formData = new FormData();
    const validPdfBytes = Buffer.from(
      "%PDF-1.7\n" +
        "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n" +
        "2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n" +
        "xref\n0 3\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n" +
        "trailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n102\n%%EOF\n"
    );
    formData.append("file", new Blob([validPdfBytes], { type: "application/pdf" }), "authentic.pdf");
    formData.append("expectedRowVersion", "1");

    const req = new NextRequest(
      `http://localhost:3000/api/documents/${documentId}/versions/${draftVersionId}/upload`,
      {
        method: "POST",
        headers: {
          "x-user-id": authorUserId,
          "x-tenant-id": tenantId,
        },
        body: formData,
      }
    );

    const response = await POST(req, {
      params: Promise.resolve({ documentId, versionId: draftVersionId }),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(body.data.versionId).toBe(draftVersionId);
    expect(body.data.fileSizeBytes).toBe(validPdfBytes.length);
    expect(body.data.fileSha256).toHaveLength(64);
    expect(body.data.documentSha256).toHaveLength(64);
    expect(body.data.rowVersion).toBe(2);

    // Verify row in PostgreSQL
    const [updatedRow] = await testAdminDb
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.id, draftVersionId));

    expect(updatedRow.fileStorageKey).toMatch(/^tenants\/.*\.pdf$/);
    expect(updatedRow.fileSha256).toBe(body.data.fileSha256);
    expect(updatedRow.documentSha256).toBe(body.data.documentSha256);
    expect(updatedRow.rowVersion).toBe(2);

    // Verify Audit Log entry
    const [auditEntry] = await testAdminDb
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.tenantId, tenantId),
          eq(auditLogs.entityId, draftVersionId),
          eq(auditLogs.eventType, "DOCUMENT_PDF_UPLOADED")
        )
      );
    expect(auditEntry).toBeDefined();
    expect(auditEntry.actorUserId).toBe(authorUserId);
  });
});
