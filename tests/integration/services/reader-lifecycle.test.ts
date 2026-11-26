import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import {
  tenants,
  users,
  accounts,
  tenantMemberships,
  documents,
  documentVersions,
  readAssignments,
  readAcknowledgments,
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
  acknowledgeDocumentAction,
  getMyReadQueueAction,
  getGovernanceDashboardDataAction,
} from "@/server/actions/reader.actions";
import { GET as getMyQueueRoute } from "@/app/api/acknowledgments/my-queue/route";
import { GET as getDashboardCompletionRoute } from "@/app/api/dashboard/completion/route";

describe("Reader Lifecycle: Publishing, Acknowledgments & Dashboard (Live PostgreSQL)", { timeout: 120000 }, () => {
  let tenantId: string;
  let adminUserId: string;
  let qmUserId: string;
  let authorUserId: string;
  let reader1UserId: string;
  let reader2UserId: string;
  let groupId: string;

  const userIds: string[] = [];
  const tenantIds: string[] = [];

  const dummySha256 =
    "a1b2c3d4e5f60123456789abcdef0123456789abcdef0123456789abcdef0123";
  const dummySha256v2 =
    "b2c3d4e5f6a10123456789abcdef0123456789abcdef0123456789abcdef0123";

  beforeAll(async () => {
    // 1. Create Workspace Tenant
    const [t] = await testAdminDb
      .insert(tenants)
      .values({
        name: "Publish & Reader Lifecycle Workspace",
        slug: `reader-ws-${Date.now()}`,
      })
      .returning();
    tenantId = t.id;
    tenantIds.push(tenantId);

    // 2. Helper to create user
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

    // 3. Create Audience Group & add readers
    const [grp] = await testAdminDb
      .insert(audienceGroups)
      .values({
        tenantId,
        name: "Operations Team",
        groupType: "DEPARTMENT",
      })
      .returning();
    groupId = grp.id;

    await testAdminDb.insert(audienceGroupMembers).values([
      { tenantId, groupId, userId: reader1UserId },
      { tenantId, groupId, userId: reader2UserId },
    ]);
  });

  afterAll(async () => {
    await cleanupTestTenants(tenantIds);
    await cleanupTestUsers(userIds);
  });

  // ============================================================================
  // Test 1: Publish APPROVED version & Materialize Read Assignments (AC-03)
  // ============================================================================
  it("publishes an APPROVED document version and materializes read_assignments for target group", async () => {
    // Create doc & version in APPROVED state
    const [doc] = await testAdminDb
      .insert(documents)
      .values({
        tenantId,
        documentCode: `SOP-PUB-${Date.now()}`,
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
        title: "Cleanroom Air Filtration SOP",
        contentFormat: "MARKDOWN",
        markdownContent: "# Cleanroom Air Filtration SOP",
        documentSha256: dummySha256,
        lifecycleState: "APPROVED",
        authorId: authorUserId,
        rowVersion: 1,
      })
      .returning();

    // Publish via Quality Manager
    const pubRes = await publishDocumentVersionAction(
      {
        tenantId,
        versionId: v1.id,
        expectedRowVersion: 1,
        targetGroupIds: [groupId],
        acknowledgmentDueDays: 7,
      },
      { userId: qmUserId, callerDb: testAppDb }
    );

    expect(pubRes.success).toBe(true);
    if (!pubRes.success) return;
    expect(pubRes.data.lifecycleState).toBe("PUBLISHED");
    expect(pubRes.data.assignedCount).toBe(2);

    // Verify database state: document_versions lifecycle_state is PUBLISHED
    const [pubVersion] = await testAdminDb
      .select()
      .from(documentVersions)
      .where(and(eq(documentVersions.tenantId, tenantId), eq(documentVersions.id, v1.id)));
    expect(pubVersion.lifecycleState).toBe("PUBLISHED");
    expect(pubVersion.publishedBy).toBe(qmUserId);

    // Verify read_assignments materialized for reader1 and reader2
    const assignments = await testAdminDb
      .select()
      .from(readAssignments)
      .where(
        and(
          eq(readAssignments.tenantId, tenantId),
          eq(readAssignments.documentVersionId, v1.id)
        )
      );
    expect(assignments).toHaveLength(2);
    expect(assignments.map((a) => a.userId).sort()).toEqual(
      [reader1UserId, reader2UserId].sort()
    );
    expect(assignments[0].status).toBe("PENDING");

    // Verify DOCUMENT_PUBLISHED audit log exists
    const [pubLog] = await testAdminDb
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.tenantId, tenantId),
          eq(auditLogs.eventType, "DOCUMENT_PUBLISHED"),
          eq(auditLogs.entityId, v1.id)
        )
      );
    expect(pubLog).toBeDefined();
    expect(pubLog.actorUserId).toBe(qmUserId);
  });

  // ============================================================================
  // Test 2: Reject publishing non-APPROVED versions
  // ============================================================================
  it("rejects publishing a version that is in DRAFT state", async () => {
    const [doc] = await testAdminDb
      .insert(documents)
      .values({
        tenantId,
        documentCode: `SOP-REJ-${Date.now()}`,
        createdBy: authorUserId,
      })
      .returning();

    const [vDraft] = await testAdminDb
      .insert(documentVersions)
      .values({
        tenantId,
        documentId: doc.id,
        versionMajor: 0,
        versionMinor: 1,
        title: "Draft SOP",
        contentFormat: "MARKDOWN",
        markdownContent: "# Draft SOP",
        documentSha256: dummySha256,
        lifecycleState: "DRAFT",
        authorId: authorUserId,
        rowVersion: 1,
      })
      .returning();

    const pubRes = await publishDocumentVersionAction(
      {
        tenantId,
        versionId: vDraft.id,
        targetGroupIds: [groupId],
      },
      { userId: adminUserId, callerDb: testAppDb }
    );

    expect(pubRes.success).toBe(false);
    if (!pubRes.success) {
      expect(pubRes.error.code).toBe("VALIDATION_ERROR");
    }
  });

  // ============================================================================
  // Test 3: Atomic Superseding (BR-VER-01)
  // ============================================================================
  it("atomically supersedes prior PUBLISHED version and expires uncompleted assignments", async () => {
    const [doc] = await testAdminDb
      .insert(documents)
      .values({
        tenantId,
        documentCode: `SOP-SUP-${Date.now()}`,
        createdBy: authorUserId,
      })
      .returning();

    // v1 is currently PUBLISHED with 1 pending assignment
    const [v1] = await testAdminDb
      .insert(documentVersions)
      .values({
        tenantId,
        documentId: doc.id,
        versionMajor: 1,
        versionMinor: 0,
        title: "Calibration SOP v1",
        contentFormat: "MARKDOWN",
        markdownContent: "# Calibration SOP v1",
        documentSha256: dummySha256,
        lifecycleState: "PUBLISHED",
        authorId: authorUserId,
        rowVersion: 1,
      })
      .returning();

    const [assignmentV1] = await testAdminDb
      .insert(readAssignments)
      .values({
        tenantId,
        documentVersionId: v1.id,
        userId: reader1UserId,
        status: "PENDING",
        dueAt: new Date(Date.now() + 86400000 * 7),
      })
      .returning();

    // v2 is APPROVED
    const [v2] = await testAdminDb
      .insert(documentVersions)
      .values({
        tenantId,
        documentId: doc.id,
        versionMajor: 2,
        versionMinor: 0,
        title: "Calibration SOP v2",
        contentFormat: "MARKDOWN",
        markdownContent: "# Calibration SOP v2",
        documentSha256: dummySha256v2,
        lifecycleState: "APPROVED",
        authorId: authorUserId,
        rowVersion: 1,
      })
      .returning();

    // Publish v2
    const pubRes = await publishDocumentVersionAction(
      {
        tenantId,
        versionId: v2.id,
        targetGroupIds: [groupId],
      },
      { userId: adminUserId, callerDb: testAppDb }
    );

    expect(pubRes.success).toBe(true);
    if (!pubRes.success) return;
    expect(pubRes.data.supersededVersionId).toBe(v1.id);

    // Verify v1 transitioned to SUPERSEDED
    const [updatedV1] = await testAdminDb
      .select()
      .from(documentVersions)
      .where(and(eq(documentVersions.tenantId, tenantId), eq(documentVersions.id, v1.id)));
    expect(updatedV1.lifecycleState).toBe("SUPERSEDED");

    // Verify assignment on v1 transitioned to EXPIRED_SUPERSEDED
    const [expiredAssignment] = await testAdminDb
      .select()
      .from(readAssignments)
      .where(and(eq(readAssignments.tenantId, tenantId), eq(readAssignments.id, assignmentV1.id)));
    expect(expiredAssignment.status).toBe("EXPIRED_SUPERSEDED");

    // Verify DOCUMENT_SUPERSEDED audit log for v1
    const [supLog] = await testAdminDb
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.tenantId, tenantId),
          eq(auditLogs.eventType, "DOCUMENT_SUPERSEDED"),
          eq(auditLogs.entityId, v1.id)
        )
      );
    expect(supLog).toBeDefined();
  });

  // ============================================================================
  // Test 4: Retire PUBLISHED version
  // ============================================================================
  it("transitions a PUBLISHED version to RETIRED and appends DOCUMENT_RETIRED audit log", async () => {
    const [doc] = await testAdminDb
      .insert(documents)
      .values({
        tenantId,
        documentCode: `SOP-RET-${Date.now()}`,
        createdBy: authorUserId,
      })
      .returning();

    const [vPub] = await testAdminDb
      .insert(documentVersions)
      .values({
        tenantId,
        documentId: doc.id,
        versionMajor: 1,
        versionMinor: 0,
        title: "Legacy Testing SOP",
        contentFormat: "MARKDOWN",
        markdownContent: "# Legacy Testing SOP",
        documentSha256: dummySha256,
        lifecycleState: "PUBLISHED",
        authorId: authorUserId,
        rowVersion: 1,
      })
      .returning();

    const retRes = await retireDocumentVersionAction(
      {
        tenantId,
        versionId: vPub.id,
        reason: "Withdrawn due to equipment decommissioning",
      },
      { userId: qmUserId, callerDb: testAppDb }
    );

    expect(retRes.success).toBe(true);
    if (!retRes.success) return;
    expect(retRes.data.lifecycleState).toBe("RETIRED");

    // Verify DB state
    const [retiredVersion] = await testAdminDb
      .select()
      .from(documentVersions)
      .where(and(eq(documentVersions.tenantId, tenantId), eq(documentVersions.id, vPub.id)));
    expect(retiredVersion.lifecycleState).toBe("RETIRED");

    // Verify audit log
    const [retLog] = await testAdminDb
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.tenantId, tenantId),
          eq(auditLogs.eventType, "DOCUMENT_RETIRED"),
          eq(auditLogs.entityId, vPub.id)
        )
      );
    expect(retLog).toBeDefined();
  });

  // ============================================================================
  // Test 5: Acknowledgment Engagement Gate & Digest Verification (BR-ACK-01)
  // ============================================================================
  it("enforces engagement gate (>= 10s dwell & >= 90% scroll) and SHA-256 digest matching", async () => {
    const [doc] = await testAdminDb
      .insert(documents)
      .values({
        tenantId,
        documentCode: `SOP-ACK-${Date.now()}`,
        createdBy: authorUserId,
      })
      .returning();

    const [vPub] = await testAdminDb
      .insert(documentVersions)
      .values({
        tenantId,
        documentId: doc.id,
        versionMajor: 1,
        versionMinor: 0,
        title: "Emergency Evacuation Plan",
        contentFormat: "MARKDOWN",
        markdownContent: "# Emergency Evacuation Plan",
        documentSha256: dummySha256,
        lifecycleState: "PUBLISHED",
        authorId: authorUserId,
        rowVersion: 1,
      })
      .returning();

    const [assignment] = await testAdminDb
      .insert(readAssignments)
      .values({
        tenantId,
        documentVersionId: vPub.id,
        userId: reader1UserId,
        status: "PENDING",
        dueAt: new Date(Date.now() + 86400000 * 7),
      })
      .returning();

    // 1. Fail due to dwell time < 10s
    const failDwell = await acknowledgeDocumentAction(
      {
        tenantId,
        readAssignmentId: assignment.id,
        documentVersionId: vPub.id,
        dwellTimeSeconds: 5,
        maxScrollPercent: 95,
        bindingConfirmation: true,
      },
      { userId: reader1UserId, callerDb: testAppDb }
    );
    expect(failDwell.success).toBe(false);
    if (!failDwell.success) {
      expect(failDwell.error.code).toBe("ENGAGEMENT_THRESHOLD_NOT_MET");
    }

    // 2. Fail due to scroll < 90%
    const failScroll = await acknowledgeDocumentAction(
      {
        tenantId,
        readAssignmentId: assignment.id,
        documentVersionId: vPub.id,
        dwellTimeSeconds: 15,
        maxScrollPercent: 75,
        bindingConfirmation: true,
      },
      { userId: reader1UserId, callerDb: testAppDb }
    );
    expect(failScroll.success).toBe(false);
    if (!failScroll.success) {
      expect(failScroll.error.code).toBe("ENGAGEMENT_THRESHOLD_NOT_MET");
    }

    // 3. Fail due to digest mismatch
    const failDigest = await acknowledgeDocumentAction(
      {
        tenantId,
        readAssignmentId: assignment.id,
        documentVersionId: vPub.id,
        dwellTimeSeconds: 15,
        maxScrollPercent: 95,
        bindingConfirmation: true,
        expectedDocumentSha256: "0000000000000000000000000000000000000000000000000000000000000000",
      },
      { userId: reader1UserId, callerDb: testAppDb }
    );
    expect(failDigest.success).toBe(false);
    if (!failDigest.success) {
      expect(failDigest.error.code).toBe("INTEGRITY_HASH_MISMATCH");
    }

    // 4. Success: Happy path acknowledgment
    const ackRes = await acknowledgeDocumentAction(
      {
        tenantId,
        readAssignmentId: assignment.id,
        documentVersionId: vPub.id,
        dwellTimeSeconds: 15,
        maxScrollPercent: 95,
        bindingConfirmation: true,
        expectedDocumentSha256: dummySha256,
      },
      { userId: reader1UserId, callerDb: testAppDb }
    );
    expect(ackRes.success).toBe(true);
    if (!ackRes.success) return;
    expect(ackRes.data.documentSha256).toBe(dummySha256);

    // Verify assignment status is COMPLETED
    const [updatedAssignment] = await testAdminDb
      .select()
      .from(readAssignments)
      .where(and(eq(readAssignments.tenantId, tenantId), eq(readAssignments.id, assignment.id)));
    expect(updatedAssignment.status).toBe("COMPLETED");

    // Verify read_acknowledgments row created
    const [ackRow] = await testAdminDb
      .select()
      .from(readAcknowledgments)
      .where(
        and(
          eq(readAcknowledgments.tenantId, tenantId),
          eq(readAcknowledgments.readAssignmentId, assignment.id)
        )
      );
    expect(ackRow).toBeDefined();
    expect(ackRow.userId).toBe(reader1UserId);

    // Verify READ_ACKNOWLEDGED audit log
    const [ackLog] = await testAdminDb
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.tenantId, tenantId),
          eq(auditLogs.eventType, "READ_ACKNOWLEDGED"),
          eq(auditLogs.entityId, ackRow.id)
        )
      );
    expect(ackLog).toBeDefined();

    // 5. Idempotent re-acknowledgment
    const duplicateAckRes = await acknowledgeDocumentAction(
      {
        tenantId,
        readAssignmentId: assignment.id,
        documentVersionId: vPub.id,
        dwellTimeSeconds: 20,
        maxScrollPercent: 100,
        bindingConfirmation: true,
      },
      { userId: reader1UserId, callerDb: testAppDb }
    );
    expect(duplicateAckRes.success).toBe(true);
    if (duplicateAckRes.success) {
      expect(duplicateAckRes.data.acknowledgmentId).toBe(ackRow.id);
    }
  });

  // ============================================================================
  // Test 6: My Read Queue Action & Route Handler
  // ============================================================================
  it("fetches the reader queue via action and GET /api/acknowledgments/my-queue", async () => {
    // Reader 2 should have 1 pending assignment from Test 1
    const queueRes = await getMyReadQueueAction(
      { tenantId, status: "PENDING" },
      { userId: reader2UserId, callerDb: testAppDb }
    );

    expect(queueRes.success).toBe(true);
    if (!queueRes.success) return;
    expect(queueRes.data.items.length).toBeGreaterThanOrEqual(1);
    expect(queueRes.data.assignments.length).toBeGreaterThanOrEqual(1);
    expect(queueRes.data.items[0].status).toBe("PENDING");

    // Test Route Handler
    const req = new NextRequest("http://localhost:3000/api/acknowledgments/my-queue?status=PENDING", {
      headers: {
        "x-user-id": reader2UserId,
        "x-tenant-id": tenantId,
      },
    });

    const routeRes = await getMyQueueRoute(req);
    expect(routeRes.status).toBe(200);
    const json = await routeRes.json();
    expect(json.success).toBe(true);
    expect(json.data.items.length).toBeGreaterThanOrEqual(1);
  });

  // ============================================================================
  // Test 7: Governance Dashboard Action & Route Handler
  // ============================================================================
  it("fetches governance dashboard KPIs and rollout breakdown via action and route", async () => {
    const dashRes = await getGovernanceDashboardDataAction(
      { tenantId },
      { userId: qmUserId, callerDb: testAppDb }
    );

    expect(dashRes.success).toBe(true);
    if (!dashRes.success) return;
    expect(dashRes.data.kpis.activeSops).toBeGreaterThan(0);
    expect(dashRes.data.rollouts.length).toBeGreaterThan(0);

    // Test Route Handler as Quality Manager
    const req = new NextRequest("http://localhost:3000/api/dashboard/completion", {
      headers: {
        "x-user-id": qmUserId,
        "x-tenant-id": tenantId,
      },
    });

    const routeRes = await getDashboardCompletionRoute(req);
    expect(routeRes.status).toBe(200);
    const json = await routeRes.json();
    expect(json.success).toBe(true);
    expect(json.data.kpis).toBeDefined();
    expect(json.data.rollouts).toBeDefined();

    // Verify READER is rejected with 403 FORBIDDEN on dashboard route
    const readerReq = new NextRequest("http://localhost:3000/api/dashboard/completion", {
      headers: {
        "x-user-id": reader1UserId,
        "x-tenant-id": tenantId,
      },
    });

    const readerRouteRes = await getDashboardCompletionRoute(readerReq);
    expect(readerRouteRes.status).toBe(403);
  });
});
