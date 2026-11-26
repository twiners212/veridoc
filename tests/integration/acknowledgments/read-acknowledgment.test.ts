import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  tenants,
  users,
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
  acknowledgeDocumentAction,
} from "@/server/actions/reader.actions";

describe("Read Acknowledgment & Engagement Gate Integration (read-acknowledgment.test.ts)", { timeout: 120000 }, () => {
  let tenantId: string;
  let adminUserId: string;
  let authorUserId: string;
  let reader1UserId: string;
  let reader2UserId: string;
  let groupId: string;
  let publishedVersionId: string;
  let documentCode: string;

  const userIds: string[] = [];
  const tenantIds: string[] = [];

  const canonicalSha256 =
    "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
  const mismatchedSha256 =
    "9999999999999999999999999999999999999999999999999999999999999999";

  beforeAll(async () => {
    // 1. Create Workspace
    const [t] = await testAdminDb
      .insert(tenants)
      .values({
        name: "Read Acknowledgment Workspace",
        slug: `read-ack-ws-${Date.now()}`,
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
    authorUserId = await createUser("Document Author", "author", "DOCUMENT_AUTHOR");
    reader1UserId = await createUser("Reader One", "reader1", "READER");
    reader2UserId = await createUser("Reader Two", "reader2", "READER");

    // 3. Audience Group
    const [grp] = await testAdminDb
      .insert(audienceGroups)
      .values({
        tenantId,
        name: "Packaging Floor Operators",
        groupType: "DEPARTMENT",
      })
      .returning();
    groupId = grp.id;

    await testAdminDb.insert(audienceGroupMembers).values([
      { tenantId, groupId, userId: reader1UserId },
      { tenantId, groupId, userId: reader2UserId },
    ]);

    // 4. Create & Publish Document Version
    documentCode = `SOP-ACK-${Date.now()}`;
    const [doc] = await testAdminDb
      .insert(documents)
      .values({
        tenantId,
        documentCode,
        category: "Packaging",
        createdBy: authorUserId,
      })
      .returning();

    const [ver] = await testAdminDb
      .insert(documentVersions)
      .values({
        tenantId,
        documentId: doc.id,
        versionMajor: 1,
        versionMinor: 0,
        title: "Automated Packaging Line Safety SOP",
        contentFormat: "MARKDOWN",
        markdownContent: "# Automated Packaging Line Safety SOP\n\nFollow lockout/tagout rules.",
        documentSha256: canonicalSha256,
        lifecycleState: "APPROVED",
        authorId: authorUserId,
      })
      .returning();

    publishedVersionId = ver.id;

    const pubRes = await publishDocumentVersionAction(
      {
        tenantId,
        versionId: publishedVersionId,
        targetGroupIds: [groupId],
        acknowledgmentDueDays: 14,
      },
      { userId: adminUserId, callerDb: testAppDb }
    );
    expect(pubRes.success).toBe(true);
  });

  afterAll(async () => {
    await cleanupTestTenants(tenantIds);
    await cleanupTestUsers(userIds);
  });

  // ============================================================================
  // Test 1: Engagement Gate Enforcement (< 10s dwell OR < 90% scroll depth)
  // ============================================================================
  it("rejects acknowledgment with HTTP 422 ENGAGEMENT_THRESHOLD_NOT_MET if dwellTime < 10s or scroll < 90%", async () => {
    // Find reader1's assignment
    const [assignment] = await testAdminDb
      .select()
      .from(readAssignments)
      .where(
        and(
          eq(readAssignments.tenantId, tenantId),
          eq(readAssignments.documentVersionId, publishedVersionId),
          eq(readAssignments.userId, reader1UserId)
        )
      );
    expect(assignment).toBeDefined();

    // 1. Dwell time < 10s (e.g., 5 seconds with 95% scroll)
    const lowDwellRes = await acknowledgeDocumentAction(
      {
        tenantId,
        readAssignmentId: assignment.id,
        documentVersionId: publishedVersionId,
        dwellTimeSeconds: 5,
        maxScrollPercent: 95,
        bindingConfirmation: true,
        expectedDocumentSha256: canonicalSha256,
      },
      { userId: reader1UserId, callerDb: testAppDb }
    );

    expect(lowDwellRes.success).toBe(false);
    if (!lowDwellRes.success) {
      expect(lowDwellRes.error.code).toBe("ENGAGEMENT_THRESHOLD_NOT_MET");
      expect(lowDwellRes.error.status).toBe(422);
      expect(lowDwellRes.error.message).toContain("requires minimum 10 seconds dwell time");
    }

    // 2. Scroll percent < 90% (e.g., 80% scroll with 15s dwell)
    const lowScrollRes = await acknowledgeDocumentAction(
      {
        tenantId,
        readAssignmentId: assignment.id,
        documentVersionId: publishedVersionId,
        dwellTimeSeconds: 15,
        maxScrollPercent: 80,
        bindingConfirmation: true,
        expectedDocumentSha256: canonicalSha256,
      },
      { userId: reader1UserId, callerDb: testAppDb }
    );

    expect(lowScrollRes.success).toBe(false);
    if (!lowScrollRes.success) {
      expect(lowScrollRes.error.code).toBe("ENGAGEMENT_THRESHOLD_NOT_MET");
      expect(lowScrollRes.error.status).toBe(422);
    }

    // 3. Assignment remains PENDING
    const [assignmentAfter] = await testAdminDb
      .select()
      .from(readAssignments)
      .where(eq(readAssignments.id, assignment.id));
    expect(assignmentAfter.status).toBe("PENDING");
  });

  // ============================================================================
  // Test 2: Integrity Digest Mismatch Enforcement (DEC-06)
  // ============================================================================
  it("rejects acknowledgment with HTTP 422 INTEGRITY_HASH_MISMATCH if expectedDocumentSha256 != version.documentSha256", async () => {
    const [assignment] = await testAdminDb
      .select()
      .from(readAssignments)
      .where(
        and(
          eq(readAssignments.tenantId, tenantId),
          eq(readAssignments.documentVersionId, publishedVersionId),
          eq(readAssignments.userId, reader1UserId)
        )
      );

    const mismatchRes = await acknowledgeDocumentAction(
      {
        tenantId,
        readAssignmentId: assignment.id,
        documentVersionId: publishedVersionId,
        dwellTimeSeconds: 15,
        maxScrollPercent: 95,
        bindingConfirmation: true,
        expectedDocumentSha256: mismatchedSha256,
      },
      { userId: reader1UserId, callerDb: testAppDb }
    );

    expect(mismatchRes.success).toBe(false);
    if (!mismatchRes.success) {
      expect(mismatchRes.error.code).toBe("INTEGRITY_HASH_MISMATCH");
      expect(mismatchRes.error.status).toBe(422);
      expect(mismatchRes.error.message).toContain("integrity hash mismatch");
    }
  });

  // ============================================================================
  // Test 3: Happy Path Acknowledgment (BR-ACK-01)
  // ============================================================================
  it("executes happy path acknowledgment (BR-ACK-01): records immutable read_acknowledgments and marks assignment COMPLETED", async () => {
    const [assignment] = await testAdminDb
      .select()
      .from(readAssignments)
      .where(
        and(
          eq(readAssignments.tenantId, tenantId),
          eq(readAssignments.documentVersionId, publishedVersionId),
          eq(readAssignments.userId, reader1UserId)
        )
      );

    const ackRes = await acknowledgeDocumentAction(
      {
        tenantId,
        readAssignmentId: assignment.id,
        documentVersionId: publishedVersionId,
        dwellTimeSeconds: 18,
        maxScrollPercent: 95,
        bindingConfirmation: true,
        expectedDocumentSha256: canonicalSha256,
      },
      { userId: reader1UserId, callerDb: testAppDb }
    );

    expect(ackRes.success).toBe(true);
    if (!ackRes.success) return;

    expect(ackRes.data.acknowledgmentId).toBeDefined();
    expect(ackRes.data.readAssignmentId).toBe(assignment.id);
    expect(ackRes.data.documentVersionId).toBe(publishedVersionId);
    expect(ackRes.data.documentSha256).toBe(canonicalSha256);
    expect(ackRes.data.dwellTimeSeconds).toBe(18);
    expect(ackRes.data.maxScrollPercent).toBe(95);

    // Verify assignment status transitioned to COMPLETED
    const [assignmentCompleted] = await testAdminDb
      .select()
      .from(readAssignments)
      .where(eq(readAssignments.id, assignment.id));
    expect(assignmentCompleted.status).toBe("COMPLETED");

    // Verify read_acknowledgments row inserted in DB
    const [ackInDb] = await testAdminDb
      .select()
      .from(readAcknowledgments)
      .where(
        and(
          eq(readAcknowledgments.tenantId, tenantId),
          eq(readAcknowledgments.id, ackRes.data.acknowledgmentId)
        )
      );

    expect(ackInDb).toBeDefined();
    expect(ackInDb.userId).toBe(reader1UserId);
    expect(ackInDb.documentSha256).toBe(canonicalSha256);
    expect(ackInDb.dwellTimeSeconds).toBe(18);
    expect(ackInDb.maxScrollPercent).toBe(95);

    // Verify READ_ACKNOWLEDGED audit log
    const [ackAudit] = await testAdminDb
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.tenantId, tenantId),
          eq(auditLogs.entityId, ackRes.data.acknowledgmentId),
          eq(auditLogs.eventType, "READ_ACKNOWLEDGED")
        )
      );

    expect(ackAudit).toBeDefined();
    expect(ackAudit.actorUserId).toBe(reader1UserId);
  });

  // ============================================================================
  // Test 4: Idempotent Acknowledgment Behavior
  // ============================================================================
  it("handles duplicate acknowledgment requests idempotently without error", async () => {
    const [assignment] = await testAdminDb
      .select()
      .from(readAssignments)
      .where(
        and(
          eq(readAssignments.tenantId, tenantId),
          eq(readAssignments.documentVersionId, publishedVersionId),
          eq(readAssignments.userId, reader1UserId)
        )
      );

    // Second call for the same assignment that is already COMPLETED
    const duplicateAckRes = await acknowledgeDocumentAction(
      {
        tenantId,
        readAssignmentId: assignment.id,
        documentVersionId: publishedVersionId,
        dwellTimeSeconds: 25,
        maxScrollPercent: 100,
        bindingConfirmation: true,
        expectedDocumentSha256: canonicalSha256,
      },
      { userId: reader1UserId, callerDb: testAppDb }
    );

    expect(duplicateAckRes.success).toBe(true);
    if (!duplicateAckRes.success) return;

    // Must return the existing acknowledgment ID
    const acks = await testAdminDb
      .select()
      .from(readAcknowledgments)
      .where(
        and(
          eq(readAcknowledgments.tenantId, tenantId),
          eq(readAcknowledgments.readAssignmentId, assignment.id)
        )
      );

    // Exactly one acknowledgment record exists
    expect(acks.length).toBe(1);
    expect(duplicateAckRes.data.acknowledgmentId).toBe(acks[0].id);
  });
});
