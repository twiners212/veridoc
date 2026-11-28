import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, and } from "drizzle-orm";
import {
  tenants,
  users,
  tenantMemberships,
  documents,
  documentVersions,
  approvalCycles,
  approvalSteps,
  auditLogs,
} from "@/db/schema";
import {
  testAdminDb,
  testAppDb,
  adminClient,
  cleanupTestTenants,
  cleanupTestUsers,
} from "../../helpers/db";
import {
  createDocumentAction,
  updateDocumentVersionAction,
  createRevisionAction,
  listDocumentsAction,
  getDocumentDetailAction,
} from "@/server/actions/documents.actions";

describe("Document Authoring, Lifecycle & Concurrency Actions (documents.actions.ts)", () => {
  let tenantId: string;
  let authorUserId: string;
  let otherAuthorUserId: string;
  let readerUserId: string;
  let adminUserId: string;
  const userIds: string[] = [];
  const tenantIds: string[] = [];

  beforeAll(async () => {
    // 1. Create Workspace
    const [t] = await testAdminDb
      .insert(tenants)
      .values({
        name: "Document Actions Workspace",
        slug: `doc-actions-ws-${Date.now()}`,
      })
      .returning();
    tenantId = t.id;
    tenantIds.push(tenantId);

    // 2. Create Users
    const [author] = await testAdminDb
      .insert(users)
      .values({
        name: "Primary Author",
        email: `author-act-${Date.now()}@veridoc.test`,
      })
      .returning();
    authorUserId = author.id;
    userIds.push(authorUserId);

    const [otherAuthor] = await testAdminDb
      .insert(users)
      .values({
        name: "Secondary Author",
        email: `other-author-act-${Date.now()}@veridoc.test`,
      })
      .returning();
    otherAuthorUserId = otherAuthor.id;
    userIds.push(otherAuthorUserId);

    const [reader] = await testAdminDb
      .insert(users)
      .values({
        name: "Reader User",
        email: `reader-act-${Date.now()}@veridoc.test`,
      })
      .returning();
    readerUserId = reader.id;
    userIds.push(readerUserId);

    const [admin] = await testAdminDb
      .insert(users)
      .values({
        name: "Admin User",
        email: `admin-act-${Date.now()}@veridoc.test`,
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
        userId: otherAuthorUserId,
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
        userId: adminUserId,
        role: "WORKSPACE_ADMIN",
        status: "ACTIVE",
      },
    ]);
  });

  afterAll(async () => {
    await cleanupTestTenants(tenantIds);
    await cleanupTestUsers(userIds);
  });

  describe("1. createDocumentAction", () => {
    it("successfully creates document and initial draft v1.0 with canonical document_sha256 and audit logs", async () => {
      const code = `SOP-COR-${Date.now()}`;
      const res = await createDocumentAction(
        {
          tenantId,
          documentCode: code,
          title: "Cleanroom Disinfection Protocol",
          category: "Sterilization",
          description: "Core operating procedure for bio-cleanrooms",
          initialContent: "# Cleanroom Disinfection\n\n1. Disinfect tables.",
        },
        { userId: authorUserId, callerDb: testAppDb }
      );

      expect(res.success).toBe(true);
      if (!res.success) return;

      expect(res.data.documentId).toBeDefined();
      expect(res.data.versionId).toBeDefined();

      // Verify row in database
      const [ver] = await testAdminDb
        .select()
        .from(documentVersions)
        .where(eq(documentVersions.id, res.data.versionId));

      expect(ver.versionMajor).toBe(1);
      expect(ver.versionMinor).toBe(0);
      expect(ver.lifecycleState).toBe("DRAFT");
      expect(ver.rowVersion).toBe(1);
      expect(ver.documentSha256).toBeDefined();
      expect(ver.documentSha256).toHaveLength(64);

      // Verify audit logs
      const logs = await testAdminDb
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.tenantId, tenantId),
            eq(auditLogs.entityId, res.data.documentId)
          )
        );

      expect(logs.some((l) => l.eventType === "DOCUMENT_CREATED")).toBe(true);
    });

    it("rejects duplicate documentCode in the same tenant with HTTP 409", async () => {
      const code = `SOP-DUP-${Date.now()}`;
      const first = await createDocumentAction(
        {
          tenantId,
          documentCode: code,
          title: "Initial Doc",
        },
        { userId: authorUserId, callerDb: testAppDb }
      );
      expect(first.success).toBe(true);

      const duplicate = await createDocumentAction(
        {
          tenantId,
          documentCode: code,
          title: "Duplicate Doc Code",
        },
        { userId: authorUserId, callerDb: testAppDb }
      );

      expect(duplicate.success).toBe(false);
      if (duplicate.success) return;
      expect(duplicate.error.status).toBe(409);
      expect(duplicate.error.message).toContain("already exists");
    });

    it("rejects unauthorized roles (READER) with HTTP 403 FORBIDDEN", async () => {
      const res = await createDocumentAction(
        {
          tenantId,
          documentCode: `SOP-RDR-${Date.now()}`,
          title: "Reader Doc Attempt",
        },
        { userId: readerUserId, callerDb: testAppDb }
      );

      expect(res.success).toBe(false);
      if (res.success) return;
      expect(res.error.status).toBe(403);
    });
  });

  describe("2. updateDocumentVersionAction & Concurrency / Immutability Guards", () => {
    let docId: string;
    let verId: string;

    beforeAll(async () => {
      const created = await createDocumentAction(
        {
          tenantId,
          documentCode: `SOP-UPD-${Date.now()}`,
          title: "Document for Update Testing",
          initialContent: "Original content",
        },
        { userId: authorUserId, callerDb: testAppDb }
      );
      if (!created.success) throw new Error("Failed to setup test document");
      docId = created.data.documentId;
      verId = created.data.versionId;
    });

    it("updates content and increments row_version from 1 to 2", async () => {
      const updateRes = await updateDocumentVersionAction(
        {
          tenantId,
          versionId: verId,
          rowVersion: 1,
          contentMarkdown: "Updated draft content for testing",
        },
        { userId: authorUserId, callerDb: testAppDb }
      );

      expect(updateRes.success).toBe(true);
      if (!updateRes.success) return;

      expect(updateRes.data.rowVersion).toBe(2);
      expect(updateRes.data.documentSha256).toBeDefined();

      const [updatedVer] = await testAdminDb
        .select()
        .from(documentVersions)
        .where(eq(documentVersions.id, verId));

      expect(updatedVer.rowVersion).toBe(2);
      expect(updatedVer.markdownContent).toBe("Updated draft content for testing");
    });

    it("optimistic concurrency guard: rejects update with row_version mismatch (HTTP 409 CONCURRENT_MODIFICATION)", async () => {
      // Current row_version is 2, pass expectedRowVersion = 1
      const staleRes = await updateDocumentVersionAction(
        {
          tenantId,
          versionId: verId,
          expectedRowVersion: 1, // Stale!
          contentMarkdown: "Stale update attempt",
        },
        { userId: authorUserId, callerDb: testAppDb }
      );

      expect(staleRes.success).toBe(false);
      if (staleRes.success) return;
      expect(staleRes.error.status).toBe(409);
      expect(staleRes.error.code).toBe("CONCURRENT_MODIFICATION");
    });

    it("rejects edits by another author with HTTP 403 FORBIDDEN", async () => {
      const forbiddenRes = await updateDocumentVersionAction(
        {
          tenantId,
          versionId: verId,
          rowVersion: 2,
          contentMarkdown: "Secondary author tampering attempt",
        },
        { userId: otherAuthorUserId, callerDb: testAppDb }
      );

      expect(forbiddenRes.success).toBe(false);
      if (forbiddenRes.success) return;
      expect(forbiddenRes.error.status).toBe(403);
    });

    it("VERSION_IMMUTABLE guard: rejects update if version is in APPROVED or PUBLISHED state (HTTP 409)", async () => {
      // Transition version to APPROVED in DB
      await testAdminDb
        .update(documentVersions)
        .set({ lifecycleState: "APPROVED" })
        .where(eq(documentVersions.id, verId));

      const immRes = await updateDocumentVersionAction(
        {
          tenantId,
          versionId: verId,
          rowVersion: 2,
          contentMarkdown: "Attempt to modify approved version",
        },
        { userId: authorUserId, callerDb: testAppDb }
      );

      expect(immRes.success).toBe(false);
      if (immRes.success) return;
      expect(immRes.error.status).toBe(409);
      expect(immRes.error.code).toBe("VERSION_IMMUTABLE");

      // Reset to DRAFT via replica mode for cleanup
      await adminClient.begin(async (sql) => {
        await sql`SET LOCAL session_replication_role = 'replica'`;
        await sql`UPDATE veridoc.document_versions SET lifecycle_state = 'DRAFT' WHERE id = ${verId}`;
      });
    });
  });

  describe("3. createRevisionAction", () => {
    let docId: string;
    let publishedVerId: string;

    beforeAll(async () => {
      const created = await createDocumentAction(
        {
          tenantId,
          documentCode: `SOP-REV-${Date.now()}`,
          title: "SOP for Revision Testing",
          initialContent: "Version 1.0 body",
        },
        { userId: authorUserId, callerDb: testAppDb }
      );
      if (!created.success) throw new Error("Failed to setup test document");
      docId = created.data.documentId;
      publishedVerId = created.data.versionId;

      // Mark as PUBLISHED
      await testAdminDb
        .update(documentVersions)
        .set({ lifecycleState: "PUBLISHED" })
        .where(eq(documentVersions.id, publishedVerId));
    });

    it("rejects creating revision from a DRAFT version with HTTP 400", async () => {
      // Create a draft version
      const [draftVer] = await testAdminDb
        .insert(documentVersions)
        .values({
          tenantId,
          documentId: docId,
          versionMajor: 0,
          versionMinor: 1,
          title: "Draft SOP",
          contentFormat: "MARKDOWN",
          lifecycleState: "DRAFT",
          authorId: authorUserId,
          rowVersion: 1,
        })
        .returning();

      const revRes = await createRevisionAction(
        {
          tenantId,
          parentVersionId: draftVer.id,
          changeType: "MINOR",
        },
        { userId: authorUserId, callerDb: testAppDb }
      );

      expect(revRes.success).toBe(false);
      if (revRes.success) return;
      expect(revRes.error.status).toBe(400);
      expect(revRes.error.message).toContain("PUBLISHED or APPROVED");
    });

    it("creates MINOR revision (1.0 -> 1.1) in DRAFT state with rowVersion 1 and audit log", async () => {
      const revRes = await createRevisionAction(
        {
          tenantId,
          parentVersionId: publishedVerId,
          changeType: "MINOR",
          changeSummary: "Added section on decontamination",
        },
        { userId: authorUserId, callerDb: testAppDb }
      );

      expect(revRes.success).toBe(true);
      if (!revRes.success) return;

      expect(revRes.data.versionNumber).toBe("v1.1");
      expect(revRes.data.versionId).toBeDefined();

      const [newVer] = await testAdminDb
        .select()
        .from(documentVersions)
        .where(eq(documentVersions.id, revRes.data.versionId));

      expect(newVer.versionMajor).toBe(1);
      expect(newVer.versionMinor).toBe(1);
      expect(newVer.lifecycleState).toBe("DRAFT");
      expect(newVer.parentVersionId).toBe(publishedVerId);
      expect(newVer.rowVersion).toBe(1);

      // Verify audit log
      const [revLog] = await testAdminDb
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.tenantId, tenantId),
            eq(auditLogs.entityId, revRes.data.versionId),
            eq(auditLogs.eventType, "DOCUMENT_REVISION_CREATED")
          )
        );
      expect(revLog).toBeDefined();
    });

    it("creates MAJOR revision (1.0 -> 2.0) in DRAFT state", async () => {
      const revRes = await createRevisionAction(
        {
          tenantId,
          parentVersionId: publishedVerId,
          changeType: "MAJOR",
          changeSummary: "Complete restructuring of protocol",
        },
        { userId: authorUserId, callerDb: testAppDb }
      );

      expect(revRes.success).toBe(true);
      if (!revRes.success) return;

      expect(revRes.data.versionNumber).toBe("v2.0");

      const [newVer] = await testAdminDb
        .select()
        .from(documentVersions)
        .where(eq(documentVersions.id, revRes.data.versionId));

      expect(newVer.versionMajor).toBe(2);
      expect(newVer.versionMinor).toBe(0);
      expect(newVer.lifecycleState).toBe("DRAFT");
    });
  });

  describe("4. Document Visibility & Anti-Enumeration (list & detail)", () => {
    let docId: string;
    let draftVerId: string;

    beforeAll(async () => {
      const created = await createDocumentAction(
        {
          tenantId,
          documentCode: `SOP-VIS-${Date.now()}`,
          title: "Unpublished Draft SOP",
          initialContent: "Secret draft content",
        },
        { userId: authorUserId, callerDb: testAppDb }
      );
      if (!created.success) throw new Error("Failed to create doc");
      docId = created.data.documentId;
      draftVerId = created.data.versionId;
    });

    it("Reader receives HTTP 404 NOT_FOUND when requesting details of an unpublished document", async () => {
      const detailRes = await getDocumentDetailAction(
        { tenantId, documentId: docId },
        { userId: readerUserId, callerDb: testAppDb }
      );

      expect(detailRes.success).toBe(false);
      if (detailRes.success) return;
      expect(detailRes.error.status).toBe(404);
      expect(detailRes.error.code).toBe("NOT_FOUND");
    });

    it("Author successfully retrieves details of own draft document", async () => {
      const detailRes = await getDocumentDetailAction(
        { tenantId, documentId: docId },
        { userId: authorUserId, callerDb: testAppDb }
      );

      expect(detailRes.success).toBe(true);
      if (!detailRes.success) return;
      expect(detailRes.data.document.id).toBe(docId);
      expect(detailRes.data.versions).toHaveLength(1);
      expect(detailRes.data.activeVersion).toBeDefined();
      expect(detailRes.data.activeVersion?.lifecycleState).toBe("DRAFT");
    });
  });

  describe("5. Assigned APPROVER_REVIEWER Visibility on PENDING_APPROVAL SOP (AUD-004)", () => {
    let pendingDocId: string;
    let pendingVerId: string;
    let assignedApproverId: string;
    let unassignedApproverId: string;

    beforeAll(async () => {
      const [assignedUser] = await testAdminDb
        .insert(users)
        .values({
          name: "Assigned Approver",
          email: `assigned-app-${Date.now()}@veridoc.test`,
        })
        .returning();
      assignedApproverId = assignedUser.id;
      userIds.push(assignedApproverId);

      const [unassignedUser] = await testAdminDb
        .insert(users)
        .values({
          name: "Unassigned Approver",
          email: `unassigned-app-${Date.now()}@veridoc.test`,
        })
        .returning();
      unassignedApproverId = unassignedUser.id;
      userIds.push(unassignedApproverId);

      await testAdminDb.insert(tenantMemberships).values([
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

      const [doc] = await testAdminDb
        .insert(documents)
        .values({
          tenantId,
          documentCode: `SOP-APV-${Date.now()}`,
          createdBy: authorUserId,
        })
        .returning();
      pendingDocId = doc.id;

      const [ver] = await testAdminDb
        .insert(documentVersions)
        .values({
          tenantId,
          documentId: pendingDocId,
          versionMajor: 1,
          versionMinor: 0,
          title: "Pending Approval SOP",
          contentFormat: "MARKDOWN",
          markdownContent: "# SOP\nPending approval text",
          documentSha256: "a".repeat(64),
          lifecycleState: "PENDING_APPROVAL",
          authorId: authorUserId,
          rowVersion: 2,
        })
        .returning();
      pendingVerId = ver.id;

      const [cycle] = await testAdminDb
        .insert(approvalCycles)
        .values({
          tenantId,
          documentVersionId: pendingVerId,
          cycleNumber: 1,
          submittedBy: authorUserId,
          submittedSha256: "a".repeat(64),
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

    it("assigned APPROVER_REVIEWER can list and view assigned PENDING_APPROVAL SOP", async () => {
      const listRes = await listDocumentsAction(
        { tenantId, page: 1, limit: 50 },
        { userId: assignedApproverId, callerDb: testAppDb }
      );
      expect(listRes.success).toBe(true);
      if (listRes.success) {
        const found = listRes.data.documents.find((d) => d.id === pendingDocId);
        expect(found).toBeDefined();
      }

      const detailRes = await getDocumentDetailAction(
        { tenantId, documentId: pendingDocId },
        { userId: assignedApproverId, callerDb: testAppDb }
      );
      expect(detailRes.success).toBe(true);
    });

    it("unassigned APPROVER_REVIEWER cannot view PENDING_APPROVAL SOP (404 anti-enumeration)", async () => {
      const detailRes = await getDocumentDetailAction(
        { tenantId, documentId: pendingDocId },
        { userId: unassignedApproverId, callerDb: testAppDb }
      );
      expect(detailRes.success).toBe(false);
      if (!detailRes.success) {
        expect(detailRes.error.status).toBe(404);
      }
    });
  });

  describe("6. READER Lifecycle Isolation & APPROVER_REVIEWER SUPERSEDED Visibility", () => {
    let readerIsolationTenantId: string;
    let otherTenantId: string;
    let publishedSafetyDocId: string;
    let draftDocId: string;
    let pendingDocId: string;
    let approvedDocId: string;
    let supersededOnlyDocId: string;
    let retiredDocId: string;
    let otherTenantPublishedDocId: string;
    let assignedSupersededApproverId: string;
    let unassignedSupersededApproverId: string;

    beforeAll(async () => {
      const [t1] = await testAdminDb
        .insert(tenants)
        .values({
          name: "Reader Isolation Workspace",
          slug: `reader-iso-ws-${Date.now()}`,
        })
        .returning();
      readerIsolationTenantId = t1.id;
      tenantIds.push(readerIsolationTenantId);

      const [t2] = await testAdminDb
        .insert(tenants)
        .values({
          name: "Other Isolation Workspace",
          slug: `other-iso-ws-${Date.now()}`,
        })
        .returning();
      otherTenantId = t2.id;
      tenantIds.push(otherTenantId);

      const [assignedSupUser] = await testAdminDb
        .insert(users)
        .values({
          name: "Assigned Superseded Approver",
          email: `assigned-sup-${Date.now()}@veridoc.test`,
        })
        .returning();
      assignedSupersededApproverId = assignedSupUser.id;
      userIds.push(assignedSupersededApproverId);

      const [unassignedSupUser] = await testAdminDb
        .insert(users)
        .values({
          name: "Unassigned Superseded Approver",
          email: `unassigned-sup-${Date.now()}@veridoc.test`,
        })
        .returning();
      unassignedSupersededApproverId = unassignedSupUser.id;
      userIds.push(unassignedSupersededApproverId);

      await testAdminDb.insert(tenantMemberships).values([
        {
          tenantId: readerIsolationTenantId,
          userId: authorUserId,
          role: "DOCUMENT_AUTHOR",
          status: "ACTIVE",
        },
        {
          tenantId: readerIsolationTenantId,
          userId: readerUserId,
          role: "READER",
          status: "ACTIVE",
        },
        {
          tenantId: readerIsolationTenantId,
          userId: assignedSupersededApproverId,
          role: "APPROVER_REVIEWER",
          status: "ACTIVE",
        },
        {
          tenantId: readerIsolationTenantId,
          userId: unassignedSupersededApproverId,
          role: "APPROVER_REVIEWER",
          status: "ACTIVE",
        },
        {
          tenantId: otherTenantId,
          userId: authorUserId,
          role: "DOCUMENT_AUTHOR",
          status: "ACTIVE",
        },
        {
          tenantId: otherTenantId,
          userId: readerUserId,
          role: "READER",
          status: "ACTIVE",
        },
      ]);

      const suffix = Date.now().toString(36).toUpperCase();
      const [pubDoc, draftDoc, pendingDoc, approvedDoc, supersededDoc, retiredDoc] =
        await testAdminDb
          .insert(documents)
          .values([
            {
              tenantId: readerIsolationTenantId,
              documentCode: `SOP-ISO-PUB-${suffix}`,
              category: "Safety",
              createdBy: authorUserId,
            },
            {
              tenantId: readerIsolationTenantId,
              documentCode: `SOP-ISO-DRF-${suffix}`,
              category: "Safety",
              createdBy: authorUserId,
            },
            {
              tenantId: readerIsolationTenantId,
              documentCode: `SOP-ISO-PND-${suffix}`,
              category: "Safety",
              createdBy: authorUserId,
            },
            {
              tenantId: readerIsolationTenantId,
              documentCode: `SOP-ISO-APR-${suffix}`,
              category: "Safety",
              createdBy: authorUserId,
            },
            {
              tenantId: readerIsolationTenantId,
              documentCode: `SOP-ISO-SUP-${suffix}`,
              category: "Safety",
              createdBy: authorUserId,
            },
            {
              tenantId: readerIsolationTenantId,
              documentCode: `SOP-ISO-RET-${suffix}`,
              category: "Safety",
              createdBy: authorUserId,
            },
          ])
          .returning();

      publishedSafetyDocId = pubDoc.id;
      draftDocId = draftDoc.id;
      pendingDocId = pendingDoc.id;
      approvedDocId = approvedDoc.id;
      supersededOnlyDocId = supersededDoc.id;
      retiredDocId = retiredDoc.id;

      const [otherDoc] = await testAdminDb
        .insert(documents)
        .values({
          tenantId: otherTenantId,
          documentCode: `SOP-ISO-OTHER-${suffix}`,
          category: "Safety",
          createdBy: authorUserId,
        })
        .returning();
      otherTenantPublishedDocId = otherDoc.id;

      const [, , , , supersededVer] = await testAdminDb
        .insert(documentVersions)
        .values([
          {
            tenantId: readerIsolationTenantId,
            documentId: publishedSafetyDocId,
            versionMajor: 1,
            versionMinor: 0,
            title: "IsolationMatch Published SOP",
            contentFormat: "MARKDOWN",
            markdownContent: "# Published SOP",
            documentSha256: "b".repeat(64),
            lifecycleState: "PUBLISHED",
            authorId: authorUserId,
            rowVersion: 1,
          },
          {
            tenantId: readerIsolationTenantId,
            documentId: draftDocId,
            versionMajor: 1,
            versionMinor: 0,
            title: "IsolationMatch Draft SOP",
            contentFormat: "MARKDOWN",
            markdownContent: "# Draft SOP",
            documentSha256: "c".repeat(64),
            lifecycleState: "DRAFT",
            authorId: authorUserId,
            rowVersion: 1,
          },
          {
            tenantId: readerIsolationTenantId,
            documentId: pendingDocId,
            versionMajor: 1,
            versionMinor: 0,
            title: "IsolationMatch Pending SOP",
            contentFormat: "MARKDOWN",
            markdownContent: "# Pending SOP",
            documentSha256: "d".repeat(64),
            lifecycleState: "PENDING_APPROVAL",
            authorId: authorUserId,
            rowVersion: 1,
          },
          {
            tenantId: readerIsolationTenantId,
            documentId: approvedDocId,
            versionMajor: 1,
            versionMinor: 0,
            title: "IsolationMatch Approved SOP",
            contentFormat: "MARKDOWN",
            markdownContent: "# Approved SOP",
            documentSha256: "e".repeat(64),
            lifecycleState: "APPROVED",
            authorId: authorUserId,
            rowVersion: 1,
          },
          {
            tenantId: readerIsolationTenantId,
            documentId: supersededOnlyDocId,
            versionMajor: 1,
            versionMinor: 0,
            title: "IsolationMatch Superseded SOP",
            contentFormat: "MARKDOWN",
            markdownContent: "# Superseded SOP",
            documentSha256: "f".repeat(64),
            lifecycleState: "SUPERSEDED",
            authorId: authorUserId,
            rowVersion: 1,
          },
          {
            tenantId: readerIsolationTenantId,
            documentId: retiredDocId,
            versionMajor: 1,
            versionMinor: 0,
            title: "IsolationMatch Retired SOP",
            contentFormat: "MARKDOWN",
            markdownContent: "# Retired SOP",
            documentSha256: "0".repeat(64),
            lifecycleState: "RETIRED",
            authorId: authorUserId,
            rowVersion: 1,
          },
        ])
        .returning();

      // Also add a DRAFT v1.1 on publishedSafetyDocId and a PUBLISHED v1.0 in otherTenantId
      await testAdminDb.insert(documentVersions).values([
        {
          tenantId: readerIsolationTenantId,
          documentId: publishedSafetyDocId,
          versionMajor: 1,
          versionMinor: 1,
          title: "IsolationMatch Published SOP (Draft Revision)",
          contentFormat: "MARKDOWN",
          markdownContent: "# Draft v1.1",
          documentSha256: "1".repeat(64),
          lifecycleState: "DRAFT",
          authorId: authorUserId,
          rowVersion: 1,
        },
        {
          tenantId: otherTenantId,
          documentId: otherTenantPublishedDocId,
          versionMajor: 1,
          versionMinor: 0,
          title: "IsolationMatch Foreign Tenant SOP",
          contentFormat: "MARKDOWN",
          markdownContent: "# Foreign Published SOP",
          documentSha256: "2".repeat(64),
          lifecycleState: "PUBLISHED",
          authorId: authorUserId,
          rowVersion: 1,
        },
      ]);

      // Assign an approver to the SUPERSEDED version
      const [supCycle] = await testAdminDb
        .insert(approvalCycles)
        .values({
          tenantId: readerIsolationTenantId,
          documentVersionId: supersededVer.id,
          cycleNumber: 1,
          submittedBy: authorUserId,
          submittedSha256: "f".repeat(64),
          status: "APPROVED",
        })
        .returning();

      await testAdminDb.insert(approvalSteps).values({
        tenantId: readerIsolationTenantId,
        approvalCycleId: supCycle.id,
        stepOrder: 1,
        assignedApproverId: assignedSupersededApproverId,
        status: "APPROVED",
        actedByUserId: assignedSupersededApproverId,
        actedByFullName: "Assigned Superseded Approver",
        actedByRole: "APPROVER_REVIEWER",
        signedDocumentSha256: "f".repeat(64),
        decisionIntent: "Approved SOP v1.0 prior to supersession",
        actedAt: new Date(),
      });
    });

    it("READER calling listDocumentsAction receives ONLY PUBLISHED documents even when DRAFT, PENDING_APPROVAL, APPROVED, SUPERSEDED, and RETIRED exist", async () => {
      const listRes = await listDocumentsAction(
        { tenantId: readerIsolationTenantId, page: 1, limit: 50 },
        { userId: readerUserId, callerDb: testAppDb }
      );

      expect(listRes.success).toBe(true);
      if (!listRes.success) return;

      expect(listRes.data.total).toBe(1);
      expect(listRes.data.documents).toHaveLength(1);
      expect(listRes.data.documents[0].id).toBe(publishedSafetyDocId);
      expect(listRes.data.documents[0].lifecycleState).toBe("PUBLISHED");
      expect(listRes.data.documents[0].currentVersionLabel).toBe("v1.0");
      expect(listRes.data.documents[0].versionCount).toBe(1);
    });

    it("READER calling listDocumentsAction with category + search filters preserves tenant isolation", async () => {
      const listRes = await listDocumentsAction(
        {
          tenantId: readerIsolationTenantId,
          category: "Safety",
          search: "IsolationMatch",
          page: 1,
          limit: 50,
        },
        { userId: readerUserId, callerDb: testAppDb }
      );

      expect(listRes.success).toBe(true);
      if (!listRes.success) return;

      expect(listRes.data.total).toBe(1);
      expect(listRes.data.documents).toHaveLength(1);
      expect(listRes.data.documents[0].id).toBe(publishedSafetyDocId);
      expect(listRes.data.documents[0].tenantId).toBe(readerIsolationTenantId);
      expect(
        listRes.data.documents.some((d) => d.id === otherTenantPublishedDocId)
      ).toBe(false);
    });

    it("assigned APPROVER_REVIEWER can view SUPERSEDED document version via listDocumentsAction and getDocumentDetailAction", async () => {
      const listRes = await listDocumentsAction(
        { tenantId: readerIsolationTenantId, page: 1, limit: 50 },
        { userId: assignedSupersededApproverId, callerDb: testAppDb }
      );

      expect(listRes.success).toBe(true);
      if (!listRes.success) return;
      const found = listRes.data.documents.find((d) => d.id === supersededOnlyDocId);
      expect(found).toBeDefined();
      expect(found?.lifecycleState).toBe("SUPERSEDED");

      const detailRes = await getDocumentDetailAction(
        { tenantId: readerIsolationTenantId, documentId: supersededOnlyDocId },
        { userId: assignedSupersededApproverId, callerDb: testAppDb }
      );
      expect(detailRes.success).toBe(true);
      if (!detailRes.success) return;
      expect(
        detailRes.data.versions.some((v) => v.lifecycleState === "SUPERSEDED")
      ).toBe(true);
    });

    it("unassigned APPROVER_REVIEWER cannot view SUPERSEDED document version via listDocumentsAction or getDocumentDetailAction", async () => {
      const listRes = await listDocumentsAction(
        { tenantId: readerIsolationTenantId, page: 1, limit: 50 },
        { userId: unassignedSupersededApproverId, callerDb: testAppDb }
      );

      expect(listRes.success).toBe(true);
      if (!listRes.success) return;
      const found = listRes.data.documents.find((d) => d.id === supersededOnlyDocId);
      expect(found).toBeUndefined();

      const detailRes = await getDocumentDetailAction(
        { tenantId: readerIsolationTenantId, documentId: supersededOnlyDocId },
        { userId: unassignedSupersededApproverId, callerDb: testAppDb }
      );
      expect(detailRes.success).toBe(false);
      if (!detailRes.success) {
        expect(detailRes.error.status).toBe(404);
      }
    });
  });
});
