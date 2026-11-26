import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  tenants,
  users,
  tenantMemberships,
  documents,
  documentVersions,
  readAssignments,
  audienceGroups,
  audienceGroupMembers,
  auditLogs,
} from "@/db/schema";
import {
  testAdminDb,
  testAppDb,
  cleanupTestTenants,
  cleanupTestUsers,
} from "../../helpers/db";
import {
  publishDocumentVersionAction,
  retireDocumentVersionAction,
} from "@/server/actions/reader.actions";

describe("Publishing & Lifecycle State Machine Integration (publishing-workflow.test.ts)", { timeout: 120000 }, () => {
  let tenantId: string;
  let adminUserId: string;
  let qmUserId: string;
  let authorUserId: string;
  let reader1UserId: string;
  let reader2UserId: string;
  let reader3UserId: string;
  let group1Id: string;
  let group2Id: string;

  const userIds: string[] = [];
  const tenantIds: string[] = [];

  const dummySha256v1 =
    "1111111111111111111111111111111111111111111111111111111111111111";
  const dummySha256v2 =
    "2222222222222222222222222222222222222222222222222222222222222222";

  beforeAll(async () => {
    // 1. Create Workspace
    const [t] = await testAdminDb
      .insert(tenants)
      .values({
        name: "Publishing Workflow Workspace",
        slug: `pub-ws-${Date.now()}`,
      })
      .returning();
    tenantId = t.id;
    tenantIds.push(tenantId);

    // 2. Create Users
    async function createUser(name: string, emailPrefix: string, role: any) {
      const [u] = await testAdminDb
        .insert(users)
        .values({
          name,
          email: `${emailPrefix}-${Date.now()}-${Math.random().toString(36).substring(7)}@veridoc.test`,
        })
        .returning();
      userIds.push(u.id);

      await testAdminDb.insert(tenantMemberships).values({
        tenantId,
        userId: u.id,
        role,
        status: "ACTIVE",
      });

      return u.id;
    }

    adminUserId = await createUser("Workspace Admin", "admin", "WORKSPACE_ADMIN");
    qmUserId = await createUser("Quality Manager", "qm", "QUALITY_MANAGER");
    authorUserId = await createUser("Document Author", "author", "DOCUMENT_AUTHOR");
    reader1UserId = await createUser("Reader One", "reader1", "READER");
    reader2UserId = await createUser("Reader Two", "reader2", "READER");
    reader3UserId = await createUser("Reader Three", "reader3", "READER");

    // 3. Create Audience Groups
    const [g1] = await testAdminDb
      .insert(audienceGroups)
      .values({
        tenantId,
        name: "Production Shift A",
        groupType: "DEPARTMENT",
      })
      .returning();
    group1Id = g1.id;

    const [g2] = await testAdminDb
      .insert(audienceGroups)
      .values({
        tenantId,
        name: "Quality Operations",
        groupType: "DEPARTMENT",
      })
      .returning();
    group2Id = g2.id;

    // Add members: g1 has reader1 and reader2; g2 has reader2 and reader3
    await testAdminDb.insert(audienceGroupMembers).values([
      { tenantId, groupId: group1Id, userId: reader1UserId },
      { tenantId, groupId: group1Id, userId: reader2UserId },
      { tenantId, groupId: group2Id, userId: reader2UserId },
      { tenantId, groupId: group2Id, userId: reader3UserId },
    ]);
  });

  afterAll(async () => {
    await cleanupTestTenants(tenantIds);
    await cleanupTestUsers(userIds);
  });

  // ============================================================================
  // Test 1: Rejection if target version is not in APPROVED state
  // ============================================================================
  it("rejects publishing a version that is in DRAFT or PENDING_APPROVAL state", async () => {
    // Create Document & DRAFT version
    const [doc] = await testAdminDb
      .insert(documents)
      .values({
        tenantId,
        documentCode: `SOP-REJ-${Date.now()}`,
        category: "Safety",
        createdBy: authorUserId,
      })
      .returning();

    const [draftVer] = await testAdminDb
      .insert(documentVersions)
      .values({
        tenantId,
        documentId: doc.id,
        versionMajor: 0,
        versionMinor: 1,
        title: "Draft SOP Never Approved",
        contentFormat: "MARKDOWN",
        markdownContent: "# Draft Procedure",
        documentSha256: dummySha256v1,
        lifecycleState: "DRAFT",
        authorId: authorUserId,
      })
      .returning();

    const result = await publishDocumentVersionAction(
      {
        tenantId,
        versionId: draftVer.id,
        targetGroupIds: [group1Id],
        acknowledgmentDueDays: 7,
      },
      { userId: qmUserId, callerDb: testAppDb }
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
      expect(result.error.message).toContain("Only APPROVED document versions can be published");
    }
  });

  // ============================================================================
  // Test 2: Happy Path Publication (AC-03): APPROVED -> PUBLISHED & Read Assignments
  // ============================================================================
  it("executes happy path publication (AC-03): APPROVED -> PUBLISHED and materializes read_assignments for target groups", async () => {
    // 1. Create document and version in APPROVED state
    const [doc] = await testAdminDb
      .insert(documents)
      .values({
        tenantId,
        documentCode: `SOP-PUB-HP-${Date.now()}`,
        category: "Manufacturing",
        createdBy: authorUserId,
      })
      .returning();

    const [approvedVer] = await testAdminDb
      .insert(documentVersions)
      .values({
        tenantId,
        documentId: doc.id,
        versionMajor: 1,
        versionMinor: 0,
        title: "Cleanroom Gowning Standard V1",
        contentFormat: "MARKDOWN",
        markdownContent: "# Standard Cleanroom Gowning Procedure V1",
        documentSha256: dummySha256v1,
        lifecycleState: "APPROVED",
        authorId: authorUserId,
      })
      .returning();

    // 2. Publish as Quality Manager targeting group1 (reader1, reader2) and group2 (reader2, reader3)
    const pubRes = await publishDocumentVersionAction(
      {
        tenantId,
        versionId: approvedVer.id,
        targetGroupIds: [group1Id, group2Id],
        acknowledgmentDueDays: 10,
      },
      { userId: qmUserId, callerDb: testAppDb }
    );

    expect(pubRes.success).toBe(true);
    if (!pubRes.success) return;

    expect(pubRes.data.versionId).toBe(approvedVer.id);
    expect(pubRes.data.lifecycleState).toBe("PUBLISHED");
    // reader1, reader2, reader3 -> 3 unique users
    expect(pubRes.data.assignedCount).toBe(3);

    // 3. Verify document_versions state in DB
    const [verInDb] = await testAdminDb
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.id, approvedVer.id));

    expect(verInDb.lifecycleState).toBe("PUBLISHED");
    expect(verInDb.publishedBy).toBe(qmUserId);
    expect(verInDb.publishedAt).not.toBeNull();

    // 4. Verify read_assignments materialized
    const assignments = await testAdminDb
      .select()
      .from(readAssignments)
      .where(
        and(
          eq(readAssignments.tenantId, tenantId),
          eq(readAssignments.documentVersionId, approvedVer.id)
        )
      );

    expect(assignments.length).toBe(3);
    const assignedUserIds = assignments.map((a) => a.userId).sort();
    expect(assignedUserIds).toEqual([reader1UserId, reader2UserId, reader3UserId].sort());

    for (const a of assignments) {
      expect(a.status).toBe("PENDING");
      expect(new Date(a.dueAt).getTime()).toBeGreaterThan(Date.now());
    }

    // 5. Verify DOCUMENT_PUBLISHED audit log entry
    const [pubAudit] = await testAdminDb
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.tenantId, tenantId),
          eq(auditLogs.entityId, approvedVer.id),
          eq(auditLogs.eventType, "DOCUMENT_PUBLISHED")
        )
      );

    expect(pubAudit).toBeDefined();
    expect(pubAudit.actorUserId).toBe(qmUserId);
  });

  // ============================================================================
  // Test 3: Atomic Superseding (BR-VER-01) & Expiring Uncompleted Assignments
  // ============================================================================
  it("atomically supersedes v1.0 when v2.0 is published and marks uncompleted assignments as EXPIRED_SUPERSEDED (BR-VER-01)", async () => {
    // 1. Create document
    const [doc] = await testAdminDb
      .insert(documents)
      .values({
        tenantId,
        documentCode: `SOP-SUPER-${Date.now()}`,
        category: "Sterilization",
        createdBy: authorUserId,
      })
      .returning();

    // 2. Create and publish v1.0
    const [v1] = await testAdminDb
      .insert(documentVersions)
      .values({
        tenantId,
        documentId: doc.id,
        versionMajor: 1,
        versionMinor: 0,
        title: "Autoclave Sterilization Protocol V1",
        contentFormat: "MARKDOWN",
        markdownContent: "# Autoclave Sterilization Protocol V1",
        documentSha256: dummySha256v1,
        lifecycleState: "APPROVED",
        authorId: authorUserId,
      })
      .returning();

    const pub1Res = await publishDocumentVersionAction(
      {
        tenantId,
        versionId: v1.id,
        targetGroupIds: [group1Id],
        acknowledgmentDueDays: 7,
      },
      { userId: adminUserId, callerDb: testAppDb }
    );
    expect(pub1Res.success).toBe(true);

    // Get assignments for v1
    const v1Assignments = await testAdminDb
      .select()
      .from(readAssignments)
      .where(
        and(
          eq(readAssignments.tenantId, tenantId),
          eq(readAssignments.documentVersionId, v1.id)
        )
      );
    expect(v1Assignments.length).toBe(2);
    expect(v1Assignments.every((a) => a.status === "PENDING")).toBe(true);

    // 3. Create v2.0 in APPROVED state
    const [v2] = await testAdminDb
      .insert(documentVersions)
      .values({
        tenantId,
        documentId: doc.id,
        parentVersionId: v1.id,
        versionMajor: 2,
        versionMinor: 0,
        title: "Autoclave Sterilization Protocol V2",
        contentFormat: "MARKDOWN",
        markdownContent: "# Autoclave Sterilization Protocol V2 - Enhanced Safety",
        documentSha256: dummySha256v2,
        lifecycleState: "APPROVED",
        authorId: authorUserId,
      })
      .returning();

    // 4. Publish v2.0
    const pub2Res = await publishDocumentVersionAction(
      {
        tenantId,
        versionId: v2.id,
        targetGroupIds: [group1Id],
        acknowledgmentDueDays: 14,
      },
      { userId: qmUserId, callerDb: testAppDb }
    );

    expect(pub2Res.success).toBe(true);
    if (!pub2Res.success) return;
    expect(pub2Res.data.supersededVersionId).toBe(v1.id);

    // 5. Verify v1.0 is now SUPERSEDED
    const [v1After] = await testAdminDb
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.id, v1.id));
    expect(v1After.lifecycleState).toBe("SUPERSEDED");

    // 6. Verify v2.0 is now PUBLISHED
    const [v2After] = await testAdminDb
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.id, v2.id));
    expect(v2After.lifecycleState).toBe("PUBLISHED");

    // 7. Verify v1.0 uncompleted assignments are marked EXPIRED_SUPERSEDED
    const v1AssignmentsAfter = await testAdminDb
      .select()
      .from(readAssignments)
      .where(
        and(
          eq(readAssignments.tenantId, tenantId),
          eq(readAssignments.documentVersionId, v1.id)
        )
      );

    expect(v1AssignmentsAfter.every((a) => a.status === "EXPIRED_SUPERSEDED")).toBe(true);

    // 8. Verify v2.0 has new PENDING assignments
    const v2Assignments = await testAdminDb
      .select()
      .from(readAssignments)
      .where(
        and(
          eq(readAssignments.tenantId, tenantId),
          eq(readAssignments.documentVersionId, v2.id)
        )
      );
    expect(v2Assignments.length).toBe(2);
    expect(v2Assignments.every((a) => a.status === "PENDING")).toBe(true);

    // 9. Verify DOCUMENT_SUPERSEDED audit log for v1
    const [supAudit] = await testAdminDb
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.tenantId, tenantId),
          eq(auditLogs.entityId, v1.id),
          eq(auditLogs.eventType, "DOCUMENT_SUPERSEDED")
        )
      );
    expect(supAudit).toBeDefined();
  });

  // ============================================================================
  // Test 4: Retirement: PUBLISHED -> RETIRED via retireDocumentVersionAction
  // ============================================================================
  it("transitions a PUBLISHED version to RETIRED via retireDocumentVersionAction and logs audit event", async () => {
    // 1. Create document & publish version
    const [doc] = await testAdminDb
      .insert(documents)
      .values({
        tenantId,
        documentCode: `SOP-RET-${Date.now()}`,
        category: "Decommissioning",
        createdBy: authorUserId,
      })
      .returning();

    const [v1] = await testAdminDb
      .insert(documentVersions)
      .values({
        tenantId,
        documentId: doc.id,
        versionMajor: 1,
        versionMinor: 0,
        title: "Legacy Equipment Calibration SOP",
        contentFormat: "MARKDOWN",
        markdownContent: "# Legacy Calibration",
        documentSha256: dummySha256v1,
        lifecycleState: "APPROVED",
        authorId: authorUserId,
      })
      .returning();

    await publishDocumentVersionAction(
      {
        tenantId,
        versionId: v1.id,
        targetGroupIds: [group1Id],
      },
      { userId: adminUserId, callerDb: testAppDb }
    );

    // 2. Retire the PUBLISHED version
    const retireRes = await retireDocumentVersionAction(
      {
        tenantId,
        versionId: v1.id,
        reason: "Equipment retired from production facility; SOP no longer applicable.",
      },
      { userId: qmUserId, callerDb: testAppDb }
    );

    expect(retireRes.success).toBe(true);
    if (!retireRes.success) return;

    expect(retireRes.data.versionId).toBe(v1.id);
    expect(retireRes.data.lifecycleState).toBe("RETIRED");

    // 3. Verify DB state is RETIRED
    const [v1Retired] = await testAdminDb
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.id, v1.id));

    expect(v1Retired.lifecycleState).toBe("RETIRED");

    // 4. Verify DOCUMENT_RETIRED audit log
    const [retireAudit] = await testAdminDb
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.tenantId, tenantId),
          eq(auditLogs.entityId, v1.id),
          eq(auditLogs.eventType, "DOCUMENT_RETIRED")
        )
      );

    expect(retireAudit).toBeDefined();
    expect(retireAudit.actorUserId).toBe(qmUserId);
    expect((retireAudit.payloadJson as Record<string, unknown>)?.reason).toContain(
      "Equipment retired from production facility"
    );
  });
});
