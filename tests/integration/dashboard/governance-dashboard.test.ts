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
  getGovernanceDashboardDataAction,
} from "@/server/actions/reader.actions";

describe("Governance Dashboard & Quality KPIs Integration (governance-dashboard.test.ts)", { timeout: 120000 }, () => {
  let tenantId: string;
  let adminUserId: string;
  let qmUserId: string;
  let authorUserId: string;
  let reader1UserId: string;
  let reader2UserId: string;
  let reader3UserId: string;
  let groupId: string;

  const userIds: string[] = [];
  const tenantIds: string[] = [];

  const dummySha256_1 =
    "aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111";
  const dummySha256_2 =
    "bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222";
  const dummySha256_3 =
    "cccc3333cccc3333cccc3333cccc3333cccc3333cccc3333cccc3333cccc3333";

  beforeAll(async () => {
    // 1. Create Workspace
    const [t] = await testAdminDb
      .insert(tenants)
      .values({
        name: "Dashboard KPI Workspace",
        slug: `dash-ws-${Date.now()}`,
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

    // 3. Audience Group
    const [grp] = await testAdminDb
      .insert(audienceGroups)
      .values({
        tenantId,
        name: "Assembly Line 1",
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
  // Test 1: Calculation of the 4 KPIs (Active SOPs, Pending Approvals, Completion %, Overdue count)
  // ============================================================================
  it("accurately calculates the 4 KPIs: activeSops, pendingApprovals, acknowledgmentRatePercent, and overdueAcknowledgments", async () => {
    // Document 1: PUBLISHED with 2 assignments (1 completed, 1 pending in future)
    const [doc1] = await testAdminDb
      .insert(documents)
      .values({
        tenantId,
        documentCode: `SOP-KPI-1-${Date.now()}`,
        category: "Assembly",
        createdBy: authorUserId,
      })
      .returning();

    const [v1] = await testAdminDb
      .insert(documentVersions)
      .values({
        tenantId,
        documentId: doc1.id,
        versionMajor: 1,
        versionMinor: 0,
        title: "Assembly SOP 1",
        contentFormat: "MARKDOWN",
        markdownContent: "# Assembly Instructions",
        documentSha256: dummySha256_1,
        lifecycleState: "APPROVED",
        authorId: authorUserId,
      })
      .returning();

    const pubRes1 = await publishDocumentVersionAction(
      {
        tenantId,
        versionId: v1.id,
        targetGroupIds: [groupId],
        acknowledgmentDueDays: 14,
      },
      { userId: adminUserId, callerDb: testAppDb }
    );
    expect(pubRes1.success).toBe(true);

    // Reader 1 acknowledges Document 1
    const [assign1] = await testAdminDb
      .select()
      .from(readAssignments)
      .where(
        and(
          eq(readAssignments.tenantId, tenantId),
          eq(readAssignments.documentVersionId, v1.id),
          eq(readAssignments.userId, reader1UserId)
        )
      );

    const ackRes = await acknowledgeDocumentAction(
      {
        tenantId,
        readAssignmentId: assign1.id,
        documentVersionId: v1.id,
        dwellTimeSeconds: 15,
        maxScrollPercent: 95,
        bindingConfirmation: true,
        expectedDocumentSha256: dummySha256_1,
      },
      { userId: reader1UserId, callerDb: testAppDb }
    );
    expect(ackRes.success).toBe(true);

    // Document 2: In PENDING_APPROVAL state (contributes to pendingApprovals KPI)
    const [doc2] = await testAdminDb
      .insert(documents)
      .values({
        tenantId,
        documentCode: `SOP-KPI-2-${Date.now()}`,
        category: "Safety",
        createdBy: authorUserId,
      })
      .returning();

    await testAdminDb.insert(documentVersions).values({
      tenantId,
      documentId: doc2.id,
      versionMajor: 0,
      versionMinor: 1,
      title: "Pending Safety Protocol",
      contentFormat: "MARKDOWN",
      markdownContent: "# Pending Review",
      documentSha256: dummySha256_2,
      lifecycleState: "PENDING_APPROVAL",
      authorId: authorUserId,
    });

    // Document 3: PUBLISHED with an OVERDUE assignment (dueAt in the past)
    const [doc3] = await testAdminDb
      .insert(documents)
      .values({
        tenantId,
        documentCode: `SOP-KPI-3-${Date.now()}`,
        category: "Quality",
        createdBy: authorUserId,
      })
      .returning();

    const [v3] = await testAdminDb
      .insert(documentVersions)
      .values({
        tenantId,
        documentId: doc3.id,
        versionMajor: 1,
        versionMinor: 0,
        title: "Overdue Calibration SOP",
        contentFormat: "MARKDOWN",
        markdownContent: "# Calibration Check",
        documentSha256: dummySha256_3,
        lifecycleState: "APPROVED",
        authorId: authorUserId,
      })
      .returning();

    const pubRes3 = await publishDocumentVersionAction(
      {
        tenantId,
        versionId: v3.id,
        targetGroupIds: [groupId],
        acknowledgmentDueDays: 7,
      },
      { userId: adminUserId, callerDb: testAppDb }
    );
    expect(pubRes3.success).toBe(true);

    // Force one of v3's assignments to be in the past (overdue)
    const pastDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // 3 days ago
    await testAdminDb
      .update(readAssignments)
      .set({ dueAt: pastDate })
      .where(
        and(
          eq(readAssignments.tenantId, tenantId),
          eq(readAssignments.documentVersionId, v3.id),
          eq(readAssignments.userId, reader2UserId)
        )
      );

    // Query Governance Dashboard as Quality Manager
    const dashRes = await getGovernanceDashboardDataAction(
      { tenantId },
      { userId: qmUserId, callerDb: testAppDb }
    );

    expect(dashRes.success).toBe(true);
    if (!dashRes.success) return;

    const { kpis } = dashRes.data;

    // 1. Active SOPs: doc1 and doc3 have PUBLISHED versions -> 2
    expect(kpis.activeSops).toBe(2);

    // 2. Pending Approvals: doc2 is PENDING_APPROVAL -> 1
    expect(kpis.pendingApprovals).toBe(1);

    // 3. Overdue Acknowledgments: reader2 on doc3 is past due date -> at least 1
    expect(kpis.overdueAcknowledgments).toBeGreaterThanOrEqual(1);

    // 4. Acknowledgment Rate: 1 completed out of 4 total applicable assignments = 25%
    expect(kpis.acknowledgmentRatePercent).toBe(25);
  });

  // ============================================================================
  // Test 2: Dashboard Filtering & Rollout Breakdown
  // ============================================================================
  it("supports overdueOnly filter and returns accurate rollout breakdown", async () => {
    // Filter with overdueOnly = true
    const overdueRes = await getGovernanceDashboardDataAction(
      { tenantId, overdueOnly: true },
      { userId: qmUserId, callerDb: testAppDb }
    );

    expect(overdueRes.success).toBe(true);
    if (!overdueRes.success) return;

    // Only rollouts with overdue readers should be included
    expect(overdueRes.data.rollouts.length).toBeGreaterThan(0);
    for (const rollout of overdueRes.data.rollouts) {
      expect(rollout.status).toBe("OVERDUE");
    }
  });

  // ============================================================================
  // Test 3: RBAC Enforcement on Governance Dashboard
  // ============================================================================
  it("rejects non-admin/QM roles (READER) with HTTP 403 FORBIDDEN", async () => {
    const readerRes = await getGovernanceDashboardDataAction(
      { tenantId },
      { userId: reader1UserId, callerDb: testAppDb }
    );

    expect(readerRes.success).toBe(false);
    if (!readerRes.success) {
      expect(readerRes.error.code).toBe("FORBIDDEN");
      expect(readerRes.error.status).toBe(403);
    }
  });
});
