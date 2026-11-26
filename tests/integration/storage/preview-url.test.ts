import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import {
  tenants,
  users,
  tenantMemberships,
  documents,
  documentVersions,
  approvalCycles,
  approvalSteps,
} from "@/db/schema";
import {
  testAdminDb,
  cleanupTestTenants,
  cleanupTestUsers,
} from "../../helpers/db";
import { installPlaceholderStorageFetchStub } from "../../helpers/storage-ci-stub";
import { GET } from "@/app/api/documents/[documentId]/versions/[versionId]/preview-url/route";
import { uploadDocumentPdf, deleteDocumentPdf } from "@/lib/storage/storage.service";

describe("Signed Preview URL & RBAC Document Visibility (preview-url/route.ts)", () => {
  let restoreStorageStub: () => void = () => {};
  let tenantId: string;
  let adminUserId: string;
  let authorUserId: string;
  let readerUserId: string;
  let assignedApproverId: string;
  let unassignedApproverId: string;
  let documentId: string;
  let draftVersionId: string;
  let pendingVersionId: string;
  let publishedVersionId: string;
  const userIds: string[] = [];
  const tenantIds: string[] = [];

  let draftStorageKey: string;
  let pendingStorageKey: string;
  let pubStorageKey: string;

  beforeAll(async () => {
    restoreStorageStub = installPlaceholderStorageFetchStub();
    // 1. Create Workspace
    const [t] = await testAdminDb
      .insert(tenants)
      .values({
        name: "Preview URL Security Workspace",
        slug: `preview-ws-${Date.now()}`,
      })
      .returning();
    tenantId = t.id;
    tenantIds.push(tenantId);

    // 2. Create Users (Admin, Author, Reader)
    const [admin] = await testAdminDb
      .insert(users)
      .values({
        name: "Workspace Admin",
        email: `admin-prev-${Date.now()}@veridoc.test`,
      })
      .returning();
    adminUserId = admin.id;
    userIds.push(adminUserId);

    const [author] = await testAdminDb
      .insert(users)
      .values({
        name: "SOP Author",
        email: `author-prev-${Date.now()}@veridoc.test`,
      })
      .returning();
    authorUserId = author.id;
    userIds.push(authorUserId);

    const [reader] = await testAdminDb
      .insert(users)
      .values({
        name: "Frontline Reader",
        email: `reader-prev-${Date.now()}@veridoc.test`,
      })
      .returning();
    readerUserId = reader.id;
    userIds.push(readerUserId);

    const [assignedApprover] = await testAdminDb
      .insert(users)
      .values({
        name: "Assigned Approver",
        email: `assigned-prev-${Date.now()}@veridoc.test`,
      })
      .returning();
    assignedApproverId = assignedApprover.id;
    userIds.push(assignedApproverId);

    const [unassignedApprover] = await testAdminDb
      .insert(users)
      .values({
        name: "Unassigned Approver",
        email: `unassigned-prev-${Date.now()}@veridoc.test`,
      })
      .returning();
    unassignedApproverId = unassignedApprover.id;
    userIds.push(unassignedApproverId);

    // 3. Create Memberships
    await testAdminDb.insert(tenantMemberships).values([
      {
        tenantId,
        userId: adminUserId,
        role: "WORKSPACE_ADMIN",
        status: "ACTIVE",
      },
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
      {
        tenantId,
        userId: assignedApproverId,
        role: "APPROVER_REVIEWER",
        status: "ACTIVE",
      },
      {
        tenantId,
        userId: unassignedApproverId,
        role: "APPROVER_REVIEWER",
        status: "ACTIVE",
      },
    ]);

    // 4. Create Document
    const [doc] = await testAdminDb
      .insert(documents)
      .values({
        tenantId,
        documentCode: `SOP-PRV-${Date.now()}`,
        createdBy: authorUserId,
      })
      .returning();
    documentId = doc.id;

    // Upload authentic sample PDFs to Supabase private storage bucket
    const samplePdf = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
    const draftUpload = await uploadDocumentPdf(tenantId, documentId, "draft-file", samplePdf);
    const pendingUpload = await uploadDocumentPdf(tenantId, documentId, "pending-file", samplePdf);
    const pubUpload = await uploadDocumentPdf(tenantId, documentId, "pub-file", samplePdf);
    draftStorageKey = draftUpload.storageKey;
    pendingStorageKey = pendingUpload.storageKey;
    pubStorageKey = pubUpload.storageKey;

    // 5. Create Draft Version with PDF storage key
    const [draftVer] = await testAdminDb
      .insert(documentVersions)
      .values({
        tenantId,
        documentId,
        versionMajor: 0,
        versionMinor: 1,
        title: "Draft SOP (Not Published)",
        contentFormat: "PDF",
        fileStorageKey: draftStorageKey,
        fileSha256: draftUpload.fileSha256,
        documentSha256: "2222222222222222222222222222222222222222222222222222222222222222",
        lifecycleState: "DRAFT",
        authorId: authorUserId,
        rowVersion: 1,
      })
      .returning();
    draftVersionId = draftVer.id;

    // 6. Create Published Version with PDF storage key
    const [pubVer] = await testAdminDb
      .insert(documentVersions)
      .values({
        tenantId,
        documentId,
        versionMajor: 1,
        versionMinor: 0,
        title: "Published SOP (Controlled)",
        contentFormat: "PDF",
        fileStorageKey: pubStorageKey,
        fileSha256: pubUpload.fileSha256,
        documentSha256: "4444444444444444444444444444444444444444444444444444444444444444",
        lifecycleState: "PUBLISHED",
        authorId: authorUserId,
        rowVersion: 1,
      })
      .returning();
    publishedVersionId = pubVer.id;

    const [pendingVer] = await testAdminDb
      .insert(documentVersions)
      .values({
        tenantId,
        documentId,
        versionMajor: 1,
        versionMinor: 1,
        title: "Pending Approval PDF SOP",
        contentFormat: "PDF",
        fileStorageKey: pendingStorageKey,
        fileSha256: pendingUpload.fileSha256,
        documentSha256: "3333333333333333333333333333333333333333333333333333333333333333",
        lifecycleState: "PENDING_APPROVAL",
        authorId: authorUserId,
        rowVersion: 2,
      })
      .returning();
    pendingVersionId = pendingVer.id;

    const [cycle] = await testAdminDb
      .insert(approvalCycles)
      .values({
        tenantId,
        documentVersionId: pendingVersionId,
        cycleNumber: 1,
        submittedBy: authorUserId,
        submittedSha256: "3333333333333333333333333333333333333333333333333333333333333333",
        status: "IN_PROGRESS",
      })
      .returning();

    await testAdminDb.insert(approvalSteps).values({
      tenantId,
      approvalCycleId: cycle.id,
      stepOrder: 1,
      assignedApproverId,
      status: "PENDING",
    });
  });

  afterAll(async () => {
    if (draftStorageKey) await deleteDocumentPdf(draftStorageKey).catch(() => {});
    if (pendingStorageKey) await deleteDocumentPdf(pendingStorageKey).catch(() => {});
    if (pubStorageKey) await deleteDocumentPdf(pubStorageKey).catch(() => {});
    restoreStorageStub();
    await cleanupTestTenants(tenantIds);
    await cleanupTestUsers(userIds);
  });

  it("author receives signed preview URL with TTL <= 120s for own draft version", async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/documents/${documentId}/versions/${draftVersionId}/preview-url`,
      {
        method: "GET",
        headers: {
          "x-user-id": authorUserId,
          "x-tenant-id": tenantId,
        },
      }
    );

    const now = Date.now();
    const res = await GET(req, {
      params: Promise.resolve({ documentId, versionId: draftVersionId }),
    });
    const responseTime = Date.now();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.signedUrl).toContain("token=");

    // Verify TTL is <= 120s from generation time
    const expiresAtMs = new Date(body.data.expiresAt).getTime();
    expect(expiresAtMs).toBeGreaterThan(now);
    expect(expiresAtMs).toBeLessThanOrEqual(responseTime + 121 * 1000);
  });

  it("admin receives signed preview URL for any draft version", async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/documents/${documentId}/versions/${draftVersionId}/preview-url`,
      {
        method: "GET",
        headers: {
          "x-user-id": adminUserId,
          "x-tenant-id": tenantId,
        },
      }
    );

    const res = await GET(req, {
      params: Promise.resolve({ documentId, versionId: draftVersionId }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.signedUrl).toBeDefined();
  });

  it("reader receives HTTP 404 NOT_FOUND (anti-enumeration) when requesting preview URL for DRAFT version", async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/documents/${documentId}/versions/${draftVersionId}/preview-url`,
      {
        method: "GET",
        headers: {
          "x-user-id": readerUserId,
          "x-tenant-id": tenantId,
        },
      }
    );

    const res = await GET(req, {
      params: Promise.resolve({ documentId, versionId: draftVersionId }),
    });

    // Must be 404 NOT_FOUND per anti-enumeration requirements
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error?.code).toBe("NOT_FOUND");
  });

  it("reader successfully receives signed preview URL for PUBLISHED version", async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/documents/${documentId}/versions/${publishedVersionId}/preview-url`,
      {
        method: "GET",
        headers: {
          "x-user-id": readerUserId,
          "x-tenant-id": tenantId,
        },
      }
    );

    const res = await GET(req, {
      params: Promise.resolve({ documentId, versionId: publishedVersionId }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.signedUrl).toContain("token=");
    expect(body.data.documentSha256).toBe("4444444444444444444444444444444444444444444444444444444444444444");
  });

  it("assigned APPROVER_REVIEWER receives signed preview URL for assigned PENDING_APPROVAL PDF (AUD-004)", async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/documents/${documentId}/versions/${pendingVersionId}/preview-url`,
      {
        method: "GET",
        headers: {
          "x-user-id": assignedApproverId,
          "x-tenant-id": tenantId,
        },
      }
    );

    const res = await GET(req, {
      params: Promise.resolve({ documentId, versionId: pendingVersionId }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data?.signedUrl).toContain("token=");
  });

  it("unassigned APPROVER_REVIEWER receives 403 FORBIDDEN for PENDING_APPROVAL PDF", async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/documents/${documentId}/versions/${pendingVersionId}/preview-url`,
      {
        method: "GET",
        headers: {
          "x-user-id": unassignedApproverId,
          "x-tenant-id": tenantId,
        },
      }
    );

    const res = await GET(req, {
      params: Promise.resolve({ documentId, versionId: pendingVersionId }),
    });

    expect(res.status).toBe(403);
  });
});
